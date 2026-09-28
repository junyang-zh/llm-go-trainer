import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import { KataGoModels } from '../server/katago-models';
import { createApp } from '../server/app';
import { EngineManager } from '../server/engine-manager';
import { fixtureCatalog, modelFixtures } from './fixtures/model-library';

let models: KataGoModels, engine: EngineManager, server: Server, directory: string, base: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'go-models-api-'));
  const bundled = join(directory, 'bundled');
  await mkdir(bundled);
  for (const { model, bytes } of modelFixtures)
    await writeFile(join(bundled, model.id + '.bin.gz'), bytes);
  models = new KataGoModels(directory, { catalog: fixtureCatalog, bundledModels: bundled });
  await models.load();
  engine = new EngineManager({ root: process.cwd(), directory });
  server = createServer(
    createApp(
      engine,
      {
        deepseekKey: '',
        deepseekUrl: 'https://api.deepseek.com',
        deepseekModel: 'test',
        codexPath: 'unavailable-model-test',
        claudePath: 'unavailable-model-test',
        timeout: 1000,
      },
      'test',
      resolve('dist'),
      engine,
      undefined,
      undefined,
      models,
    ),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
});
afterAll(async () => {
  await engine.close();
  await models.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
});
const post = (action: string, body: unknown, origin = base) =>
  fetch(`${base}/api/models/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1', Origin: origin },
    body: JSON.stringify(body),
  });
it('downloads through the panel API, exposes status, and deletes unselected files', async () => {
  const id = fixtureCatalog[1].id;
  expect((await post('download', { id })).status).toBe(202);
  await vi.waitFor(() =>
    expect(models.view().models.find((model) => model.id === id)?.installed).toBe(true),
  );
  const view = await (await fetch(base + '/api/models')).json();
  expect(view.models.find((model: { id: string }) => model.id === id).installed).toBe(true);
  expect((await post('delete', { id })).status).toBe(202);
  expect(models.view().models.find((model) => model.id === id)?.installed).toBe(false);
});
it('rejects cross-site model mutations and invalid IDs, roles and download URLs', async () => {
  expect(
    (await post('download', { id: fixtureCatalog[1].id }, 'https://untrusted.example')).status,
  ).toBe(403);
  expect((await post('delete', { id: '../../private' })).status).toBe(400);
  expect(
    (
      await post('add', {
        name: 'bad',
        url: 'https://127.0.0.1/private.bin.gz',
        sha256: fixtureCatalog[1].id,
      })
    ).status,
  ).toBe(400);
  expect((await post('select', { main: 'missing', human: null })).status).toBe(400);
  expect((await post('refresh', { page: -1 })).status).toBe(400);
  expect((await post('delete', { id: fixtureCatalog[0].id })).status).toBe(502);
});
