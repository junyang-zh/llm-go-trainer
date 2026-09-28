import { EventEmitter } from 'node:events';
import type { AppUpdater, UpdateInfo } from 'electron-updater';
import { vi } from 'vitest';

export const updateInfo: UpdateInfo = {
  version: '0.2.0',
  releaseDate: '2026-09-28T00:00:00Z',
  files: [{ url: 'LLM-Go-Trainer-0.2.0-windows-x64.exe', sha512: 'fixture' }],
  path: 'LLM-Go-Trainer-0.2.0-windows-x64.exe',
  sha512: 'fixture',
};
export class TestUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  disableWebInstaller = false;
  disableDifferentialDownload = false;
  isUpdateSupported: (info: UpdateInfo) => boolean | Promise<boolean> = () => true;
  setFeedURL = vi.fn();
  cancel = vi.fn();
  info = structuredClone(updateInfo);
  checkForUpdates = vi.fn(async () => {
    await this.isUpdateSupported(this.info);
    this.emit('update-available', this.info);
    return { updateInfo: this.info, cancellationToken: { cancel: this.cancel } };
  });
  downloadUpdate = vi.fn(async () => {
    this.emit('download-progress', { percent: 40 });
    this.emit('update-downloaded', this.info);
    return ['fixture-installer'];
  });
  quitAndInstall = vi.fn();
  adapter() {
    return this as unknown as AppUpdater;
  }
}
