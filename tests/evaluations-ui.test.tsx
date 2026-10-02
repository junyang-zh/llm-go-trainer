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
  timedEvaluation,
  recordedGame,
  trialGame,
  trialEvaluation,
  testEngine,
  testStatus,
} from './fixtures/evaluation';
import { libraryFixture } from './fixtures/library';
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
  ready = true,
  mainlineGame = game,
}: {
  game: Game;
  turn?: number;
  paused?: boolean;
  pid?: number;
  ready?: boolean;
  mainlineGame?: Game;
}) {
  latest = useEvaluations(
    game,
    turn,
    training,
    { ...testEngine, pid, ready },
    paused,
    mainlineGame,
  );
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
it('reports completion once missing curve points are filled and uses engine timing for the rate', async () => {
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
    const value = timedEvaluation((body as { game: Game }).game.moves.length);
    emit({ type: 'analysis', phase: 'after', analysis: value, final: true });
    emit({ type: 'done', analysis: value });
  });
  await render(recordedGame);
  expect(latest.completion).toBeUndefined();
  await tick();
  expect(latest.completion).toEqual({ positions: 4, visitsPerSecond: 400 });
  const completion = latest.completion;
  await render(recordedGame, 1);
  await tick();
  expect(latest.completion).toBe(completion);
  await act(async () => latest.reset());
  expect(latest.completion).toBeUndefined();
});

it('shows a completion notification instead of panel statistics and does not repeat it on navigation', async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library' ? { games: [libraryFixture.games[0]], conversations: [] } : testStatus,
  );
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
    emit({ type: 'done', analysis: timedEvaluation((body as { game: Game }).game.moves.length) });
  });
  await act(async () => root.render(<App />));
  await tick();
  const notice = host.querySelector('.workspace-status')!;
  expect(notice.textContent).toContain('曲线分析完成 · 已分析 3 手 · 400 次/秒');
  await act(async () => (host.querySelector('.evaluation-toggle') as HTMLElement).click());
  expect(host.querySelector('.evaluation-progress')).toBeNull();
  expect(host.querySelector('.evaluation-search')).toBeNull();
  expect(host.querySelector('.evaluation-actions')).toBeNull();
  await act(async () => (host.querySelector('[aria-label="关闭通知"]') as HTMLElement).click());
  expect(notice.getAttribute('aria-hidden')).toBe('true');
  await act(async () => (host.querySelector('[aria-label="上一手"]') as HTMLElement).click());
  await tick();
  expect(notice.getAttribute('aria-hidden')).toBe('true');
});

it.each(['during analysis', 'after completion'] as const)(
  'keeps illegal-move alerts dismissible and restores the analysis notification when closed %s',
  async (closeWhen) => {
    vi.mocked(api).mockImplementation(async (path) =>
      path === 'library' ? { games: [libraryFixture.games[0]], conversations: [] } : testStatus,
    );
    vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
      emit({ type: 'done', analysis: timedEvaluation((body as { game: Game }).game.moves.length) });
    });
    let finish!: () => void;
    vi.mocked(streamApi).mockImplementationOnce(
      (_endpoint, body, emit) =>
        new Promise<void>((resolve) => {
          const analysis = timedEvaluation((body as { game: Game }).game.moves.length);
          emit({ type: 'analysis', phase: 'after', analysis, final: false });
          finish = () => {
            emit({ type: 'done', analysis });
            resolve();
          };
        }),
    );
    await act(async () => root.render(<App />));
    await tick();
    const status = host.querySelector('.workspace-status')!;
    expect(status.textContent).toContain('分析第 3 手');
    await act(async () =>
      host
        .querySelector('[aria-label="C3 黑子"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    const close = () => status.querySelector<HTMLButtonElement>('[aria-label="关闭通知"]');
    expect(status.textContent).toContain('这里已有棋子');
    expect(status.getAttribute('role')).toBe('alert');
    expect(close()).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(status.textContent).toContain('这里已有棋子');
    expect(close()).not.toBeNull();
    if (closeWhen === 'during analysis') {
      await act(async () => close()!.click());
      expect(status.getAttribute('role')).toBe('status');
      expect(status.textContent).toContain('分析第 3 手');
      expect(status.textContent).toContain('次/秒');
    }
    await act(async () => finish());
    if (closeWhen === 'after completion') {
      expect(status.textContent).toContain('这里已有棋子');
      expect(close()).not.toBeNull();
      await act(async () => close()!.click());
    }
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toContain('曲线分析完成 · 已分析 3 手 · 400 次/秒');
    expect(close()).not.toBeNull();
    await act(async () => close()!.click());
    expect(status.getAttribute('aria-hidden')).toBe('true');
  },
);

it('retains the complete mainline through trial analysis, rewinding and replacing the trial', async () => {
  await render(recordedGame);
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
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library' ? { games: [libraryFixture.games[0]], conversations: [] } : testStatus,
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
  expect(
    [...host.querySelectorAll('button')].some((button) => button.textContent === '补全曲线'),
  ).toBe(false);
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
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
  expect(
    vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game.moves.length),
  ).toEqual([3, 0, 1, 2]);
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
  expect(
    vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game.moves.length),
  ).toEqual([0, 1, 2]);
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
it('automatically retries incomplete curve points with backoff and retains completed results', async () => {
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
    const turn = (body as { game: Game }).game.moves.length;
    if (turn === 1) throw new Error('引擎断开');
    emit({ type: 'done', analysis: evaluation(turn) });
  });
  await render(recordedGame);
  await tick();
  expect(latest.error).toBe('引擎断开');
  expect(latest.completion).toBeUndefined();
  expect(Object.keys(latest.points)).toEqual(['0', '3']);
  await tick();
  expect(streamApi).toHaveBeenCalledTimes(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await tick();
  expect(streamApi).toHaveBeenCalledTimes(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
  expect(streamApi).toHaveBeenCalledTimes(4);
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
    emit({ type: 'done', analysis: evaluation((body as { game: Game }).game.moves.length) });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  await tick();
  expect(latest.error).toBe('');
  expect(latest.completion?.positions).toBe(4);
  expect(latest.completion?.visitsPerSecond).toBeUndefined();
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
  expect(
    vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game.moves.length),
  ).toEqual([3, 0, 1, 1, 1, 2]);
});

it('retries a completed stream that did not supply a usable final curve point', async () => {
  vi.mocked(streamApi).mockImplementationOnce(async (_endpoint, _body, emit) => {
    emit({ type: 'analysis', phase: 'after', analysis: evaluation(3, 50), final: false });
    emit({ type: 'done', analysis: null });
  });
  await render(recordedGame);
  await tick();
  expect(latest.error).not.toBe('');
  expect(latest.points[3].final).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await tick();
  expect(latest.error).toBe('');
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
  expect(Object.values(latest.points).every((point) => point.final)).toBe(true);
});

it('resumes unfinished curve points after foreground work and rejects late cancelled results', async () => {
  let signal!: AbortSignal, emit!: (event: StreamEvent) => void;
  vi.mocked(streamApi)
    .mockImplementationOnce((_endpoint, _body, onEvent) =>
      Promise.resolve(onEvent({ type: 'done', analysis: evaluation(3) })),
    )
    .mockImplementationOnce(
      (_endpoint, _body, onEvent, cancellation) =>
        new Promise((_resolve, reject) => {
          signal = cancellation!;
          emit = onEvent;
          onEvent({ type: 'analysis', phase: 'after', analysis: evaluation(0, 50), final: false });
          signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
        }),
    );
  await render(recordedGame);
  await tick();
  expect(latest.pendingTurn).toBe(0);
  await render(recordedGame, 3, true);
  expect(signal.aborted).toBe(true);
  await act(async () => emit({ type: 'done', analysis: evaluation(0) }));
  await tick();
  expect(streamApi).toHaveBeenCalledTimes(2);
  expect(latest.points[0].final).toBe(false);
  expect(latest.points[3].final).toBe(true);
  expect(latest.error).toBe('');
  await render(recordedGame);
  await tick();
  expect(Object.values(latest.points).every((point) => point.final)).toBe(true);
  expect(
    vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game.moves.length),
  ).toEqual([3, 0, 0, 1, 2]);
});

it('fills missing trial and original future positions even when loading directly into a trial', async () => {
  vi.mocked(streamApi).mockImplementation(async (_endpoint, body, emit) => {
    const game = (body as { game: Game }).game;
    emit({
      type: 'done',
      analysis: game.moves.some((move) => move.point === 'D4')
        ? trialEvaluation(game.moves.length)
        : evaluation(game.moves.length),
    });
  });
  await act(async () =>
    root.render(<Harness game={trialGame} turn={2} mainlineGame={recordedGame} />),
  );
  await tick();
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
  expect(Object.keys(latest.mainlinePoints)).toEqual(['0', '1', '2', '3']);
  expect(latest.analysis?.turnNumber).toBe(2);
  expect(latest.analysis?.rootInfo.winrate).toBe(0.75);
  expect(latest.positionCount).toBe(6);
  const games = vi.mocked(streamApi).mock.calls.map((call) => (call[1] as { game: Game }).game);
  expect(games.map((game) => game.moves)).toEqual([
    trialGame.moves.slice(0, 2),
    [],
    trialGame.moves.slice(0, 1),
    trialGame.moves,
    recordedGame.moves.slice(0, 2),
    recordedGame.moves,
  ]);
  expect(latest.points[2].key).not.toBe(latest.mainlinePoints[2].key);
  const searches = games.length;
  await act(async () =>
    root.render(
      <Harness
        game={trialGame}
        turn={2}
        mainlineGame={{
          ...recordedGame,
          moves: [...recordedGame.moves, { color: 'W', point: 'F6' }],
        }}
      />,
    ),
  );
  await tick();
  expect(Object.keys(latest.mainlinePoints)).toHaveLength(5);
  expect(streamApi).toHaveBeenCalledTimes(searches + 1);
});

it('continues filling the original record after entering a trial during completion', async () => {
  let firstSignal!: AbortSignal;
  vi.mocked(streamApi)
    .mockImplementationOnce((_endpoint, _body, emit) =>
      Promise.resolve(emit({ type: 'done', analysis: evaluation(3) })),
    )
    .mockImplementationOnce(
      (_endpoint, _body, _emit, signal) =>
        new Promise((_resolve, reject) => {
          firstSignal = signal!;
          signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        }),
    );
  await render(recordedGame);
  await tick();
  expect(Object.keys(latest.points)).toEqual(['3']);
  await act(async () => root.render(<Harness game={trialGame} mainlineGame={recordedGame} />));
  expect(firstSignal.aborted).toBe(true);
  await tick();
  expect(Object.keys(latest.mainlinePoints)).toEqual(['0', '1', '2', '3']);
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
});

it('restarts automatic completion when the engine becomes ready again', async () => {
  await act(async () => root.render(<Harness game={recordedGame} paused />));
  await act(async () => latest.record(recordedGame, evaluation(0, 50), false));
  await act(async () => root.render(<Harness game={recordedGame} ready={false} />));
  await tick();
  expect(streamApi).not.toHaveBeenCalled();
  await render(recordedGame);
  await tick();
  expect(Object.keys(latest.points)).toEqual(['0', '1', '2', '3']);
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
  const ownershipToggle = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === '领地预测',
  )!;
  await act(async () => ownershipToggle.click());
  expect(host.querySelector('[aria-label="候选 A：D4"]')).not.toBeNull();
  await act(async () => toggle.click());
  expect(host.querySelector('[aria-label="候选 A：D4"]')).toBeNull();
  expect(ownershipToggle.getAttribute('aria-pressed')).toBe('true');
  await act(async () => toggle.click());
  await act(async () => ownershipToggle.click());
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
  await tick();
  expect(status.textContent).toContain('曲线分析完成 · 已分析 0 手');
  expect(host.querySelector('.engine-progress')).toBeNull();
});
