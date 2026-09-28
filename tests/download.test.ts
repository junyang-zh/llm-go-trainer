import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { downloadArtifact } from '../server/download';
import { runtimePlatform } from '../server/installer';
import { safeArchivePath } from '../server/archive';
import { ensureModel } from '../server/model-files';
let server: Server,
  base: string,
  directory: string,
  requests = 0;
const data = Buffer.from('测试下载\n');
const sha256 = createHash('sha256').update(data).digest('hex');
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'go-download-'));
  server = createServer((req, res) => {
    requests++;
    res.writeHead(200, { 'Content-Length': data.length });
    if (req.url === '/slow') {
      res.write(data.subarray(0, 1));
    } else res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address !== 'string') base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
it('atomically installs verified bytes, reuses valid cache, and replaces a corrupted cache', async () => {
  const artifact = { name: 'model', url: base + '/model', sha256 };
  const file = await downloadArtifact(artifact, directory, new AbortController().signal, () => {});
  expect(await readFile(file)).toEqual(data);
  const count = requests;
  expect(await downloadArtifact(artifact, directory, new AbortController().signal, () => {})).toBe(
    file,
  );
  expect(requests).toBe(count);
  await writeFile(file, 'broken');
  await downloadArtifact(artifact, directory, new AbortController().signal, () => {});
  expect(requests).toBe(count + 1);
  expect(await readFile(file)).toEqual(data);
});
it('installs bundled weights without network, repairs corruption, and reuses installed weights', async () => {
  const bundle = join(directory, 'bundle');
  const runtime = join(directory, 'bundled-runtime');
  const artifact = { name: 'model', url: base + '/model', sha256 };
  await mkdir(bundle);
  await writeFile(join(bundle, `${sha256}.bin.gz`), data);
  const count = requests;
  const model = await ensureModel(
    artifact,
    runtime,
    bundle,
    new AbortController().signal,
    () => {},
  );
  expect(await readFile(model)).toEqual(data);
  await writeFile(model, 'corrupt installed model');
  await ensureModel(artifact, runtime, bundle, new AbortController().signal, () => {});
  expect(await readFile(model)).toEqual(data);
  await rm(bundle, { recursive: true });
  await ensureModel(artifact, runtime, undefined, new AbortController().signal, () => {});
  expect(requests).toBe(count);
  expect((await readdir(join(runtime, 'models'))).filter((name) => name.endsWith('.tmp'))).toEqual(
    [],
  );
});
it.each(['missing', 'corrupt'])(
  'downloads verified weights when bundled weights are %s',
  async (kind) => {
    const runtime = join(directory, `fallback-${kind}`);
    const bundle = join(runtime, 'bundle');
    await mkdir(bundle, { recursive: true });
    if (kind === 'corrupt') await writeFile(join(bundle, `${sha256}.bin.gz`), 'corrupt bundle');
    const count = requests;
    const model = await ensureModel(
      { name: 'model', url: base + '/model', sha256 },
      runtime,
      bundle,
      new AbortController().signal,
      () => {},
    );
    expect(await readFile(model)).toEqual(data);
    expect(requests).toBe(count + 1);
  },
);
it('does not install bundled weights after cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    ensureModel(
      { name: 'model', url: base + '/model', sha256 },
      join(directory, 'cancelled-model'),
      undefined,
      controller.signal,
      () => {},
    ),
  ).rejects.toThrow();
});
it('rejects checksum mismatch and removes interrupted partial downloads', async () => {
  await expect(
    downloadArtifact(
      { name: 'bad', url: base + '/model', sha256: '0'.repeat(64) },
      directory,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('校验失败');
  const controller = new AbortController();
  await expect(
    downloadArtifact(
      { name: 'cancel', url: base + '/slow', sha256: '1'.repeat(64) },
      directory,
      controller.signal,
      () => controller.abort(),
    ),
  ).rejects.toThrow();
  expect((await readdir(directory)).filter((file) => file.endsWith('.part'))).toEqual([]);
});
it('selects the intended GPU distributions and rejects unsupported platforms explicitly', () => {
  expect(runtimePlatform('darwin', 'arm64', '24.0.0').backend).toBe('Metal');
  expect(runtimePlatform('win32', 'x64', '10.0').backend).toBe('OpenCL');
  expect(runtimePlatform('win32', 'x64', '10.0', 'cuda').backend).toBe('CUDA');
  expect(() => runtimePlatform('darwin', 'arm64', '24', 'cuda')).toThrow('Windows x64');
  expect(() => runtimePlatform('darwin', 'x64', '24')).toThrow('外部引擎');
});
it.each(['../escape', '/absolute', 'C:/absolute', 'nested/../escape', 'nested\\escape'])(
  'rejects archive path %s',
  (path) => {
    expect(() => safeArchivePath(path)).toThrow('不安全');
  },
);

it('resumes a previously interrupted download using Range, then verifies the entire file', async () => {
  const body = Buffer.from('a ranged response with several bytes');
  const hash = createHash('sha256').update(body).digest('hex');
  let range = '';
  const resumed = createServer((req, res) => {
    range = req.headers.range || '';
    const start = Number(range.match(/bytes=(\d+)-/)?.[1] || 0);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}`,
      'Content-Length': body.length - start,
    });
    res.end(body.subarray(start));
  });
  await new Promise<void>((resolve) => resumed.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(join(directory, hash + '.part'), body.subarray(0, 8));
    const address = resumed.address() as import('node:net').AddressInfo;
    const result = await downloadArtifact(
      { name: 'resume', sha256: hash, url: `http://127.0.0.1:${address.port}/model` },
      directory,
      new AbortController().signal,
      () => {},
    );
    expect(range).toBe('bytes=8-');
    expect(await readFile(result)).toEqual(body);
  } finally {
    await new Promise<void>((resolve) => resumed.close(() => resolve()));
  }
});
it('restarts a partial download when the server ignores Range', async () => {
  await rm(join(directory, sha256), { force: true });
  await writeFile(join(directory, sha256 + '.part'), data.subarray(0, 2));
  const result = await downloadArtifact(
    { name: 'restart', sha256, url: base + '/model' },
    directory,
    new AbortController().signal,
    () => {},
  );
  expect(await readFile(result)).toEqual(data);
});

it.each(['valid', 'missing', 'corrupt'])(
  'verifies a %s bundled runtime archive before deciding whether to download',
  async (kind) => {
    const cache = join(directory, `runtime-cache-${kind}`);
    const bundle = join(directory, `runtime-bundle-${kind}`);
    await mkdir(bundle);
    if (kind !== 'missing') await writeFile(join(bundle, sha256), kind === 'valid' ? data : 'bad');
    const count = requests;
    const result = await downloadArtifact(
      { name: 'KataGo', url: base + '/runtime', sha256 },
      cache,
      new AbortController().signal,
      () => {},
      bundle,
    );
    expect(await readFile(result)).toEqual(data);
    expect(requests - count).toBe(kind === 'valid' ? 0 : 1);
  },
);

it('reports the failed artifact, host and network cause after retries', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    }),
  );
  const progress = vi.fn();
  try {
    await expect(
      downloadArtifact(
        { name: 'KataGo OpenCL', url: 'https://example.invalid/runtime', sha256 },
        join(directory, 'failed-runtime'),
        new AbortController().signal,
        progress,
      ),
    ).rejects.toThrow('KataGo OpenCL 下载失败（example.invalid）：fetch failed [ETIMEDOUT]');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledWith({ label: 'KataGo OpenCL', received: 0 });
  } finally {
    fetch.mockRestore();
  }
});
