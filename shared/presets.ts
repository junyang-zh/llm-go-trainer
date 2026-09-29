import type { PresetInfo, SavedGame } from './library';

export const cwiSourceUrl = 'https://homepages.cwi.nl/~aeb/go/games/index.html';
export const cwiArchiveUrl = 'https://homepages.cwi.nl/~aeb/go/games/games.tgz';
export const cwiLicense =
  '公共领域（据 CWI 来源声明）；仅收录落子、摆子与对局事实，不包含现代评注。';
export const cwiPresetInfo: PresetInfo = {
  category: 'famous',
  description: '',
  tags: ['CWI'],
  source: 'Andries E. Brouwer / CWI · Database of Go Games',
  license: cwiLicense,
  licenseUrl: cwiSourceUrl,
};
export interface RecordSummary extends Omit<SavedGame, 'game'> {
  size: number;
  moves: number;
  date?: string;
  unavailable?: string;
  warnings?: string[];
}
export interface RecordPage {
  total: number;
  games: RecordSummary[];
}
export type CwiRow = [
  id: string,
  path: string,
  shard: number,
  title: string,
  size: number,
  moves: number,
  date: string,
  event: string,
  unavailable: string,
  warnings: string[],
];
export interface CwiIndex {
  source: string;
  sourceSha256: string;
  retrievedAt: string;
  files: number;
  count: number;
  playable: number;
  rows: CwiRow[];
}
export function summarizeRecord({ game, ...record }: SavedGame): RecordSummary {
  return { ...record, size: game.size, moves: game.moves.length, date: game.metadata.DT };
}

export interface RecordSource {
  id: 'cwi';
  name: string;
  url: string;
  count: number;
  sizeBytes: number;
  state: 'available' | 'downloading' | 'importing' | 'installed' | 'error';
  bundled: boolean;
  received?: number;
  total?: number;
  processed?: number;
  error?: string;
}
