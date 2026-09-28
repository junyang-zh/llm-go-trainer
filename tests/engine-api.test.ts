import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import { EngineManager } from '../server/engine-manager';
import { createApp } from '../server/app';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
let manager: EngineManager, server: Server, directory: string, base: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'go-engine-api-'));
  const fixture = resolve('tests/fixtures/fake-katago.mjs');
  manager = new EngineManager({
    root: process.cwd(),
    directory,
    configured: {
      executable: process.execPath,
      prefixArgs: [fixture],
      model: fixture,
      config: fixture,
      timeout: 3000,
    },
  });
  server = createServer(
    createApp(
      manager,
      {
        deepseekKey: '',
        deepseekUrl: 'https://api.deepseek.com',
        deepseekModel: 'test',
        codexPath: 'unavailable-test-cli',
        claudePath: 'unavailable-test-cli',
        timeout: 3000,
      },
      'test',
      resolve('dist'),
      manager,
    ),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  await manager.load();
  await vi.waitFor(() => expect(manager.status().ready).toBe(true));
});
afterAll(async () => {
  await manager.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1', ...headers },
    body: JSON.stringify(body),
  });
it('controls the real manager through the same routes used by the settings dialog', async () => {
  const pid = manager.status().pid;
  expect(await (await fetch(base + '/api/engine/connection')).json()).toEqual({ mode: 'managed' });
  expect((await post('/api/engine/stop')).status).toBe(202);
  expect((await (await fetch(base + '/api/status')).json()).engine.phase).toBe('stopped');
  const stopped = await post('/api/analyze', { game: newGame(9), training: trainingForRank('5k') });
  expect(stopped.status).toBe(502);
  expect((await stopped.json()).error).toContain('已停止');
  const started = await post('/api/engine/start');
  expect(started.status).toBe(202);
  expect((await started.json()).phase).toBe('starting');
  await vi.waitFor(() => expect(manager.status().ready).toBe(true));
  expect(manager.status().pid).not.toBe(pid);
  expect((await post('/api/engine/restart')).status).toBe(202);
  await vi.waitFor(() => expect(manager.status().ready).toBe(true));
});
it('validates connection settings and rejects cross-site process control', async () => {
  expect((await post('/api/engine/stop', {}, { Origin: 'https://untrusted.example' })).status).toBe(
    403,
  );
  expect(
    (
      await post('/api/engine/connect', {
        mode: 'external',
        name: 'AI',
        url: 'http://remote.example/analyze',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post('/api/engine/connect', {
        mode: 'external',
        name: 'AI',
        url: 'https://user:password@remote.example/analyze',
      })
    ).status,
  ).toBe(400);
  expect(manager.connection().mode).toBe('managed');
  expect(manager.status().ready).toBe(true);
});
