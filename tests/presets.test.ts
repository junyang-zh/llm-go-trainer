import { useRecordFixture } from './fixtures/presets';
import { expect, it } from 'vitest';
import { searchPresets, presetRecord, presetSgf, presetSummary } from '../server/presets';
import { exportSgf, importSgf } from '../shared/sgf';
import { replay } from '../shared/go';
import { HistoryLibrary } from '../server/library';

useRecordFixture();
const earId = 'c0000000-0000-4000-8000-000000000001';
const bloodId = 'c0000000-0000-4000-8000-000000000002';
it('lazily loads legal famous games with intact moves and exportable source attribution', () => {
  for (const [id, count, result] of [
    [earId, 2, 'B+R'],
    [bloodId, 2, 'B+R'],
  ] as const) {
    const record = presetRecord(id)!;
    expect(record.game.moves).toHaveLength(count);
    expect(record.game.metadata.RE).toBe(result);
    expect(() => replay(record.game)).not.toThrow();
    const imported = importSgf(exportSgf(record.game)).game;
    expect(imported.moves).toEqual(record.game.moves);
    expect(imported.metadata.SO).toBe(record.game.metadata.SO);
    expect(imported.metadata.CP).toBe(record.game.metadata.CP);
  }
  expect(presetRecord(earId)!.game.moves[0]).toEqual({ color: 'B', point: 'D16' });
});
it('searches and paginates summaries without sending full games; unavailable records remain exportable', () => {
  const first = searchPresets('', 0, 20),
    second = searchPresets('', 20, 20);
  expect(first.total).toBe(41);
  expect(first.games).toHaveLength(20);
  expect(new Set([...first.games, ...second.games].map((item) => item.id)).size).toBe(40);
  expect(first.games.every((item) => !('game' in item))).toBe(true);
  expect(searchPresets('fixture/1.sgf').games[0].id).toBe(earId);
  expect(searchPresets('FIXTURE 2000').total).toBeGreaterThan(0);
  expect(searchPresets('', 0, 20, earId).games.map((item) => item.id)).toEqual([earId]);
  expect(searchPresets('不存在的棋手').total).toBe(0);
  const unavailable = ['c0000000-0000-4000-8000-000000000141'];
  expect(presetSummary(unavailable[0])!.unavailable).toBeTruthy();
  expect(() => presetRecord(unavailable[0])).toThrow();
  expect(presetSgf(unavailable[0])).toContain('(');
});
it('keeps preset originals read-only', () => {
  const library = new HistoryLibrary();
  const record = presetRecord(earId)!;
  expect(() => library.saveGame(record)).toThrow('只读');
  record.game.moves.length = 0;
  expect(library.getGame(earId).game.moves).toHaveLength(2);
  expect(library.snapshot().games).toEqual([]);
  expect(presetRecord('../../index.json')).toBeUndefined();
});
