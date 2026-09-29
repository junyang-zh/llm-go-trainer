import { join } from 'node:path';
import { expect, it, describe, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  configurePresets,
  searchPresets,
  presetRecord,
  presetSgf,
  presetSummary,
} from '../server/presets';
import type { CwiIndex } from '../shared/presets';
import { exportSgf, importSgf } from '../shared/sgf';
import { replay } from '../shared/go';
import { HistoryLibrary } from '../server/library';

const directory = process.env.GO_TRAINER_TEST_CWI_DIR ?? '';
describe.skipIf(!directory)('downloaded full CWI catalog', () => {
  beforeAll(() => configurePresets(directory));
  const earId = 'c0000000-0000-4000-8000-000000000001';
  const bloodId = 'c0000000-0000-4000-8000-000000000002';
  it('includes every SGF from the pinned full CWI archive with stable, unique IDs and data shards', () => {
    const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8')) as CwiIndex;
    expect(index.files).toBe(96143);
    expect(index.count).toBe(index.files);
    expect(index.rows).toHaveLength(index.count);
    expect(index.sourceSha256).toBe(
      '935522a59817c12b37227e843cd3b4bc8d702e32e0e6fbc80b66d828dbbffcad',
    );
    expect(new Set(index.rows.map((row) => row[0])).size).toBe(index.count);
    expect(index.rows.filter((row) => !row[8])).toHaveLength(index.playable);
    expect(index.playable).toBeGreaterThan(90000);
    const shardFiles = readdirSync(directory).filter((name) => /^\d+\.json$/.test(name));
    const ids = new Set<string>();
    for (const file of shardFiles) {
      const shard = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Record<
        string,
        string
      >;
      for (const [id, sgf] of Object.entries(shard)) {
        expect(sgf).not.toMatch(/(?:^|[;\]])(?:C|GC)\[/);
        ids.add(id);
      }
    }
    expect(ids).toEqual(new Set(index.rows.map((row) => row[0])));
  });
  it('lazily loads legal famous games with intact moves and exportable source attribution', () => {
    for (const [id, count, result] of [
      [earId, 325, 'B+2'],
      [bloodId, 246, 'W+R'],
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
    expect(presetRecord(earId)!.game.moves[126]).toEqual({ color: 'B', point: 'K11' });
  });
  it('searches and paginates summaries without sending full games; unavailable records remain exportable', () => {
    const first = searchPresets('', 0, 20),
      second = searchPresets('', 20, 20);
    expect(first.total).toBe(96143);
    expect(first.games).toHaveLength(20);
    expect(new Set([...first.games, ...second.games].map((item) => item.id)).size).toBe(40);
    expect(first.games.every((item) => !('game' in item))).toBe(true);
    expect(searchPresets('Shusaku/126.sgf').games[0].id).toBe(earId);
    expect(searchPresets('SHUSAKU 1846').total).toBeGreaterThan(0);
    expect(searchPresets('', 0, 20, earId).games.map((item) => item.id)).toEqual([earId]);
    expect(searchPresets('不存在的棋手').total).toBe(0);
    const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8')) as CwiIndex;
    const unavailable = index.rows.find((row) => row[8])!;
    expect(presetSummary(unavailable[0])!.unavailable).toBeTruthy();
    expect(() => presetRecord(unavailable[0])).toThrow();
    expect(presetSgf(unavailable[0])).toContain('(');
  });
  it('keeps CWI originals read-only', () => {
    const library = new HistoryLibrary();
    const record = presetRecord(earId)!;
    expect(() => library.saveGame(record)).toThrow('只读');
    record.game.moves.length = 0;
    expect(library.getGame(earId).game.moves).toHaveLength(325);
    expect(library.snapshot().games).toEqual([]);
    expect(presetRecord('../../index.json')).toBeUndefined();
  });
});
