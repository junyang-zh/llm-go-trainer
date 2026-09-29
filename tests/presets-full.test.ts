import { join } from 'node:path';
import { expect, it, describe, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { configurePresets, searchPresets, presetRecord } from '../server/presets';
import type { CwiIndex } from '../shared/presets';
import { replay } from '../shared/go';

const directory = process.env.GO_TRAINER_TEST_CWI_DIR ?? '';
// API behavior uses the small fixture in presets.test.ts; this suite checks release data.
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
  it('loads the expected famous games from the full catalog', () => {
    for (const [id, count, result] of [
      [earId, 325, 'B+2'],
      [bloodId, 246, 'W+R'],
    ] as const) {
      const record = presetRecord(id)!;
      expect(record.game.moves).toHaveLength(count);
      expect(record.game.metadata.RE).toBe(result);
      expect(() => replay(record.game)).not.toThrow();
    }
    expect(searchPresets('Shusaku/126.sgf').games[0].id).toBe(earId);
    expect(searchPresets('SHUSAKU 1846').total).toBeGreaterThan(0);
    expect(presetRecord(earId)!.game.moves[126]).toEqual({ color: 'B', point: 'K11' });
  });
});
