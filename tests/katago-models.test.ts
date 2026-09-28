import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { KataGoModels } from '../server/katago-models';
import { EngineManager } from '../server/engine-manager';
import { KataGo } from '../server/katago';
import { modelFixtures, fixtureCatalog } from './fixtures/model-library';
import { validateModelUrl } from '../server/katago-catalog';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';

const [main, light, human] = fixtureCatalog;
const stores: KataGoModels[] = [],
  directories: string[] = [],
  engines: EngineManager[] = [];
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'go-models-'));
  directories.push(directory);
  const bundled = join(directory, 'bundled');
  await mkdir(bundled);
  for (const fixture of modelFixtures)
    await writeFile(join(bundled, fixture.model.id + '.bin.gz'), fixture.bytes);
  const models = new KataGoModels(directory, { catalog: fixtureCatalog, bundledModels: bundled });
  stores.push(models);
  await models.load();
  return { models, directory, bundled };
}
async function download(models: KataGoModels, id: string) {
  models.download(id);
  await vi.waitFor(() =>
    expect(models.view().models.find((model) => model.id === id)?.phase).toBe('installed'),
  );
}
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()));
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
  vi.unstubAllGlobals();
});
it('reuses downloaded models offline, persists selection, and protects active files', async () => {
  const { models, directory, bundled } = await setup();
  const fetch = vi.fn(() => {
    throw Error('Network should not be used');
  });
  vi.stubGlobal('fetch', fetch);
  await download(models, main.id);
  await download(models, human.id);
  expect(await models.cachedSelection()).toBe(true);
  await expect(models.remove(main.id)).rejects.toThrow('不能删除');
  await download(models, light.id);
  const selection = await models.reserve({ main: light.id, human: null });
  await expect(models.remove(light.id)).rejects.toThrow('不能删除');
  await models.commit(selection);
  models.release();
  await models.remove(main.id);
  expect(models.view().models.find((model) => model.id === main.id)?.installed).toBe(false);
  await rm(bundled, { recursive: true });
  const nextDefault = {
    ...main,
    id: 'c'.repeat(64),
    sha256: 'c'.repeat(64),
    name: 'new-version-default',
  };
  const restored = new KataGoModels(directory, { catalog: [nextDefault, human] });
  stores.push(restored);
  await restored.load();
  expect(restored.selection()).toEqual({ main: light.id, human: null });
  expect(await restored.cachedSelection()).toBe(true);
  restored.download(light.id);
  expect(fetch).not.toHaveBeenCalled();
});
it('recognizes existing cache files and refuses corrupted or missing selections', async () => {
  const { models, directory } = await setup();
  await mkdir(join(directory, 'models'));
  await writeFile(models.path(main.id), modelFixtures[0].bytes);
  await models.scan();
  expect(models.view().models[0].installed).toBe(true);
  expect(await models.cachedSelection()).toBe(false);
  expect(await models.hasCachedModels()).toBe(true);
  await expect(models.reserve({ main: light.id, human: null })).rejects.toThrow('请先下载');
  await writeFile(models.path(main.id), 'corrupted');
  expect(await models.cachedSelection()).toBe(false);
  expect(await models.hasCachedModels()).toBe(false);
  await expect(models.reserve({ main: main.id, human: null })).rejects.toThrow('校验');
  expect(models.view().pending).toBeUndefined();
});
it('preserves the text model extension required by KataGo when installing and restoring', async () => {
  const { directory, bundled } = await setup();
  const model = { ...main, url: main.url.replace('.bin.gz', '.txt.gz') };
  await writeFile(join(bundled, model.id + '.txt.gz'), modelFixtures[0].bytes);
  const data = join(directory, 'text-runtime');
  const store = new KataGoModels(data, { catalog: [model], bundledModels: bundled });
  stores.push(store);
  await store.load();
  await download(store, model.id);
  expect(store.path(model.id)).toMatch(/\.txt\.gz$/);
  expect(await readFile(store.path(model.id))).toEqual(modelFixtures[0].bytes);
  expect(await store.cachedSelection()).toBe(true);
  const restored = new KataGoModels(data, { catalog: [model] });
  stores.push(restored);
  await restored.load();
  expect(restored.view().models[0].installed).toBe(true);
});
it('cancels queued downloads immediately and supports retry without starting canceled work', async () => {
  const { models, bundled } = await setup();
  await rm(bundled, { recursive: true });
  const fetch = vi.fn(
    (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  vi.stubGlobal('fetch', fetch);
  models.download(light.id);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  models.download(main.id);
  expect(models.view().models.find((model) => model.id === main.id)?.phase).toBe('queued');
  await models.cancel(main.id);
  expect(models.view().models.find((model) => model.id === main.id)?.phase).toBe('canceled');
  await models.cancel(light.id);
  expect(fetch).toHaveBeenCalledTimes(1);
  await mkdir(bundled);
  await writeFile(join(bundled, main.id + '.bin.gz'), modelFixtures[0].bytes);
  await download(models, main.id);
});
it('keeps failed downloads out of the installed list and retries from verified bundled data', async () => {
  const { models, bundled } = await setup();
  await writeFile(join(bundled, light.id + '.bin.gz'), 'wrong bytes');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const response = new Response('wrong bytes');
      Object.defineProperty(response, 'url', { value: light.url });
      return response;
    }),
  );
  models.download(light.id);
  await vi.waitFor(
    () => expect(models.view().models.find((model) => model.id === light.id)?.phase).toBe('error'),
    { timeout: 5000 },
  );
  expect(models.view().models.find((model) => model.id === light.id)?.installed).toBe(false);
  await writeFile(join(bundled, light.id + '.bin.gz'), modelFixtures[1].bytes);
  await download(models, light.id);
});
it('validates imported descriptors and never downloads executable or private-host URLs', async () => {
  const { models } = await setup();
  for (const url of [
    'http://127.0.0.1/model.bin.gz',
    'https://127.0.0.1/model.bin.gz',
    'https://media.katagotraining.org.evil.test/model.bin.gz',
    'https://github.com/lightvector/KataGo/releases/download/v1/a.exe',
    'https://user:secret@media.katagotraining.org/uploaded/networks/a.bin.gz',
  ])
    expect(() => validateModelUrl(url)).toThrow();
  await expect(models.addCustom({ ...light, sha256: '../escape' })).rejects.toThrow();
  await models.addCustom(light);
  expect(models.view().models.filter((model) => model.id === light.id)).toHaveLength(1);
  await expect(models.reserve({ main: human.id, human: null })).rejects.toThrow('主分析模型');
});
it('only saves a model switch after real transport readiness and preserves selection on failure', async () => {
  const { models, directory } = await setup();
  for (const model of fixtureCatalog) await download(models, model.id);
  let failCandidate = true;
  const script = resolve('tests/fixtures/fake-katago.mjs');
  const manager = new EngineManager({
    root: process.cwd(),
    directory,
    models,
    install: async () => ({
      backend: 'test',
      config: { executable: process.execPath, model: script, config: script, timeout: 3000 },
    }),
    factory: (config) =>
      new KataGo({
        ...config,
        prefixArgs: [
          models.view().pending && failCandidate
            ? resolve('tests/fixtures/failed-start-katago.mjs')
            : script,
        ],
      }),
  });
  engines.push(manager);
  await manager.load();
  await vi.waitFor(() => expect(manager.status().ready).toBe(true));
  await manager.selectModels({ main: light.id, human: null });
  await vi.waitFor(() => expect(manager.status().phase).toBe('error'));
  expect(models.selection()).toEqual({ main: main.id, human: human.id });
  expect(models.view().pending).toBeUndefined();
  failCandidate = false;
  await manager.selectModels({ main: light.id, human: null });
  await vi.waitFor(() => expect(manager.status().ready).toBe(true));
  expect(models.selection()).toEqual({ main: light.id, human: null });
  expect(JSON.parse(await readFile(join(directory, 'models.json'), 'utf8')).selected.main).toBe(
    light.id,
  );
  expect((await manager.analyze(newGame(19), trainingForRank('5k'))).perspective).toBe('B');
});
