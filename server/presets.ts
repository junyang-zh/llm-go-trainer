import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importSgf } from '../shared/sgf';
import {
  cwiPresetInfo,
  type CwiIndex,
  type CwiRow,
  type RecordPage,
  type RecordSummary,
} from '../shared/presets';
import type { SavedGame } from '../shared/library';
import type { RecordCategory } from '../shared/library';

let directory = join(import.meta.dirname, '../.local/records/cwi');
export function configurePresets(path: string) {
  directory = path;
  catalog = undefined;
  shards.clear();
}
export function presetsAvailable() {
  return existsSync(join(directory, 'index.json'));
}

let catalog: CwiIndex | undefined;
let rows: Map<string, CwiRow>;
let search: string[];
const shards = new Map<number, Record<string, string>>();
function index() {
  if (!catalog) {
    catalog = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8')) as CwiIndex;
    rows = new Map(catalog.rows.map((row) => [row[0], row]));
    search = catalog.rows.map((row) =>
      [row[1], row[3], row[6], row[7]].join(' ').normalize('NFKC').toLowerCase(),
    );
  }
  return catalog;
}
function rowFor(id: string) {
  if (!id.startsWith('c0000000-')) return undefined;
  if (!presetsAvailable()) return undefined;
  index();
  return rows.get(id);
}
export function presetSummary(id: string): RecordSummary | undefined {
  const row = rowFor(id);
  return row && summary(row);
}
function summary(row: CwiRow): RecordSummary {
  return {
    id: row[0],
    title: row[3],
    updatedAt: index().retrievedAt,
    size: row[4],
    moves: row[5],
    date: row[6],
    unavailable: row[8] || undefined,
    warnings: row[9],
    preset: {
      ...cwiPresetInfo,
      tags: ['CWI', row[1].split('/')[0]],
      description: row[7],
      sourceUrl:
        'https://homepages.cwi.nl/~aeb/go/games/games/' +
        row[1].split('/').map(encodeURIComponent).join('/'),
    },
  };
}
export function searchPresets(
  query = '',
  offset = 0,
  limit = 20,
  groupId?: string,
  category?: RecordCategory,
): RecordPage {
  if (category && category !== 'famous') return { total: 0, games: [] };
  if (!presetsAvailable()) return { total: 0, games: [] };
  const data = index();
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
  let total = 0;
  const games: RecordSummary[] = [];
  for (const [i, row] of data.rows.entries()) {
    if (groupId && row[0] !== groupId) continue;
    if (!words.every((word) => search[i].includes(word))) continue;
    if (total >= offset && games.length < limit) games.push(summary(row));
    total++;
  }
  return { total, games };
}
export function presetSgf(id: string): string {
  const row = rowFor(id);
  if (!row) throw new Error('找不到预置棋谱');
  const shardId = row[2];
  let shard = shards.get(shardId);
  if (!shard) {
    shard = JSON.parse(readFileSync(join(directory, `${shardId}.json`), 'utf8')) as Record<
      string,
      string
    >;
    if (shards.size >= 4) shards.delete(shards.keys().next().value!);
    shards.set(shardId, shard);
  }
  return shard[id];
}
export function presetRecord(id: string): SavedGame | undefined {
  const item = presetSummary(id);
  if (!item) return undefined;
  if (item.unavailable) throw new Error(item.unavailable);
  const { game } = importSgf(presetSgf(id));
  game.metadata.GN = item.title;
  game.metadata.SO = `${item.preset!.source} · ${item.preset!.sourceUrl}`;
  game.metadata.CP = `${item.preset!.license} · ${item.preset!.licenseUrl}`;
  return { id: item.id, title: item.title, updatedAt: item.updatedAt, preset: item.preset, game };
}
