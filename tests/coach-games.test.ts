import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoachTools } from '../server/coach-tools';
import { HistoryLibrary } from '../server/library';
import { trainingForRank } from '../shared/training';
import type { Game, ToolActivity } from '../shared/types';
import type { BoardContext, SavedGame } from '../shared/library';
import { libraryFixture, firstGameId, secondGameId } from './fixtures/library';
import { coachAnalysis } from './fixtures/coach';
import { useRecordFixture } from './fixtures/presets';

useRecordFixture();
function harness(directory?: string, context?: BoardContext) {
  const library = new HistoryLibrary(directory);
  libraryFixture.games.forEach((game) => library.saveGame(game));
  context ??= { gameId: firstGameId, gameTitle: '第一局', turn: 3, trialMoves: [] };
  const original = library.getGame(context.gameId).game;
  const game = {
    ...original,
    moves: [...original.moves.slice(0, context.turn), ...context.trialMoves],
  };
  const engine = {
    status: () => ({ configured: true, running: true, ready: true, humanModel: false }),
    analyze: vi.fn(async (game: Game) => coachAnalysis(game)),
    close() {},
  };
  const events: ToolActivity[] = [];
  const tools = new CoachTools(
    engine,
    game,
    trainingForRank('5k'),
    (event) => events.push(event),
    undefined,
    { library, context },
  );
  return { library, engine, events, tools, game, context };
}

it('loads a game and turn, changes subsequent inspection/search, and does not reuse another board cache', async () => {
  const { tools, engine, events, context } = harness();
  await tools.run('load_game', { gameId: firstGameId, turn: 0 });
  await tools.run('analyze_variation', { purpose: '第一局开局' });
  const loaded = await tools.run('load_game', { gameId: secondGameId });
  expect(loaded.isError).toBeUndefined();
  expect(loaded.data.currentContext).toMatchObject({
    gameId: secondGameId,
    turn: 0,
    trialMoves: [],
  });
  expect(events.at(-1)?.gameChange).toMatchObject({
    operation: 'load_game',
    record: { id: secondGameId },
  });
  await tools.run('analyze_variation', { purpose: '第二局开局' });
  expect(engine.analyze).toHaveBeenCalledTimes(2);
  expect(engine.analyze.mock.calls[1][0]).toEqual(libraryFixture.games[1].game);
  expect(context.gameId).toBe(firstGameId); // request evidence remains immutable
  const saved = tools.snapshot();
  expect((await tools.run('load_game', { gameId: secondGameId, turn: 1 })).isError).toBe(true);
  expect(tools.snapshot().game).toEqual(saved.game);
  expect(events.at(-1)?.gameChange).toBeUndefined();
});

it('saves the full game in place, renames it, and persists both title and SGF GN to disk', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'coach-games-'));
  try {
    const { tools, library } = harness(directory);
    expect((await tools.run('save_game', { title: '保存的棋局' })).data.record).toMatchObject({
      id: firstGameId,
      title: '保存的棋局',
    });
    expect(library.snapshot().games).toHaveLength(2);
    await tools.run('rename_game', { title: '  新名称  ' });
    expect(new HistoryLibrary(directory).getGame(firstGameId)).toMatchObject({
      title: '新名称',
      game: { metadata: { GN: '新名称' }, moves: libraryFixture.games[0].game.moves },
    });
    expect((await tools.run('inspect_position', {})).data.currentContext).toMatchObject({
      gameTitle: '新名称',
    });
    await tools.run('rename_game', { gameId: secondGameId, title: '另一局' });
    expect(tools.snapshot().context?.gameId).toBe(firstGameId);
    expect((await tools.run('rename_game', { title: '  ' })).isError).toBe(true);
    expect(library.getGame(firstGameId).title).toBe('新名称');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([{ trialMoves: [] }, { trialMoves: [{ color: 'W' as const, point: 'D4' }] }])(
  'saves a reviewed position and user trial as a new lineage without truncating the source: %j',
  async ({ trialMoves }) => {
    const { tools, library } = harness(undefined, {
      gameId: firstGameId,
      gameTitle: '第一局',
      turn: 1,
      trialMoves,
    });
    const result = await tools.run('save_game', { title: '研究' });
    expect(result.isError).toBeUndefined();
    const record = result.data.record as SavedGame;
    expect(record).toMatchObject({ sourceId: firstGameId, groupId: firstGameId, forkTurn: 1 });
    expect(record.id).not.toBe(firstGameId);
    expect(record.game.moves).toEqual([
      ...libraryFixture.games[0].game.moves.slice(0, 1),
      ...trialMoves,
    ]);
    expect(library.getGame(firstGameId)).toEqual(libraryFixture.games[0]);
    expect(tools.snapshot().context).toMatchObject({
      gameId: record.id,
      trialMoves: [],
      turn: record.game.moves.length,
    });
  },
);

it('saves a coach branch from its own source even after loading another game and resuming', async () => {
  const { tools, library, engine, game } = harness();
  await tools.run('edit_trial', { id: 'line', moves: ['D4'] });
  await tools.run('load_game', { gameId: secondGameId });
  const resumed = new CoachTools(
    engine,
    game,
    trainingForRank('5k'),
    undefined,
    undefined,
    { library },
    undefined,
    undefined,
    tools.snapshot(),
  );
  expect((await resumed.run('inspect_position', {})).data.currentContext).toMatchObject({
    gameId: secondGameId,
  });
  await resumed.run('edit_trial', {
    id: 'extended',
    base: 'branch',
    source: 'line',
    moves: ['E4'],
  });
  const result = await resumed.run('save_game', { branchId: 'extended', title: '分支' });
  expect(result.isError).toBeUndefined();
  expect(result.data.record).toMatchObject({
    sourceId: firstGameId,
    groupId: firstGameId,
    forkTurn: 3,
  });
  expect((result.data.record as SavedGame).game.moves).toHaveLength(5);
  expect((await resumed.run('save_game', { branchId: 'missing' })).isError).toBe(true);
  expect(library.snapshot().games).toHaveLength(3);
});

it('keeps presets read-only, copies them with attribution, and preserves lineage on another explicit copy', async () => {
  const { tools, library } = harness();
  const result = await tools.run('query_game_history', {
    category: 'famous',
    query: 'fixture/1.sgf',
  });
  const id = (result.data.games as SavedGame[])[0].id;
  await tools.run('load_game', { gameId: id });
  expect((await tools.run('rename_game', { title: '不能修改' })).isError).toBe(true);
  const saved = await tools.run('save_game', { title: '经典研究' });
  const record = saved.data.record as SavedGame;
  expect(record).toMatchObject({ sourceId: id, groupId: id, forkTurn: 2 });
  expect(record.game.metadata.CP).toBe(library.getGame(id).game.metadata.CP);
  expect(record.game.metadata.SO).toBe(library.getGame(id).game.metadata.SO);
  expect(library.getGame(id).title).not.toBe('经典研究');
  const copy = await tools.run('save_game', { asCopy: true });
  expect(copy.data.record).toMatchObject({ sourceId: record.id, groupId: id, forkTurn: 2 });
});

it('rejects cancelled writes and missing games without emitting successful changes', async () => {
  const { tools, library, events } = harness();
  expect((await tools.run('load_game', { gameId: crypto.randomUUID() })).isError).toBe(true);
  expect(
    (await tools.run('rename_game', { gameId: crypto.randomUUID(), title: '不存在' })).isError,
  ).toBe(true);
  tools.close();
  await expect(tools.run('save_game', { asCopy: true })).rejects.toThrow();
  expect(library.snapshot()).toEqual(libraryFixture);
  expect(events.some((event) => event.gameChange)).toBe(false);
});

it('retains the game result on a full copy and removes it when saving a partial position', async () => {
  const { tools, library } = harness();
  const source = library.getGame(firstGameId);
  source.game.metadata.RE = 'B+3.5';
  library.saveGame(source);
  await tools.run('load_game', { gameId: firstGameId });
  const full = await tools.run('save_game', { asCopy: true });
  expect((full.data.record as SavedGame).game.metadata.RE).toBe('B+3.5');
  await tools.run('load_game', { gameId: firstGameId, turn: 1 });
  const partial = await tools.run('save_game', {});
  expect((partial.data.record as SavedGame).game.metadata.RE).toBeUndefined();
});
