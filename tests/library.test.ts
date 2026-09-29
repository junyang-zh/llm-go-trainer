import { useRecordFixture } from './fixtures/presets';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { HistoryLibrary } from '../server/library';
import { libraryFixture } from './fixtures/library';
import { newGame, toIndex } from '../shared/go';
import { trialStoneNumbers } from '../shared/trial';
import { configurePresets, presetRecord } from '../server/presets';
import { randomUUID } from 'node:crypto';

it('persists multi-generation source groups, preserves rights, and rejects false ancestry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'go-lineage-test-'));
  try {
    const library = new HistoryLibrary(directory);
    const source = presetRecord('c0000000-0000-4000-8000-000000000001')!;
    const branch = {
      id: randomUUID(),
      title: '试下',
      updatedAt: source.updatedAt,
      sourceId: source.id,
      groupId: source.id,
      forkTurn: 2,
      game: { ...source.game, metadata: { GN: '试下' }, moves: source.game.moves.slice(0, 2) },
    };
    const saved = library.saveGame(branch);
    expect(saved.game.metadata.CP).toBe(source.game.metadata.CP);
    const child = library.saveGame({
      ...saved,
      id: randomUUID(),
      sourceId: saved.id,
      forkTurn: 1,
      game: { ...saved.game, moves: saved.game.moves.slice(0, 1) },
    });
    const reopened = new HistoryLibrary(directory);
    expect(reopened.getGame(child.id)).toMatchObject({
      sourceId: saved.id,
      groupId: source.id,
      forkTurn: 1,
    });
    expect(reopened.getGame(source.id).game.moves).toHaveLength(2);
    expect(() => library.saveGame({ ...branch, id: randomUUID(), groupId: randomUUID() })).toThrow(
      '不匹配',
    );
    expect(() => library.saveGame({ ...branch, id: randomUUID(), forkTurn: 326 })).toThrow('超出');
    expect(() =>
      library.saveGame({ ...branch, id: randomUUID(), game: { ...branch.game, moves: [] } }),
    ).toThrow('超出');
    expect(() => library.saveGame({ ...saved, sourceId: child.id })).toThrow('不能改变');
    expect(() =>
      library.saveGame({ ...branch, id: randomUUID(), game: { ...branch.game, komi: 7.5 } }),
    ).toThrow('保留');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('atomically persists independent records across restarts and rejects illegal game updates', () => {
  const directory = mkdtempSync(join(tmpdir(), 'go-history-test-'));
  try {
    const library = new HistoryLibrary(directory);
    const first = libraryFixture.games[0];
    library.saveGame(first);
    library.saveGame(libraryFixture.games[1]);
    const conversation = {
      id: '33333333-3333-4333-8333-333333333333',
      title: '跨局对话',
      updatedAt: first.updatedAt,
      messages: [],
      history: [],
      draft: '保留问题',
    };
    library.saveConversation(conversation);
    expect(() =>
      library.saveGame({
        ...first,
        game: { ...first.game, moves: [...first.game.moves, { color: 'W', point: 'C3' }] },
      }),
    ).toThrow('已有棋子');
    const reopened = new HistoryLibrary(directory);
    expect(reopened.snapshot().games).toHaveLength(2);
    expect(reopened.getGame(first.id)).toEqual(first);
    expect(reopened.snapshot().conversations).toEqual([conversation]);
    const copy = reopened.getGame(first.id);
    copy.game.moves.length = 0;
    expect(reopened.getGame(first.id).game.moves).toHaveLength(3);
    expect(() => reopened.saveGame({ ...first, id: '../../outside' })).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it('removes captured trial markers and respects superko/legal play through shared rules', () => {
  const game = { ...newGame(9), initialStones: [{ color: 'W' as const, point: 'A2' }] };
  const moves = [
    { color: 'B' as const, point: 'A1' },
    { color: 'W' as const, point: 'B1' },
  ];
  expect(trialStoneNumbers(game, 0, moves)).toEqual(new Map([[toIndex('B1', 9), 2]]));
  expect(game.moves).toHaveLength(0);
  expect(() => trialStoneNumbers(game, 0, [{ color: 'B', point: 'A2' }])).toThrow('已有棋子');
});
it('numbers trials relative to the historical turn, including passes and replayed points', () => {
  const game = libraryFixture.games[0].game;
  const moves = [
    { color: 'B' as const, point: 'D4' },
    { color: 'W' as const, point: 'pass' },
    { color: 'B' as const, point: 'E4' },
  ];
  expect(trialStoneNumbers(game, 2, moves)).toEqual(
    new Map([
      [toIndex('D4', 9), 1],
      [toIndex('E4', 9), 3],
    ]),
  );
  const captureGame = { ...newGame(9), initialStones: [{ color: 'W' as const, point: 'A2' }] };
  expect(
    trialStoneNumbers(captureGame, 0, [
      { color: 'B', point: 'A1' },
      { color: 'W', point: 'B1' },
      { color: 'B', point: 'pass' },
      { color: 'W', point: 'A1' },
    ]),
  ).toEqual(
    new Map([
      [toIndex('B1', 9), 2],
      [toIndex('A1', 9), 4],
    ]),
  );
});

it('renames persisted branches with missing optional catalogs while keeping source identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'go-rename-test-'));
  const source = presetRecord('c0000000-0000-4000-8000-000000000001')!;
  try {
    const library = new HistoryLibrary(directory);
    const branch = library.saveGame({
      ...source,
      preset: undefined,
      id: randomUUID(),
      sourceId: source.id,
      groupId: source.id,
      forkTurn: 2,
      game: { ...source.game, moves: source.game.moves.slice(0, 2) },
    });
    configurePresets(join(directory, 'absent'));
    const renamed = library.renameGame(branch.id, '  我的研究  ');
    expect(renamed.title).toBe('我的研究');
    expect(renamed.game.metadata.GN).toBe('我的研究');
    expect(renamed).toMatchObject({ sourceId: source.id, groupId: source.id, forkTurn: 2 });
    expect(renamed.game.moves).toEqual(branch.game.moves);
    expect(library.saveGame(renamed)).toEqual(renamed);
    expect(new HistoryLibrary(directory).getGame(branch.id)).toEqual(renamed);
    expect(() => library.renameGame(source.id, 'change')).toThrow('只读');
    expect(() => library.saveGame(source)).toThrow('只读');
    expect(() => library.renameGame(branch.id, '  ')).toThrow();
    expect(() => library.renameGame(branch.id, 'x'.repeat(201))).toThrow();
  } finally {
    configurePresets(recordFixture.directory);
    rmSync(directory, { recursive: true, force: true });
  }
});

const recordFixture = useRecordFixture();
