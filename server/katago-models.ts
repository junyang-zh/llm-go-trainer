import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { KataGoModel, ModelEntry, ModelSelection, ModelsView } from '../shared/models';
import {
  customModelSchema,
  defaultModels,
  officialModels,
  selectionSchema,
} from './katago-catalog';
import { ensureModel, modelFilename } from './model-files';
import { verified } from './download';
import { installLock } from './installer';

const savedModel = customModelSchema.extend({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(2_000_000_000).optional(),
  architecture: z.string().max(80),
  description: z.string().max(400),
  source: z.string().url().max(2000),
});
type Job = { controller: AbortController; task: Promise<void>; started: boolean };
export class KataGoModels {
  private catalog = new Map<string, KataGoModel>();
  private entries = new Map<string, ModelEntry>();
  private selected: ModelSelection;
  private pending?: ModelSelection;
  private jobs = new Map<string, Job>();
  private downloads: Promise<void> = Promise.resolve();
  private mutations: Promise<unknown> = Promise.resolve();
  private refreshing?: Promise<void>;
  private refreshController?: AbortController;
  private catalogUpdatedAt?: string;
  private notice?: string;
  private closed = false;
  constructor(
    readonly directory: string,
    private options: { catalog?: KataGoModel[]; bundledModels?: string; canSelect?: boolean } = {},
  ) {
    for (const model of options.catalog ?? defaultModels) this.add(model);
    const models = [...this.catalog.values()];
    this.selected = {
      main:
        models.find((model) => model.tier === 'balanced')?.id ??
        models.find((model) => model.role === 'main')!.id,
      human: models.find((model) => model.role === 'human')?.id ?? null,
    };
  }
  private add(model: KataGoModel) {
    if (this.catalog.has(model.id)) return;
    this.catalog.set(model.id, model);
    this.entries.set(model.id, { ...model, installed: false, diskBytes: 0, phase: 'missing' });
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = this.mutations.then(work);
    this.mutations = task.catch(() => {});
    return task;
  }
  private model(id: string) {
    const model = this.catalog.get(id);
    if (!model) throw new Error('模型不存在，请刷新模型列表');
    return model;
  }
  path(id: string) {
    return join(this.directory, 'models', modelFilename(this.model(id)));
  }
  selection() {
    return { ...this.selected };
  }
  artifacts(selection = this.selected) {
    return {
      main: this.model(selection.main),
      human: selection.human ? this.model(selection.human) : undefined,
    };
  }
  private async save(selection = this.selected) {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, 'models.json');
    // Persist known descriptors too so app upgrades never silently replace the selected model.
    await writeFile(
      path + '.tmp',
      JSON.stringify({
        version: 1,
        selected: selection,
        models: [...this.catalog.values()],
        catalogUpdatedAt: this.catalogUpdatedAt,
      }),
    );
    await rename(path + '.tmp', path);
  }
  async load() {
    try {
      const raw = z
        .object({
          version: z.literal(1),
          selected: selectionSchema,
          models: z.array(savedModel).max(1500),
          catalogUpdatedAt: z.string().optional(),
        })
        .parse(JSON.parse(await readFile(join(this.directory, 'models.json'), 'utf8')));
      for (const model of raw.models) {
        if (model.id !== model.sha256) throw new Error('模型摘要无效');
        this.add({ ...model, tier: model.role === 'human' ? 'human' : 'other' });
      }
      this.validateSelection(raw.selected);
      this.selected = raw.selected;
      this.catalogUpdatedAt = raw.catalogUpdatedAt;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.notice = '模型设置读取失败，已恢复默认选择；已下载的文件仍保留。';
    }
    await this.scan();
    await this.save();
  }
  async scan() {
    for (const model of this.catalog.values()) {
      if (this.jobs.has(model.id)) continue;
      const path = this.path(model.id);
      const installed = await verified(path, model.sha256);
      const diskBytes = (await stat(path).catch(() => undefined))?.size ?? 0;
      if (this.jobs.has(model.id)) continue;
      this.entries.set(model.id, {
        ...model,
        installed,
        diskBytes,
        phase: installed ? 'installed' : 'missing',
      });
    }
  }
  view(): ModelsView {
    const models = [...this.entries.values()].map((entry) => ({ ...entry }));
    return {
      models,
      selected: this.selection(),
      pending: this.pending && { ...this.pending },
      storageBytes: models.reduce((sum, model) => sum + model.diskBytes, 0),
      catalogUpdatedAt: this.catalogUpdatedAt,
      notice: this.notice,
      canSelect: this.options.canSelect !== false,
    };
  }
  async cachedSelection() {
    const { main, human } = this.artifacts();
    return (
      await Promise.all(
        [main, ...(human ? [human] : [])].map((model) =>
          verified(this.path(model.id), model.sha256),
        ),
      )
    ).every(Boolean);
  }
  async hasCachedModels() {
    for (const model of this.catalog.values())
      if (await verified(this.path(model.id), model.sha256)) return true;
    return false;
  }
  private validateSelection(selection: ModelSelection) {
    if (
      this.model(selection.main).role !== 'main' ||
      (selection.human && this.model(selection.human).role !== 'human')
    )
      throw new Error('请选择主分析模型及可选的 HumanSL 模型');
    const { main, human } = this.artifacts(selection);
    if (human && !main.boards.some((size) => human.boards.includes(size)))
      throw new Error('主模型与 HumanSL 模型没有共同支持的棋盘尺寸');
  }
  async reserve(input: unknown) {
    return this.enqueue(async () => {
      if (this.closed) throw new Error('模型管理已关闭');
      if (this.options.canSelect === false)
        throw new Error('当前使用 .env 自定义引擎，请先移除 KATAGO_MODEL 配置再选择托管模型');
      if (this.pending) throw new Error('正在切换模型，请稍候');
      const selection = selectionSchema.parse(input);
      this.validateSelection(selection);
      const { main, human } = this.artifacts(selection);
      for (const model of [main, ...(human ? [human] : [])]) {
        if (this.jobs.has(model.id) || !(await verified(this.path(model.id), model.sha256)))
          throw new Error(`请先下载并校验 ${model.name}`);
      }
      this.pending = selection;
      return selection;
    });
  }
  async commit(selection: ModelSelection) {
    await this.enqueue(async () => {
      await this.save(selection);
      this.selected = { ...selection };
    });
  }
  release() {
    this.pending = undefined;
  }
  download(id: string) {
    if (this.closed) throw new Error('模型管理已关闭');
    const model = this.model(id);
    if (this.jobs.has(id) || this.entries.get(id)?.installed) return;
    const controller = new AbortController();
    const job: Job = { controller, task: Promise.resolve(), started: false };
    this.entries.set(id, {
      ...model,
      installed: false,
      diskBytes: this.entries.get(id)?.diskBytes ?? 0,
      phase: 'queued',
      received: 0,
      total: model.bytes,
    });
    const task = this.downloads
      .then(async () => {
        if (this.jobs.get(id) !== job) return;
        job.started = true;
        let unlock: (() => Promise<void>) | undefined;
        try {
          controller.signal.throwIfAborted();
          await mkdir(this.directory, { recursive: true });
          unlock = await installLock(this.directory, controller.signal);
          this.entries.get(id)!.phase = 'downloading';
          const path = await ensureModel(
            model,
            this.directory,
            this.options.bundledModels ?? process.env.GO_TRAINER_BUNDLED_MODELS,
            controller.signal,
            (progress) => {
              Object.assign(this.entries.get(id)!, {
                received: progress.received,
                total: progress.total ?? model.bytes,
              });
            },
          );
          // No duplicate model payload in the download cache after installation.
          await rm(join(this.directory, 'downloads', model.sha256), { force: true });
          this.entries.set(id, {
            ...model,
            installed: true,
            diskBytes: (await stat(path)).size,
            phase: 'installed',
          });
        } catch (error) {
          Object.assign(this.entries.get(id)!, {
            phase: controller.signal.aborted ? 'canceled' : 'error',
            error: controller.signal.aborted
              ? undefined
              : error instanceof Error
                ? error.message
                : '下载失败',
          });
        } finally {
          await unlock?.();
        }
      })
      .finally(() => {
        if (this.jobs.get(id) === job) this.jobs.delete(id);
      });
    job.task = task;
    this.jobs.set(id, job);
    this.downloads = task.catch(() => {});
  }
  async cancel(id: string) {
    const job = this.jobs.get(id);
    job?.controller.abort();
    if (job && !job.started) {
      this.jobs.delete(id);
      this.entries.get(id)!.phase = 'canceled';
      return;
    }
    await job?.task;
  }
  remove(id: string) {
    return this.enqueue(async () => {
      this.model(id);
      if (
        [this.selected.main, this.selected.human, this.pending?.main, this.pending?.human].includes(
          id,
        )
      )
        throw new Error('不能删除已选用或正在切换的模型，请先选择其他模型');
      await this.cancel(id);
      await mkdir(this.directory, { recursive: true });
      const unlock = await installLock(this.directory, new AbortController().signal);
      try {
        await rm(this.path(id), { force: true });
        await rm(join(this.directory, 'downloads', id), { force: true });
        await rm(join(this.directory, 'downloads', id + '.part'), { force: true });
        this.entries.set(id, {
          ...this.model(id),
          installed: false,
          diskBytes: 0,
          phase: 'missing',
        });
      } finally {
        await unlock();
      }
    });
  }
  addCustom(input: unknown) {
    return this.enqueue(async () => {
      const data = customModelSchema.parse(input);
      const model: KataGoModel = {
        ...data,
        id: data.sha256,
        tier: data.role === 'human' ? 'human' : 'other',
        architecture: '自定义',
        description: '手动添加的模型；兼容性将在切换时通过真实分析验证。',
        source: data.url,
      };
      const existed = this.catalog.has(model.id);
      if (!existed && this.catalog.size >= 1500) throw new Error('模型目录已达到容量上限');
      this.add(model);
      try {
        await this.save();
      } catch (error) {
        if (!existed) {
          this.catalog.delete(model.id);
          this.entries.delete(model.id);
        }
        throw error;
      }
      return model.id;
    });
  }
  refresh(page = 1) {
    if (this.closed) return Promise.reject(new Error('模型管理已关闭'));
    if (this.refreshing) return this.refreshing;
    const controller = new AbortController();
    this.refreshController = controller;
    this.refreshing = officialModels(page, controller.signal)
      .then((models) =>
        this.enqueue(async () => {
          for (const model of models) if (this.catalog.size < 1500) this.add(model);
          this.catalogUpdatedAt = new Date().toISOString();
          await this.save();
          await this.scan();
        }),
      )
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }
  async close() {
    this.closed = true;
    this.refreshController?.abort();
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled([...this.jobs.values()].map((job) => job.task));
    await this.refreshing?.catch(() => {});
    await this.mutations;
  }
}
