export type ModelTier = 'light' | 'balanced' | 'advanced' | 'other' | 'human';
export interface KataGoModel {
  id: string;
  name: string;
  url: string;
  sha256: string;
  bytes?: number;
  role: 'main' | 'human';
  tier: ModelTier;
  architecture: string;
  description: string;
  boards: number[];
  source: string;
}
export interface ModelSelection {
  main: string;
  human: string | null;
}
export interface ModelEntry extends KataGoModel {
  installed: boolean;
  diskBytes: number;
  phase: 'missing' | 'queued' | 'downloading' | 'installed' | 'error' | 'canceled';
  received?: number;
  total?: number;
  error?: string;
}
export interface ModelsView {
  models: ModelEntry[];
  selected: ModelSelection;
  pending?: ModelSelection;
  storageBytes: number;
  catalogUpdatedAt?: string;
  notice?: string;
  canSelect: boolean;
}
