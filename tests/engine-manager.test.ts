import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EngineManager } from '../server/engine-manager';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
const fixture = resolve('tests/fixtures/fake-katago.mjs');
const config = {
  executable: process.execPath,
  prefixArgs: [fixture],
  model: fixture,
  config: fixture,
  timeout: 3000,
};
const managers: EngineManager[] = [];
const directories: string[] = [];
async function create(install?: ConstructorParameters<typeof EngineManager>[0]['install']) {
  const directory = await mkdtemp(join(tmpdir(), 'go-engine-'));
  directories.push(directory);
  const manager = new EngineManager({
    root: process.cwd(),
    directory,
    ...(install ? { install } : { configured: config }),
  });
  managers.push(manager);
  return manager;
}
afterEach(async () => {
  await Promise.all(managers.map((manager) => manager.close()));
  await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true })));
});
const ready = (manager: EngineManager) =>
  vi.waitFor(() => expect(manager.status().ready).toBe(true));
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
describe('managed engine lifecycle', () => {
  it('publishes initialization progress and clears it once the engine is ready', async () => {
    const manager = await create(async () => ({
      config: {
        ...config,
        prefixArgs: [resolve('tests/fixtures/slow-start-katago.mjs')],
      },
      backend: 'OpenCL',
    }));
    await manager.load();
    await vi.waitFor(() =>
      expect(manager.status().progress?.label).toContain('正在进行 OpenCL 调优'),
    );
    expect(manager.status().ready).toBe(false);
    await ready(manager);
    expect(manager.status().progress).toBeUndefined();
  });
  it('does not restart an active engine when selecting the same connection again', async () => {
    const manager = await create();
    await manager.load();
    await ready(manager);
    const pid = manager.status().pid!;
    await manager.connect({ mode: 'managed' });
    expect(manager.status().pid).toBe(pid);
    expect(manager.status().ready).toBe(true);
    await manager.stop();
    await manager.connect({ mode: 'managed' });
    expect(manager.status().phase).toBe('starting');
    await ready(manager);
    expect(manager.status().pid).not.toBe(pid);
  });
  it('starts in background, probes readiness, stops without lazy respawn, and restarts with a new child', async () => {
    const manager = await create();
    await manager.load();
    await ready(manager);
    const pid = manager.status().pid!;
    expect(alive(pid)).toBe(true);
    expect((await manager.analyze(newGame(9), trainingForRank('5k'))).ownership).toHaveLength(81);
    await manager.stop();
    expect(alive(pid)).toBe(false);
    expect(manager.status().phase).toBe('stopped');
    await expect(manager.analyze(newGame(9), trainingForRank('5k'))).rejects.toThrow('已停止');
    await manager.restart();
    await ready(manager);
    const next = manager.status().pid!;
    expect(next).not.toBe(pid);
    await manager.close();
    expect(alive(next)).toBe(false);
    manager.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(manager.status().running).toBe(false);
  });
  it('cancels bootstrap before it can spawn a child and can retry', async () => {
    let invoked = false;
    const install = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          invoked = true;
          signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true });
        }),
    );
    const manager = await create(install);
    await manager.load();
    await vi.waitFor(() => expect(invoked).toBe(true));
    await manager.stop();
    expect(manager.status().phase).toBe('stopped');
    expect(manager.status().pid).toBeUndefined();
    install.mockImplementationOnce(async () => {
      throw new Error('下载中断');
    });
    await manager.restart();
    await vi.waitFor(() => expect(manager.status().error).toBe('下载中断'));
    await manager.close();
  });
  it('serializes simultaneous lifecycle changes instead of leaking processes', async () => {
    const manager = await create();
    await manager.load();
    await ready(manager);
    const pid = manager.status().pid!;
    await Promise.all([manager.restart(), manager.stop()]);
    expect(manager.status().phase).toBe('stopped');
    expect(alive(pid)).toBe(false);
  });
  it('switches to an external adapter and preserves the connection across launches', async () => {
    const manager = await create();
    await manager.load();
    await ready(manager);
    const pid = manager.status().pid!;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'external',
            perspective: 'B',
            turnNumber: 0,
            rootInfo: { visits: 50, winrate: 0.5, scoreLead: 0 },
            moveInfos: [],
          }),
        ),
    );
    try {
      await manager.connect({
        mode: 'external',
        name: '其他引擎',
        url: 'http://127.0.0.1:4567/analyze',
      });
      await ready(manager);
      expect(alive(pid)).toBe(false);
      expect(manager.status().name).toBe('其他引擎');
      expect(manager.status().pid).toBeUndefined();
      const directory = directories.at(-1)!;
      await manager.close();
      const restored = new EngineManager({ root: process.cwd(), directory, configured: config });
      managers.push(restored);
      await restored.load();
      await ready(restored);
      expect(restored.connection().mode).toBe('external');
      await restored.connect({ mode: 'managed' });
      await ready(restored);
      expect(restored.status().pid).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it('can explicitly start after a child crashes, without leaving its old process alive', async () => {
    const manager = await create();
    await manager.load();
    await ready(manager);
    const pid = manager.status().pid!;
    process.kill(pid, 'SIGKILL');
    await vi.waitFor(() => expect(manager.status().phase).toBe('error'));
    manager.start();
    await ready(manager);
    expect(manager.status().pid).not.toBe(pid);
    expect(alive(pid)).toBe(false);
  });
  it('reports a startup error without pretending the engine is ready', async () => {
    const manager = await create(async () => {
      throw new Error('校验失败');
    });
    await manager.load();
    await vi.waitFor(() => expect(manager.status().phase).toBe('error'));
    expect(manager.status().ready).toBe(false);
  });
});
