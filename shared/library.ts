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
  state: 'running' | 'done' | 'stopped' | 'error';
  evaluations: Partial<Record<AnalysisPhase, { analysis: Analysis; final: boolean }>>;
  tools?: ToolActivity[];
  context?: BoardContext;
  createdAt?: string;
}
export interface SavedGame {
  id: string;
  title: string;
  updatedAt: string;
  game: Game;
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
