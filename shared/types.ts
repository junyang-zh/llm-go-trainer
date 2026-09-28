export type Color = 'B' | 'W';
export type Rules = 'chinese' | 'japanese';
export interface Move {
  color: Color;
  point: string;
}
export interface Game {
  size: number;
  komi: number;
  rules: Rules;
  initialPlayer: Color;
  initialStones: Move[];
  moves: Move[];
  metadata: Record<string, string>;
}
export interface Candidate {
  move: string;
  order: number;
  visits: number;
  winrate: number;
  scoreLead: number;
  scoreStdev?: number;
  prior: number;
  pv: string[];
  humanPrior?: number;
}
export interface Analysis {
  searchStats?: { elapsedMs: number; visitsPerSecond: number };
  id: string;
  turnNumber: number;
  perspective: 'B';
  rootInfo: { winrate: number; scoreLead: number; visits: number; currentPlayer?: Color };
  moveInfos: Candidate[];
  ownership?: number[];
  policy?: number[];
  humanPolicy?: number[];
}
export interface Training {
  searchLimit?: 'visits' | 'time';
  maxTime?: number;
  rank: string;
  mode: 'human' | 'balanced' | 'strong';
  randomness: number;
  aggression: number;
  maxLoss: number;
  visits: number;
}
export type CoachAction = 'move' | 'position' | 'variation' | 'chat';
export type Provider = 'deepseek' | 'codex' | 'claude';
export type ProviderPreference = 'auto' | Provider;
export interface ProviderAvailability {
  available: boolean;
  state:
    'ready' | 'unconfigured' | 'missing' | 'unauthenticated' | 'unreachable' | 'model-unavailable';
}
export interface LlmStatus {
  preference: ProviderPreference;
  selected: Provider | null;
  providers: Record<Provider, ProviderAvailability>;
  error?: string;
}
export interface LlmSettingsView extends LlmStatus {
  deepseek: {
    baseUrl: string;
    model: string;
    effort: string;
    keyConfigured: boolean;
    keySource: 'app' | 'env' | 'none';
  };
  codex: { model: string; effort: string };
  claude: { model: string; effort: string };
  models: Record<Provider, { id: string; efforts: string[] }[]>;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export type AnalysisPhase = 'before' | 'after';
export interface ToolActivity {
  id: string;
  name: string;
  label: string;
  state: 'running' | 'done' | 'error' | 'stopped';
  baseTurn?: number;
  moves?: Move[];
  detail?: string;
  elapsedMs?: number;
  evaluation?: { visits: number; winrate: number; scoreLead: number; pv: Move[] };
}
export type StreamEvent =
  | { type: 'status'; text: string }
  | { type: 'tool'; activity: ToolActivity }
  | { type: 'analysis'; phase: AnalysisPhase; analysis: Analysis; final: boolean }
  | { type: 'text'; text: string }
  | {
      type: 'done';
      answer?: string;
      evidence?: unknown;
      analysis: Analysis | null;
      move?: string;
      method?: string;
    }
  | { type: 'error'; error: string };
export type EnginePhase =
  'idle' | 'downloading' | 'installing' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'error';
export type ManagedBackend = 'opencl' | 'cuda';
export type EngineConnection =
  { mode: 'managed'; backend?: ManagedBackend } | { mode: 'external'; name: string; url: string };
export interface EngineStatus {
  configured: boolean;
  running: boolean;
  humanModel: boolean;
  ready?: boolean;
  phase?: EnginePhase;
  mode?: EngineConnection['mode'];
  name?: string;
  backend?: string;
  availableBackends?: ManagedBackend[];
  selectedBackend?: ManagedBackend;
  modelName?: string;
  pid?: number;
  error?: string;
  progress?: { label: string; received: number; total?: number };
}
export interface Status {
  engine: EngineStatus;
  providers: { deepseek: boolean; codex: boolean; claude: boolean };
  llm: LlmStatus;
}
