import { expect, it, vi } from 'vitest';
import { CoachTools } from '../server/coach-tools';
import { trainingForRank } from '../shared/training';
import type { ToolActivity } from '../shared/types';
import { whiteAtari, koGame, coachAnalysis } from './fixtures/coach';
import { recordedGame } from './fixtures/evaluation';
import type { AnalysisEngine } from '../server/engine';

function harness(game = whiteAtari) {
  const events: ToolActivity[] = [];
  const engine: AnalysisEngine = {
    status: () => ({
      configured: true,
      running: true,
      ready: true,
      humanModel: false,
      name: '测试引擎',
    }),
    analyze: vi.fn(async (game, training, options) => {
      options?.onProgress?.(coachAnalysis(game, 50));
      return coachAnalysis(game, training.visits);
    }),
    close() {},
  };
  return {
    engine,
    events,
    tools: new CoachTools(engine, game, trainingForRank('5k'), (event) => events.push(event)),
  };
}
it('inspects actual liberties and legal continuations without changing the game', async () => {
  const original = structuredClone(whiteAtari);
  const { tools, engine } = harness();
  expect((await tools.run('inspect_position', { point: 'D4' })).data.focus).toEqual({
    point: 'D4',
    color: 'W',
    stones: ['D4'],
    liberties: ['D5'],
  });
  const next = await tools.run('inspect_position', { moves: ['D5'], point: 'D4' });
  expect(next.data).toMatchObject({
    position: { toPlay: 'B' },
    moves: [{ color: 'W', point: 'D5' }],
    focus: { color: 'W', stones: ['D4', 'D5'] },
  });
  const tightened = await tools.run('inspect_position', { moves: ['D5', 'E5'], point: 'D4' });
  expect(tightened.data.focus).toMatchObject({ liberties: ['C5', 'D6'] });
  expect(whiteAtari).toEqual(original);
  expect(engine.analyze).not.toHaveBeenCalled();
});
it('searches a selected variation, streams progress and keeps all numbers in Black perspective', async () => {
  const { tools, engine, events } = harness();
  const result = await tools.run('analyze_variation', {
    moves: ['D5'],
    point: 'D4',
    purpose: '检查白棋出头后的应对',
    visits: 2000,
  });
  expect(vi.mocked(engine.analyze).mock.calls[0][0].moves).toEqual([{ color: 'W', point: 'D5' }]);
  expect(result.data).toMatchObject({
    perspective: 'B',
    analysis: { root: { scoreLead: -4.5, winrate: 0.3, visits: 2000 } },
  });
  expect(events.map((event) => event.state)).toEqual(['running', 'running', 'running', 'done']);
  expect(events.at(-1)?.evaluation?.pv).toEqual([
    { color: 'B', point: 'F5' },
    { color: 'W', point: 'G5' },
  ]);
  await tools.run('analyze_variation', { moves: ['D5'], purpose: '重复查询', visits: 2000 });
  expect(engine.analyze).toHaveBeenCalledOnce();
});
it('can search before the last move while retaining the preceding move history', async () => {
  const { tools, engine } = harness(recordedGame);
  await tools.run('analyze_variation', { base: 'before', moves: ['E5'], purpose: '比较替代选点' });
  expect(vi.mocked(engine.analyze).mock.calls[0][0].moves).toEqual([
    ...recordedGame.moves.slice(0, -1),
    { color: 'B', point: 'E5' },
  ]);
  expect(recordedGame.moves.at(-1)?.point).toBe('D6');
});
it('returns illegal moves, ko and invalid arguments as recoverable tool errors without searching', async () => {
  const { tools, engine } = harness(koGame);
  for (const args of [
    { moves: ['C2', 'B2'] },
    { moves: ['T1'] },
    { moves: ['B2'] },
    { visits: 50000 },
    { base: 'before' },
    { game: {} },
  ])
    expect((await tools.run('analyze_variation', { purpose: '检查', ...args })).isError).toBe(true);
  expect(engine.analyze).not.toHaveBeenCalled();
  expect((await tools.run('inspect_position', { point: 'B2' })).isError).toBeUndefined();
});
it('enforces search and call budgets across a coaching request', async () => {
  const { tools, engine } = harness();
  for (const moves of [[], ['D5'], ['D5', 'F5']])
    await tools.run('analyze_variation', { moves, visits: 4000, purpose: '检查变化' });
  const exceeded = await tools.run('analyze_variation', {
    moves: ['D5', 'E5'],
    purpose: '继续搜索',
  });
  expect(exceeded.data.error).toContain('搜索额度');
  expect(engine.analyze).toHaveBeenCalledTimes(3);
  for (let i = 0; i < 8; i++) await tools.run('inspect_position', {});
  expect(tools.available).toBe(false);
  expect((await tools.run('inspect_position', {})).data.error).toContain('调用额度');
});
it('cancels in-flight search and queued calls and rejects late engine progress', async () => {
  const { tools, engine, events } = harness();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(engine.analyze).mockImplementation(
    (_game, _training, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          'abort',
          () => {
            options?.onProgress?.(coachAnalysis(whiteAtari));
            reject(new Error('cancelled'));
          },
          { once: true },
        );
        started();
      }),
  );
  const first = tools.run('analyze_variation', { purpose: '检查安定' });
  const second = tools.run('inspect_position', {});
  const failed = Promise.all([expect(first).rejects.toThrow(), expect(second).rejects.toThrow()]);
  await ready;
  tools.close();
  await failed;
  expect(events.map((event) => event.state)).toEqual(['running', 'stopped']);
  expect(engine.analyze).toHaveBeenCalledOnce();
});

it('queries another historical game and reports the current user trial separately', async () => {
  const { HistoryLibrary } = await import('../server/library');
  const { libraryFixture, firstGameId, secondGameId } = await import('./fixtures/library');
  const library = new HistoryLibrary();
  libraryFixture.games.forEach((item) => library.saveGame(item));
  const context = {
    gameId: firstGameId,
    gameTitle: '第一局',
    turn: 1,
    trialMoves: [{ color: 'W' as const, point: 'D4' }],
  };
  const game = {
    ...libraryFixture.games[0].game,
    moves: [...recordedGame.moves.slice(0, 1), ...context.trialMoves],
  };
  const { engine } = harness(game);
  const tools = new CoachTools(engine, game, trainingForRank('5k'), undefined, undefined, {
    library,
    context,
  });
  const list = await tools.run('query_game_history', { limit: 1 });
  expect(list.data.total).toBe(2);
  expect(list.data.games).toHaveLength(1);
  expect(list.data.currentContext).toEqual(context);
  const previous = await tools.run('query_game_history', { gameId: firstGameId, turn: 1 });
  expect(previous.data.game).toEqual(libraryFixture.games[0].game);
  expect(previous.data.turn).toBe(1);
  expect((await tools.run('query_game_history', { gameId: secondGameId })).data.turn).toBe(0);
  expect((await tools.run('query_game_history', { gameId: secondGameId, turn: 1 })).isError).toBe(
    true,
  );
  const current = await tools.run('inspect_position', { point: 'D4' });
  expect(current.data.focus).toMatchObject({ color: 'W', point: 'D4' });
  expect(current.data.currentContext).toEqual(context);
  expect(engine.analyze).not.toHaveBeenCalled();
});

it('atomically edits, forks, truncates and deletes legal coach trials without changing the real game', async () => {
  const { tools, events, engine } = harness();
  const initial = structuredClone(whiteAtari);
  const create = await tools.run('edit_trial', { id: 'a', moves: ['d5', 'E5'] });
  expect(create.isError).toBeUndefined();
  expect(create.data.selector).toContain('#go/selector/a?branch=a&ply=0');
  expect(events.at(-1)?.trialEdit?.branch?.moves.map((m) => m.point)).toEqual(['D5', 'E5']);
  const failed = await tools.run('edit_trial', {
    id: 'a',
    base: 'branch',
    source: 'a',
    ply: 1,
    moves: ['D4'],
  });
  expect(failed.isError).toBe(true);
  expect(events.at(-1)?.trialEdit).toBeUndefined();
  const fork = await tools.run('edit_trial', {
    id: 'b',
    base: 'branch',
    source: 'a',
    moves: ['pass'],
  });
  expect(
    (fork.data.branch as import('../shared/trial').CoachTrial).moves.map((m) => m.point),
  ).toEqual(['D5', 'E5', 'pass']);
  await tools.run('edit_trial', { id: 'a', base: 'branch', source: 'a', ply: 1, moves: [] });
  expect(events.at(-1)?.trialEdit?.branch?.moves).toEqual([{ color: 'W', point: 'D5' }]);
  expect(
    (await tools.run('edit_trial', { id: 'b', base: 'branch', source: 'b', ply: 9 })).isError,
  ).toBe(true);
  await tools.run('edit_trial', { id: 'a', operation: 'delete' });
  expect(events.at(-1)?.trialEdit).toEqual({ id: 'a', branch: null });
  expect((await tools.run('edit_trial', { id: 'c', base: 'branch', source: 'a' })).isError).toBe(
    true,
  );
  expect(whiteAtari).toEqual(initial);
  expect(engine.analyze).not.toHaveBeenCalled();
});
it('rejects ko and invalid origins when editing trials', async () => {
  const { tools, events } = harness(koGame);
  expect((await tools.run('edit_trial', { id: 'ko', moves: ['C2', 'B2'] })).isError).toBe(true);
  for (const args of [
    { base: 'main', turn: 1 },
    { base: 'main' },
    { turn: 0 },
    { base: 'branch', source: 'missing' },
  ])
    expect((await tools.run('edit_trial', { id: 'a', ...args })).isError).toBe(true);
  expect(events.some((event) => event.trialEdit)).toBe(false);
});
it('distinguishes the original game from the current user trial as branch origins', async () => {
  const { HistoryLibrary } = await import('../server/library');
  const { libraryFixture, firstGameId } = await import('./fixtures/library');
  const library = new HistoryLibrary();
  libraryFixture.games.forEach((game) => library.saveGame(game));
  const original = libraryFixture.games[0].game;
  const context = {
    gameId: firstGameId,
    gameTitle: '第一局',
    turn: 1,
    trialMoves: [{ color: 'W' as const, point: 'D4' }],
  };
  const current = { ...original, moves: [...original.moves.slice(0, 1), ...context.trialMoves] };
  const { engine } = harness();
  const tools = new CoachTools(engine, current, trainingForRank('5k'), undefined, undefined, {
    library,
    context,
  });
  const user = await tools.run('edit_trial', { id: 'user', moves: ['E4'] });
  expect(user.data.branch).toMatchObject({
    baseTurn: 1,
    base: { moves: current.moves },
    moves: [{ color: 'B', point: 'E4' }],
  });
  const main = await tools.run('edit_trial', { id: 'main', base: 'main', turn: 3, moves: ['D4'] });
  expect(main.data.branch).toMatchObject({
    baseTurn: 3,
    base: { moves: original.moves },
    moves: [{ color: 'W', point: 'D4' }],
  });
  expect(library.getGame(firstGameId).game).toEqual(original);
});
