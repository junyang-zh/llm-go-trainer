import type { Analysis, AnalysisPhase, ChatMessage, Game, Move, ToolActivity } from './types';

export interface BoardContext {
  gameId: string;
  gameTitle: string;
  turn: number;
  trialMoves: Move[];
}
export interface AnalysisMessage {
  id: string;
  question: string;
  text: string;
  status: string;
  state: 'running' | 'done' | 'stopped' | 'error' | 'paused';
  continuationId?: string;
  evaluations: Partial<Record<AnalysisPhase, { analysis: Analysis; final: boolean }>>;
  tools?: ToolActivity[];
  trials?: Record<string, import('./trial').CoachTrial>;
  context?: BoardContext;
  createdAt?: string;
}
export interface SavedGame {
  id: string;
  title: string;
  updatedAt: string;
  game: Game;
  // The root ID identifies the group; roots need no rewrite when their first branch is saved.
  groupId?: string;
  sourceId?: string;
  forkTurn?: number;
  preset?: PresetInfo;
}
export type RecordCategory = 'history' | 'famous' | 'joseki' | 'tsumego';
export interface PresetInfo {
  category: Exclude<RecordCategory, 'history'>;
  description: string;
  tags: string[];
  source: string;
  sourceUrl?: string;
  license: string;
  licenseUrl?: string;
}
export const recordGroupId = (record: Pick<SavedGame, 'id' | 'groupId'>) =>
  record.groupId ?? record.id;
export function matchesRecord(record: SavedGame, query: string) {
  const text = [
    record.title,
    ...Object.values(record.game.metadata),
    record.preset?.description,
    ...(record.preset?.tags ?? []),
  ]
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();
  return query
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: AnalysisMessage[];
  history: ChatMessage[];
  draft: string;
  evidence?: unknown;
}
export interface Library {
  games: SavedGame[];
  conversations: Conversation[];
}
export function gameTitle(game: Game) {
  return (
    game.metadata.GN ||
    `${game.metadata.PB || '黑方'} vs ${game.metadata.PW || '白方'} · ${game.size} 路`
  ).slice(0, 200);
}
