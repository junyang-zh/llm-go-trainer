import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AppUpdater, UpdateInfo, CancellationToken } from 'electron-updater';
import type { AppEdition, UpdateStatus } from '../shared/updates';

export const RELEASES_URL = 'https://github.com/junyang-zh/llm-go-trainer/releases/latest';
export function updateFeed(edition: AppEdition) {
  return {
    provider: 'github' as const,
    owner: 'junyang-zh',
    repo: 'llm-go-trainer',
    private: false,
    channel: edition === 'minimal' ? 'minimal' : 'latest',
  };
}
// Reject metadata that would switch editions or target another platform.
export function matchesEdition(info: UpdateInfo, edition: AppEdition, platform: string) {
  const target = platform === 'darwin' ? 'mac-arm64' : 'windows-x64';
  const base = `LLM-Go-Trainer-${info.version}-${target}${edition === 'minimal' ? '-minimal' : ''}`;
  const extensions = platform === 'darwin' ? ['zip', 'dmg'] : ['exe'];
  return (
    !!info.files?.length &&
    info.files.every((file) => extensions.some((extension) => file.url === `${base}.${extension}`))
  );
}

interface Options {
  version: string;
  edition: AppEdition;
  platform: string;
  supported: boolean;
  canInstall: boolean;
  reason?: string;
  settingsFile: string;
  updater?: AppUpdater;
  beforeInstall: () => Promise<void>;
}
export class DesktopUpdates {
  private state: UpdateStatus;
  private task?: Promise<UpdateStatus>;
  private timer?: ReturnType<typeof setInterval>;
  private startup?: ReturnType<typeof setTimeout>;
  private settingsQueue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private cancellation?: CancellationToken;
  constructor(private options: Options) {
    this.state = {
      version: options.version,
      edition: options.edition,
      supported: options.supported,
      canInstall: options.canInstall,
      reason: options.reason,
      automatic: false,
      phase: 'idle',
    };
    const updater = options.updater;
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    // Each edition has its own full installer; don't reuse another edition's block map.
    updater.disableDifferentialDownload = true;
    updater.setFeedURL(updateFeed(options.edition));
    const supportsSystem = updater.isUpdateSupported.bind(updater);
    updater.isUpdateSupported = async (info) => {
      if (!matchesEdition(info, options.edition, options.platform))
        throw new Error('更新文件与当前系统或版本类型不匹配');
      return supportsSystem(info);
    };
    updater.on('update-available', (info) => {
      this.state = {
        ...this.state,
        phase: 'available',
        latestVersion: info.version,
        error: undefined,
      };
    });
    updater.on('update-not-available', () => {
      this.state = { ...this.state, phase: 'current', latestVersion: undefined, error: undefined };
    });
    updater.on('download-progress', (value) => {
      this.state.progress = Math.max(0, Math.min(100, value.percent));
    });
    updater.on('update-downloaded', (info) => {
      this.state = {
        ...this.state,
        phase: 'downloaded',
        latestVersion: info.version,
        progress: 100,
        error: undefined,
      };
    });
    updater.on('error', (error) => this.failed(error));
  }
  status(): UpdateStatus {
    return { ...this.state };
  }
  private failed(error: unknown) {
    this.state = {
      ...this.state,
      phase: 'error',
      progress: undefined,
      error: error instanceof Error ? error.message.split('\n')[0] : String(error),
    };
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.options.settingsFile, 'utf8'));
      this.state.automatic = value.automatic === true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.failed(new Error('更新设置读取失败，可重新设置自动更新'));
    }
    if (this.options.supported) {
      const check = () => {
        if (this.state.automatic) void this.check();
      };
      this.startup = setTimeout(check, 15000);
      this.timer = setInterval(check, 4 * 60 * 60 * 1000);
      this.startup.unref();
      this.timer.unref();
    }
  }
  async automatic(value: boolean) {
    if (typeof value !== 'boolean') throw new Error('自动更新设置必须为布尔值');
    const save = this.settingsQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.options.settingsFile), { recursive: true });
        const temp = this.options.settingsFile + '.tmp';
        await writeFile(temp, JSON.stringify({ automatic: value }), { mode: 0o600 });
        await rename(temp, this.options.settingsFile);
        this.state.automatic = value;
      });
    this.settingsQueue = save;
    await save;
    if (value) void this.check();
    return this.status();
  }
  check(): Promise<UpdateStatus> {
    if (this.task) return this.task;
    if (
      this.disposed ||
      !this.state.supported ||
      !this.options.updater ||
      ['downloaded', 'installing'].includes(this.state.phase)
    )
      return Promise.resolve(this.status());
    this.state = {
      ...this.state,
      phase: 'checking',
      error: undefined,
      progress: undefined,
      latestVersion: undefined,
    };
    this.task = Promise.resolve()
      .then(async () => {
        try {
          const result = await this.options.updater!.checkForUpdates();
          if (!result) throw new Error('当前安装方式不支持更新检查');
          this.cancellation = result.cancellationToken;
          this.state.checkedAt = new Date().toISOString();
          if (
            this.state.automatic &&
            this.state.canInstall &&
            this.state.phase === 'available' &&
            !this.disposed
          )
            await this.downloadSelected();
        } catch (error) {
          this.failed(error);
        }
        return this.status();
      })
      .finally(() => {
        this.task = undefined;
      });
    return this.task;
  }
  private async downloadSelected() {
    this.state = { ...this.state, phase: 'downloading', progress: 0, error: undefined };
    await this.options.updater!.downloadUpdate(this.cancellation);
  }
  download(): Promise<UpdateStatus> {
    if (this.task) return this.task;
    if (
      this.disposed ||
      !this.state.canInstall ||
      !this.options.updater ||
      this.state.phase !== 'available'
    )
      return Promise.resolve(this.status());
    this.task = this.downloadSelected()
      .catch((error) => this.failed(error))
      .then(() => this.status())
      .finally(() => {
        this.task = undefined;
      });
    return this.task;
  }
  async install() {
    if (this.disposed || !this.state.canInstall || this.state.phase !== 'downloaded')
      throw new Error('请先下载完整更新');
    this.state.phase = 'installing';
    try {
      await this.settingsQueue;
      await this.options.beforeInstall();
      this.options.updater!.quitAndInstall(false, true);
    } catch (error) {
      this.failed(error);
    }
    return this.status();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.startup);
    clearInterval(this.timer);
    this.cancellation?.cancel();
  }
}
