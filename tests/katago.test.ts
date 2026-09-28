import { afterEach, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { KataGo } from '../server/katago';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
const engines: KataGo[] = [];
function engine(timeout = 5000) {
  const script = resolve('tests/fixtures/fake-katago.mjs');
  const instance = new KataGo({
    executable: process.execPath,
    prefixArgs: [script],
    model: script,
    config: script,
    timeout,
  });
  engines.push(instance);
  return instance;
}
afterEach(() => engines.forEach((e) => e.close()));
describe('KataGo JSONL transport', () => {
  it('correlates out-of-order queries and ignores partial search results', async () => {
    const e = engine();
    const [a, b] = await Promise.all([
      e.analyze(newGame(9, 0, 1), trainingForRank('5k')),
      e.analyze(newGame(13), trainingForRank('1d')),
    ]);
    expect(a.id).not.toBe(b.id);
    expect(a.ownership).toHaveLength(81);
    expect(b.ownership).toHaveLength(169);
    expect(a.perspective).toBe('B');
  });
  it('reports engine errors without leaving requests pending', async () => {
    const e = engine();
    await expect(e.analyze(newGame(9, 0, 97), trainingForRank('5k'))).rejects.toThrow(
      'invalid rules',
    );
    expect((await e.analyze(newGame(9), trainingForRank('5k'))).moveInfos[0].move).toBe('D4');
  });
  it('cleans up timed-out processes and restarts on the next query', async () => {
    const e = engine(1500);
    await expect(e.analyze(newGame(9, 0, 99), trainingForRank('5k'))).rejects.toThrow('超时');
    expect(e.status().running).toBe(false);
    expect((await e.analyze(newGame(9), trainingForRank('5k'))).rootInfo.winrate).toBe(0.55);
  });
  it('rejects on unexpected process exit', async () => {
    await expect(engine().analyze(newGame(9, 0, 98), trainingForRank('5k'))).rejects.toThrow(
      '退出',
    );
  });
});

it('publishes intermediate searches and cancels only the selected query', async () => {
  const e = engine();
  const controller = new AbortController();
  const visits: number[] = [];
  const pending = e.analyze(newGame(9, 0, 96), trainingForRank('5k'), {
    signal: controller.signal,
    onProgress: (value) => {
      visits.push(value.rootInfo.visits);
      controller.abort();
    },
  });
  await expect(pending).rejects.toThrow('停止');
  expect(visits).toEqual([10]);
  expect(e.status().running).toBe(true);
  const result = await e.analyze(newGame(9), trainingForRank('5k'), {
    onProgress: (value) => visits.push(value.rootInfo.visits),
  });
  expect(result.rootInfo.visits).toBe(trainingForRank('5k').visits);
  expect(visits).toEqual([10, 10]);
});
