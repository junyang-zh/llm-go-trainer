import { afterEach, expect, it, vi } from 'vitest';
import { ExternalEngine, validateEngineUrl } from '../server/external-engine';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
const data = {
  id: 'engine',
  perspective: 'B',
  turnNumber: 0,
  rootInfo: { visits: 50, winrate: 0.55, scoreLead: 1 },
  moveInfos: [],
};
const engine = () =>
  new ExternalEngine({ mode: 'external', name: 'Test', url: 'http://127.0.0.1:4567/analyze' });
afterEach(() => vi.unstubAllGlobals());
it('accepts explicit Black-perspective data and rejects incompatible analysis', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...data, perspective: 'W' })));
  vi.stubGlobal('fetch', fetch);
  const adapter = engine();
  expect((await adapter.analyze(newGame(9), trainingForRank('5k'))).rootInfo.winrate).toBe(0.55);
  await expect(adapter.analyze(newGame(9), trainingForRank('5k'))).rejects.toThrow('视角');
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
});
it('disconnect aborts an in-flight external request', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    ),
  );
  const adapter = engine();
  const request = adapter.analyze(newGame(9), trainingForRank('5k'));
  adapter.close();
  await expect(request).rejects.toThrow('aborted');
  await expect(adapter.analyze(newGame(9), trainingForRank('5k'))).rejects.toThrow('已断开');
});
it.each([
  'file:///tmp/engine',
  'http://remote.example/analyze',
  'https://user:password@example.com/',
  'https://example.com/?key=secret',
])('rejects unsupported connection %s', (url) => {
  expect(() => validateEngineUrl(url)).toThrow();
});
