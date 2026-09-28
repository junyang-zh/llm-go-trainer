import type { Analysis, EngineConnection, EngineStatus, Game, Training } from '../shared/types';
import type { ModelSelection } from '../shared/models';
export interface AnalysisOptions {
  onProgress?: (analysis: Analysis) => void;
  signal?: AbortSignal;
}
export interface AnalysisEngine {
  status(): EngineStatus;
  analyze(game: Game, training: Training, options?: AnalysisOptions): Promise<Analysis>;
  close(): void | Promise<void>;
}
export interface EngineController {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  connect(connection: EngineConnection): Promise<void>;
  connection(): EngineConnection;
  selectModels?(selection: ModelSelection): Promise<void>;
}
