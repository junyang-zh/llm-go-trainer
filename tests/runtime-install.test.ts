import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensureRuntime, runtimePlatform } from '../server/installer';
import artifacts from '../config/katago/artifacts.json';
import { zip } from './fixtures/archive';

// Only test fixtures replace engine/model bytes. No process is spawned in these tests.
vi.mock('../config/katago/artifacts.json', async () => {
  const { createHash } = await import('node:crypto');
  const { zip } = await import('./fixtures/archive');
  const artifact = (name: string, data: Buffer | string) => ({
    name,
    url: `https://example.invalid/${name}`,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
  return {
    default: {
      revision: 'offline-test',
      windows: artifact('KataGo', zip('bin/katago.exe')),
      main: artifact('main', 'main model fixture'),
      human: artifact('human', 'human model fixture'),
    },
  };
});

let directory: string | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('installs and repairs Windows standard from bundled files with networking disabled', async () => {
  directory = await mkdtemp(join(tmpdir(), 'go-offline-install-'));
  const runtimeBundle = join(directory, 'resources/katago-runtime');
  const modelsBundle = join(directory, 'resources/katago-models');
  await mkdir(runtimeBundle, { recursive: true });
  await mkdir(modelsBundle, { recursive: true });
  await writeFile(join(runtimeBundle, artifacts.windows.sha256), zip('bin/katago.exe'));
  await writeFile(join(modelsBundle, `${artifacts.main.sha256}.bin.gz`), 'main model fixture');
  await writeFile(join(modelsBundle, `${artifacts.human.sha256}.bin.gz`), 'human model fixture');
  vi.stubEnv('GO_TRAINER_BUNDLED_RUNTIME', runtimeBundle);
  vi.stubEnv('GO_TRAINER_BUNDLED_MODELS', modelsBundle);
  const fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
  vi.stubGlobal('fetch', fetch);
  const data = join(directory, '用户 数据');
  const install = () =>
    ensureRuntime(
      resolve('.'),
      data,
      new AbortController().signal,
      () => {},
      runtimePlatform('win32', 'x64'),
    );
  const runtime = await install();
  expect(runtime.backend).toBe('OpenCL');
  expect(await readFile(runtime.config.executable, 'utf8')).toBe('abc');
  expect(await readFile(runtime.config.model, 'utf8')).toBe('main model fixture');
  expect(await readFile(runtime.config.humanModel!, 'utf8')).toBe('human model fixture');
  expect(await readFile(runtime.config.config, 'utf8')).toContain('numAnalysisThreads');
  await writeFile(runtime.config.executable, 'broken executable');
  await writeFile(runtime.config.model, 'broken model');
  await install();
  expect(await readFile(runtime.config.executable, 'utf8')).toBe('abc');
  expect(await readFile(runtime.config.model, 'utf8')).toBe('main model fixture');
  await rm(join(directory, 'resources'), { recursive: true });
  await install();
  expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(data)).not.toContain('install.lock');
  expect((await readdir(data)).some((name) => name.startsWith('.install-'))).toBe(false);
});
