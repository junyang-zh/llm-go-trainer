import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { AnalysisEngine, AnalysisOptions, EngineController } from './engine';
import type { EngineConnection, EngineStatus, Game, Training } from '../shared/types';
import { ensureRuntime, prepareConfig, type InstallProgress, type Runtime } from './installer';
import { KataGo, type EngineConfig } from './katago';
import { ExternalEngine, validateEngineUrl } from './external-engine';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';

export const connectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('managed') }),
  z.object({
    mode: z.literal('external'),
    name: z.string().trim().min(1).max(60),
    url: z
      .string()
      .url()
      .max(2000)
      .transform((value, context) => {
        try {
          return validateEngineUrl(value);
        } catch (error) {
          context.addIssue({ code: 'custom', message: (error as Error).message });
          return z.NEVER;
        }
      }),
  }),
]);
interface Options {
  root: string;
  directory: string;
  configured?: EngineConfig;
  install?: (signal: AbortSignal, progress: (state: InstallProgress) => void) => Promise<Runtime>;
  factory?: (config: EngineConfig) => KataGo;
}
export class EngineManager implements AnalysisEngine, EngineController {
  private selected: EngineConnection = { mode: 'managed' };
  private state: EngineStatus = {
    configured: false,
    running: false,
    ready: false,
    humanModel: false,
    phase: 'idle',
    mode: 'managed',
    name: 'KataGo',
  };
  private engine?: AnalysisEngine;
  private task?: Promise<void>;
  private controller?: AbortController;
  private transition: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private options: Options) {}
  status(): EngineStatus {
    const live = this.engine?.status();
    if (this.state.phase === 'ready' && live && !live.running)
      this.state = {
        ...this.state,
        phase: 'error',
        ready: false,
        error: live.error || '引擎进程已退出',
      };
    return {
      ...this.state,
      running: live?.running ?? false,
      pid: live?.pid,
      humanModel: live?.humanModel ?? false,
    };
  }
  connection() {
    return this.selected;
  }
  async load() {
    try {
      this.selected = connectionSchema.parse(
        JSON.parse(await readFile(join(this.options.directory, 'connection.json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.state.error = '引擎连接配置无效，已使用内置 KataGo';
    }
    await this.start();
  }
  private enqueue(work: () => Promise<void>) {
    const result = this.transition.then(work);
    this.transition = result.catch(() => {});
    return result;
  }
  start() {
    return this.enqueue(() => this.startSelected());
  }
  private async startSelected() {
    if (!this.closed && !this.task && !this.status().ready) {
      if (this.engine) await this.halt();
      this.launch();
    }
  }
  private launch() {
    const controller = new AbortController();
    this.controller = controller;
    this.state = {
      configured: false,
      running: false,
      ready: false,
      humanModel: false,
      phase: 'starting',
      mode: this.selected.mode,
      name: this.selected.mode === 'external' ? this.selected.name : 'KataGo',
    };
    this.task = (async () => {
      try {
        if (this.selected.mode === 'external') {
          this.engine = new ExternalEngine(this.selected);
          await this.engine.analyze(
            newGame(19),
            { ...trainingForRank('5k'), visits: 50 },
            { signal: controller.signal },
          );
        } else {
          const runtime = this.options.configured
            ? {
                config: {
                  ...this.options.configured,
                  config: await prepareConfig(
                    this.options.configured.config,
                    this.options.directory,
                  ),
                },
                backend: '自定义',
              }
            : await (this.options.install?.(controller.signal, (value) =>
                Object.assign(this.state, value),
              ) ??
                ensureRuntime(
                  this.options.root,
                  this.options.directory,
                  controller.signal,
                  (value) => Object.assign(this.state, value),
                ));
          controller.signal.throwIfAborted();
          this.state = {
            ...this.state,
            configured: true,
            phase: 'starting',
            progress: undefined,
            backend: runtime.backend,
          };
          const engine = (this.options.factory ?? ((config) => new KataGo(config)))(runtime.config);
          this.engine = engine;
          await engine.initialize(controller.signal);
        }
        controller.signal.throwIfAborted();
        this.state = {
          ...this.state,
          configured: true,
          ready: true,
          phase: 'ready',
          progress: undefined,
          error: undefined,
        };
      } catch (error) {
        await this.engine?.close();
        this.engine = undefined;
        if (!controller.signal.aborted)
          this.state = {
            ...this.state,
            ready: false,
            phase: 'error',
            progress: undefined,
            error: error instanceof Error ? error.message : '引擎启动失败',
          };
      } finally {
        this.task = undefined;
      }
    })();
  }
  private async halt() {
    this.state = { ...this.state, ready: false, phase: 'stopping', progress: undefined };
    this.controller?.abort();
    await this.engine?.close();
    await this.task;
    this.engine = undefined;
    this.state = {
      ...this.state,
      configured: false,
      running: false,
      ready: false,
      humanModel: false,
      phase: 'stopped',
      error: undefined,
      pid: undefined,
    };
  }
  stop() {
    return this.enqueue(() => this.halt());
  }
  restart() {
    return this.enqueue(async () => {
      await this.halt();
      if (!this.closed) this.launch();
    });
  }
  connect(input: EngineConnection) {
    const connection = connectionSchema.parse(input);
    return this.enqueue(async () => {
      // Selecting the current connection is idempotent. Only an explicit restart replaces it.
      if (JSON.stringify(connection) === JSON.stringify(this.selected)) {
        await this.startSelected();
        return;
      }
      await mkdir(this.options.directory, { recursive: true });
      const path = join(this.options.directory, 'connection.json');
      await writeFile(path + '.tmp', JSON.stringify(connection));
      await rename(path + '.tmp', path);
      await this.halt();
      this.selected = connection;
      if (!this.closed) this.launch();
    });
  }
  async analyze(game: Game, training: Training, options?: AnalysisOptions) {
    if (!this.status().ready || !this.engine)
      throw new Error(
        this.state.error || (this.state.phase === 'stopped' ? '引擎已停止' : '引擎初始化中'),
      );
    return this.engine.analyze(game, training, options);
  }
  async close() {
    this.closed = true;
    await this.stop();
  }
}
