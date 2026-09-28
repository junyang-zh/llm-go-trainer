import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { HistoryLibrary } from '../server/library';
import { libraryFixture } from './fixtures/library';
import { newGame, toIndex } from '../shared/go';
import { trialStoneIndices } from '../shared/trial';

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
  expect(trialStoneIndices(game, 0, moves)).toEqual([toIndex('B1', 9)]);
  expect(game.moves).toHaveLength(0);
  expect(() => trialStoneIndices(game, 0, [{ color: 'B', point: 'A2' }])).toThrow('已有棋子');
});
