import type { SavedGame } from './library';

export interface FoxGame {
  chessId: string;
  black: string;
  white: string;
  date: string;
  moves?: number;
  downloaded?: boolean;
}
export interface FoxCatalog {
  uid: string;
  nickname: string;
  games: FoxGame[];
}
export interface FoxImport {
  record: SavedGame;
  warnings: string[];
}
