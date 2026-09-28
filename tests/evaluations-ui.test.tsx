// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEvaluations } from '../src/useEvaluations';
import { streamApi } from '../src/api';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
import type { Game, StreamEvent } from '../shared/types';
import { evaluation, recordedGame, testEngine, testStatus } from './fixtures/evaluation';
import App from '../src/App';
vi.mock('../src/api', () => ({ streamApi: vi.fn(), api: vi.fn() }));
import { api } from '../src/api';

let root: Root, host: HTMLDivElement, latest: ReturnType<typeof useEvaluations>;
const training = trainingForRank('5k');
function Harness({
  game,
  turn = game.moves.length,
  paused = false,
  pid = 100,
}: {
  game: Game;
  turn?: number;
  paused?: boolean;
  pid?: number;
}) {
  latest = useEvaluations(game, turn, training, { ...testEngine, pid }, paused);
  return null;
}
async function render(game: Game, turn = game.moves.length, paused = false, pid = 100) {
  await act(async () => root.render(<Harness game={game} turn={turn} paused={paused} pid={pid} />));
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, onEvent) => {
    const game = (body as { game: Game }).game;
    const value = evaluation(game.moves.length);
    onEvent({ type: 'analysis', phase: 'after', analysis: value, final: true });
    onEvent({ type: 'done', analysis: value });
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('automatically analyzes positions, preserves history on navigation, and fills only missing turns', async () => {
  await render(recordedGame);
  await tick();
  expect(latest.points[3].winrate).toBe(0.2);
  expect(vi.mocked(streamApi).mock.calls[0][0]).toBe('analyze');
  expect(
    (vi.mocked(streamApi).mock.calls[0][1] as { training: { visits: number } }).training.visits,
  ).toBe(100);
  await act(async () => latest.complete());
  await tick();
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
  expect(
    vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game.moves.length),
  ).toEqual([3, 0, 1, 2]);
  expect(latest.completing).toBe(false);
  await render(recordedGame, 1);
  expect(latest.analysis).toBeNull();
  await tick();
  expect(latest.analysis?.turnNumber).toBe(1);
  expect(Object.keys(latest.points)).toHaveLength(4);
});
it('pauses for foreground work and keeps stronger completed results when revisiting', async () => {
  await render(recordedGame, 3, true);
  await tick();
  expect(streamApi).not.toHaveBeenCalled();
  await act(async () => latest.record(recordedGame, evaluation(3, 800), true));
  await render(recordedGame, 3);
  await tick();
  expect(streamApi).not.toHaveBeenCalled();
  await render(recordedGame, 2);
  await tick();
  await render(recordedGame, 3);
  await tick();
  expect(latest.points[3].visits).toBe(800);
  expect(latest.analysis?.turnNumber).toBe(3);
});
it('separates new setups, engine instances and explicitly reset games', async () => {
  await render(recordedGame);
  await tick();
  await render({ ...recordedGame, komi: 6.5 });
  expect(latest.points).toEqual({});
  expect(latest.analysis).toBeNull();
  await tick();
  await render(recordedGame, 3, false, 200);
  expect(latest.points).toEqual({});
  await tick();
  await act(async () => latest.reset());
  expect(latest.points).toEqual({});
  expect(latest.analysis).toBeNull();
});
it('cancels obsolete requests and ignores late results after switching games', async () => {
  const requests: { onEvent: (event: StreamEvent) => void; signal: AbortSignal }[] = [];
  vi.mocked(streamApi).mockImplementation(
    (_endpoint, _payload, onEvent, signal) =>
      new Promise((_resolve, reject) => {
        requests.push({ onEvent, signal: signal! });
        signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  );
  await render(recordedGame);
  await tick();
  await render(newGame(9));
  expect(requests[0].signal.aborted).toBe(true);
  await act(async () => requests[0].onEvent({ type: 'done', analysis: evaluation(3) }));
  expect(latest.points).toEqual({});
  await tick();
  await act(async () => latest.reset());
  await act(async () => requests[1].onEvent({ type: 'done', analysis: evaluation(0) }));
  expect(latest.points).toEqual({});
});
it('reports failures without a retry loop and allows explicit retry', async () => {
  vi.mocked(streamApi).mockRejectedValueOnce(new Error('引擎断开'));
  await render(recordedGame);
  await tick();
  expect(latest.error).toBe('引擎断开');
  await tick();
  expect(streamApi).toHaveBeenCalledTimes(1);
  await act(async () => latest.retry());
  await tick();
  expect(latest.error).toBe('');
  expect(latest.points[3].final).toBe(true);
});
it('stops curve completion, preserves finished points and rejects late partial-query results', async () => {
  await render(recordedGame);
  await tick();
  let signal!: AbortSignal, emit!: (event: StreamEvent) => void;
  vi.mocked(streamApi).mockImplementationOnce(
    (_endpoint, _body, onEvent, cancellation) =>
      new Promise((_resolve, reject) => {
        signal = cancellation!;
        emit = onEvent;
        onEvent({ type: 'analysis', phase: 'after', analysis: evaluation(0, 50), final: false });
        signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
      }),
  );
  await act(async () => latest.complete());
  await tick();
  expect(latest.pendingTurn).toBe(0);
  await act(async () => latest.stop());
  expect(signal.aborted).toBe(true);
  await act(async () => emit({ type: 'done', analysis: evaluation(0) }));
  await tick();
  expect(streamApi).toHaveBeenCalledTimes(2);
  expect(latest.completing).toBe(false);
  expect(latest.points[0].final).toBe(false);
  expect(latest.points[3].final).toBe(true);
  expect(latest.error).toBe('');
});
it('toggles board candidates and the candidate list together while keeping the graph panel visible', async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library' ? { games: [], conversations: [] } : testStatus,
  );
  await act(async () => root.render(<App />));
  await tick();
  const toggle = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === '候选点',
  )!;
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('[aria-label="候选 A：D4"]')).not.toBeNull();
  expect(host.querySelector('.candidates')).not.toBeNull();
  expect(host.querySelector('.evaluation-toggle')?.getAttribute('aria-expanded')).toBe('false');
  await act(async () => toggle.click());
  expect(host.querySelector('[aria-label="候选 A：D4"]')).toBeNull();
  expect(host.querySelector('.candidates')).toBeNull();
  expect(host.querySelector('.evaluation')).not.toBeNull();
  await act(async () => (host.querySelector('.evaluation-toggle') as HTMLButtonElement).click());
  expect(host.querySelector('.evaluation-chart')).not.toBeNull();
  await act(async () => toggle.click());
  expect(host.querySelector('[aria-label="候选 A：D4"]')).not.toBeNull();
});
