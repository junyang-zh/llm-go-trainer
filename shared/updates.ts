export type AppEdition = 'standard' | 'minimal';
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';
export interface UpdateStatus {
  version: string;
  edition: AppEdition;
  supported: boolean;
  canInstall: boolean;
  reason?: string;
  automatic: boolean;
  phase: UpdatePhase;
  latestVersion?: string;
  progress?: number;
  checkedAt?: string;
  error?: string;
}
export interface UpdateBridge {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
  automatic(value: boolean): Promise<UpdateStatus>;
  openRelease(): Promise<void>;
}
declare global {
  interface Window {
    goTrainerUpdates?: UpdateBridge;
  }
}
