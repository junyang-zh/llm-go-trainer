import type { SavedGame } from './library';

export interface RecordTreePage {
  id: string;
  rootId: string;
  title: string;
  breadcrumbs: { id: string; title: string }[];
  children: { id: string; title: string; point?: string }[];
  comment: string;
  annotations: Record<string, string[]>;
  record?: SavedGame;
  unavailable?: string;
  warnings: string[];
}
