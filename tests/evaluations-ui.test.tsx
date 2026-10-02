// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEvaluations } from '../src/useEvaluations';
import { streamApi } from '../src/api';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
import type { Game, StreamEvent } from '../shared/types';
import {
  evaluation,
  recordedGame,
  trialGame,
  trialEvaluation,
  testEngine,
  testStatus,
} from './fixtures/evaluation';
import { exportSgf } from '../shared/sgf';
import { EvaluationChart } from '../src/EvaluationPanel';
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
  mainlineGame = game,
}: {
  game: Game;
  turn?: number;
  paused?: boolean;
  pid?: number;
  mainlineGame?: Game;
}) {
  latest = useEvaluations(game, turn, training, { ...testEngine, pid }, paused, mainlineGame);
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
it('retains the complete mainline through trial analysis, rewinding and replacing the trial', async () => {
  await render(recordedGame);
  await tick();
  await act(async () => latest.complete());
  await tick();
  await act(async () => latest.record(recordedGame, evaluation(2, 800), true));
  const mainline = latest.points;
  await act(async () =>
    root.render(<Harness game={trialGame} turn={3} mainlineGame={recordedGame} paused />),
  );
  expect(Object.keys(latest.points)).toEqual(['0', '1']);
  await act(async () => {
    latest.record(trialGame, trialEvaluation(2), true);
    latest.record(trialGame, trialEvaluation(3), true);
  });
  expect(latest.points[2].winrate).toBe(0.75);
  expect(latest.points[2].visits).toBe(100);
  expect(latest.mainlinePoints).toEqual(mainline);
  await act(async () =>
    root.render(<Harness game={trialGame} turn={1} mainlineGame={recordedGame} paused />),
  );
  expect(latest.points[3].winrate).toBe(0.75);
  expect(latest.mainlinePoints).toEqual(mainline);
  const replacement = {
    ...trialGame,
    moves: [...trialGame.moves.slice(0, 2), recordedGame.moves[2]],
  };
  await act(async () =>
    root.render(<Harness game={replacement} mainlineGame={recordedGame} paused />),
  );
  expect(latest.points[3]).toBeUndefined();
  await act(async () => latest.record(replacement, trialEvaluation(3), true));
  expect(latest.mainlinePoints).toEqual(mainline);
  const searches = vi.mocked(streamApi).mock.calls.length;
  await render(recordedGame, 1, true);
  expect(latest.points).toEqual(mainline);
  expect(streamApi).toHaveBeenCalledTimes(searches);
  await render(recordedGame, 1);
  await tick();
  await act(async () => latest.complete());
  await tick();
  // Only the viewed position refreshes its PV; no curve completion searches are needed.
  expect(streamApi).toHaveBeenCalledTimes(searches + 1);
  expect(latest.points).toEqual(mainline);
});

it('draws separate trial and muted future curves and prevents navigating muted points', async () => {
  await render(recordedGame, 3, true);
  await act(async () => {
    for (let turn = 0; turn <= 3; turn++) latest.record(recordedGame, evaluation(turn), true);
  });
  const mainline = latest.points;
  await act(async () =>
    root.render(<Harness game={trialGame} mainlineGame={recordedGame} paused />),
  );
  await act(async () => latest.record(trialGame, trialEvaluation(2), true));
  const navigate = vi.fn();
  await act(async () =>
    root.render(
      <EvaluationChart
        history={latest.points}
        mainlineHistory={mainline}
        trialTurn={1}
        turn={2}
        total={3}
        disabled={false}
        navigate={navigate}
      />,
    ),
  );
  const plot = host.querySelector('.plot-winrate')!;
  expect(plot.querySelectorAll('.mainline .plot-dot')).toHaveLength(2);
  expect(plot.querySelectorAll('.future .plot-dot')).toHaveLength(2);
  expect(plot.querySelectorAll('.trial .plot-dot')).toHaveLength(1);
  expect(plot.querySelector('.trial .plot-point')!.getAttribute('aria-label')).toContain('75.0%');
  expect(plot.querySelector('.future .plot-point')!.getAttribute('aria-label')).toContain('20.0%');
  expect(plot.querySelector('.trial .plot-line')!.getAttribute('points')).toBe('158,62.8 278,32');
  const future = plot.querySelector('.future .plot-point')!;
  expect(future.getAttribute('tabindex')).toBe('-1');
  await act(async () => {
    future.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    future.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () =>
    plot
      .querySelector('.trial .plot-point')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  expect(navigate).toHaveBeenCalledWith(2);
});

it('immediately restores the mainline chart after clearing a trial without filling it again', async () => {
  localStorage.setItem('go-trainer-game-v1', exportSgf(recordedGame));
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library' ? { games: [], conversations: [] } : testStatus,
  );
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, onEvent) => {
    const game = (body as { game: Game }).game;
    const value = game.moves.some((move) => move.point === 'D4')
      ? trialEvaluation(game.moves.length)
      : evaluation(game.moves.length);
    onEvent({ type: 'done', analysis: value });
  });
  await act(async () => root.render(<App />));
  await tick();
  async function click(selector: string) {
    await act(async () => (host.querySelector(selector) as HTMLElement).click());
  }
  await click('.evaluation-toggle');
  const fill = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === '补全曲线',
  )!;
  await act(async () => fill.click());
  await tick();
  const mainline = host.querySelector('.plot-winrate .mainline .plot-line')!.getAttribute('points');
  expect(host.querySelectorAll('.plot-winrate .plot-dot')).toHaveLength(4);
  await click('[aria-label="上一手"]');
  await click('[aria-label="上一手"]');
  await act(async () =>
    host
      .querySelector('[aria-label="D4 空点"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  await tick();
  expect(host.querySelectorAll('.plot-winrate .future .plot-dot')).toHaveLength(2);
  expect(
    host.querySelector('.plot-winrate .trial .plot-point')!.getAttribute('aria-label'),
  ).toContain('75.0%');
  expect(host.querySelector('.evaluation-chart text:last-child')!.textContent).toContain('3');
  const searches = vi.mocked(streamApi).mock.calls.length;
  const clear = [...host.querySelectorAll<HTMLButtonElement>('.trial-bar button')].find(
    (button) => button.textContent === '清空试下',
  )!;
  await act(async () => clear.click());
  expect(host.querySelectorAll('.plot-winrate .mainline .plot-dot')).toHaveLength(4);
  expect(host.querySelector('.plot-series.future')).toBeNull();
  expect(host.querySelector('.plot-series.trial')).toBeNull();
  expect(fill.disabled).toBe(true);
  expect(streamApi).toHaveBeenCalledTimes(searches);
  // The cursor now sits at the trial's origin, so compare data independently of dot radius.
  expect(host.querySelector('.plot-winrate .mainline .plot-line')!.getAttribute('points')).toBe(
    mainline,
  );
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
it('automatically analyzes with evaluations hidden, and independently reveals details and board candidates', async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library' ? { games: [], conversations: [] } : testStatus,
  );
  await act(async () => root.render(<App />));
  await tick();
  expect(streamApi).toHaveBeenCalled();
  expect(
    [...host.querySelectorAll('button')].some((button) => button.textContent === '分析局面'),
  ).toBe(false);
  expect(host.querySelector('[aria-label="回到开局"]')).toBeNull();
  expect(host.querySelector('[aria-label="最后一手"]')).toBeNull();
  const toggle = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === '候选点',
  )!;
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[aria-label="候选 A：D4"]')).toBeNull();
  expect(host.querySelector('.candidates')).toBeNull();
  expect(host.querySelector('.evaluation-current')).toBeNull();
  const expand = host.querySelector('.evaluation-toggle') as HTMLButtonElement;
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  await act(async () => expand.click());
  expect(host.querySelector('.evaluation-chart')).not.toBeNull();
  expect(host.querySelector('.evaluation-current')?.textContent).toContain('20.0%');
  expect(host.querySelector('.candidates')).not.toBeNull();
  await act(async () => toggle.click());
  expect(host.querySelector('[aria-label="候选 A：D4"]')).not.toBeNull();
  await act(async () => expand.click());
  expect(host.querySelector('.candidates')).toBeNull();
  expect(host.querySelector('.evaluation-current')).toBeNull();
});

it('shows engine startup outside the conversation and clears it when the engine becomes ready', async () => {
  let ready = false;
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library'
      ? { games: [], conversations: [] }
      : { ...testStatus, engine: { ...testEngine, ready, phase: ready ? 'ready' : 'starting' } },
  );
  await act(async () => root.render(<App />));
  const status = host.querySelector('.workspace-status')!;
  expect(status.textContent).toBe('KataGo · 启动中');
  expect(status.getAttribute('aria-hidden')).toBe('false');
  expect(status.closest('.chat-panel')).toBeNull();
  expect(status.querySelector('[aria-label="关闭通知"]')).toBeNull();
  ready = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(status.textContent).toBe('');
  expect(status.getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelector('.engine-progress')).toBeNull();
});
