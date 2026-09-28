import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopUpdates, matchesEdition, updateFeed } from '../desktop/updater';
import { TestUpdater, updateInfo } from './fixtures/updater';

const controllers: DesktopUpdates[] = [];
const directories: string[] = [];
async function setup(canInstall = true) {
  const dir = await mkdtemp(join(tmpdir(), 'go-updates-'));
  directories.push(dir);
  const updater = new TestUpdater();
  const beforeInstall = vi.fn(async () => {});
  const options = {
    version: '0.1.1',
    edition: 'standard' as const,
    platform: 'win32',
    supported: true,
    canInstall,
    settingsFile: join(dir, 'updates.json'),
    updater: updater.adapter(),
    beforeInstall,
  };
  const controller = new DesktopUpdates(options);
  controllers.push(controller);
  await controller.load();
  return { controller, updater, beforeInstall, options };
}
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.useRealTimers();
});
it('checks once for concurrent requests and only downloads after an explicit request', async () => {
  const { controller, updater, beforeInstall } = await setup();
  expect(updater.setFeedURL).toHaveBeenCalledWith(updateFeed('standard'));
  expect(updater.autoInstallOnAppQuit).toBe(false);
  expect(updater.allowDowngrade).toBe(false);
  expect(updater.allowPrerelease).toBe(false);
  await Promise.all([controller.check(), controller.check()]);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  expect(controller.status().phase).toBe('available');
  await controller.download();
  expect(controller.status().phase).toBe('downloaded');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  updater.quitAndInstall.mockImplementation(() => {
    expect(beforeInstall).toHaveBeenCalledTimes(1);
  });
  await controller.install();
  expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  await expect(controller.install()).rejects.toThrow('下载完整更新');
});
it('persists automatic updates, downloads on checks, and never restarts automatically', async () => {
  const { controller, updater, options } = await setup();
  await controller.automatic(true);
  await controller.check();
  expect(controller.status().phase).toBe('downloaded');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(options.settingsFile, 'utf8'))).toEqual({ automatic: true });
  const restored = new DesktopUpdates({ ...options, updater: new TestUpdater().adapter() });
  controllers.push(restored);
  await restored.load();
  expect(restored.status().automatic).toBe(true);
  await restored.automatic(false);
  expect(restored.status().automatic).toBe(false);
  await expect(restored.automatic('true' as unknown as boolean)).rejects.toThrow('布尔值');
});
it('checks automatically after startup and stops scheduling after disposal', async () => {
  const { controller, options } = await setup();
  await controller.automatic(true);
  await controller.check();
  controller.dispose();
  vi.useFakeTimers();
  const updater = new TestUpdater();
  const restored = new DesktopUpdates({ ...options, updater: updater.adapter() });
  controllers.push(restored);
  await restored.load();
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15000);
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  restored.dispose();
  expect(updater.cancel).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});
it('surfaces network errors and allows a fresh retry without stale update metadata', async () => {
  const { controller, updater } = await setup();
  updater.checkForUpdates.mockImplementationOnce(() => {
    throw new Error('Update configuration error');
  });
  expect((await controller.check()).error).toBe('Update configuration error');
  updater.checkForUpdates.mockRejectedValueOnce(new Error('GitHub timeout'));
  expect((await controller.check()).error).toBe('GitHub timeout');
  expect((await controller.check()).phase).toBe('available');
  updater.downloadUpdate.mockRejectedValueOnce(new Error('Checksum mismatch'));
  expect((await controller.download()).error).toBe('Checksum mismatch');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  await controller.check();
  expect((await controller.download()).phase).toBe('downloaded');
});
it('never installs before cleanup succeeds or downloads when signing is unavailable', async () => {
  const { controller, updater } = await setup(false);
  await controller.automatic(true);
  await controller.check();
  await controller.download();
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  await expect(controller.install()).rejects.toThrow();
  const signed = await setup();
  await signed.controller.check();
  await signed.controller.download();
  signed.beforeInstall.mockRejectedValueOnce(new Error('Unable to stop engine'));
  expect((await signed.controller.install()).phase).toBe('error');
  expect(signed.updater.quitAndInstall).not.toHaveBeenCalled();
});
it('rejects cross-edition, external and cross-platform update payloads', async () => {
  expect(updateFeed('minimal').channel).toBe('minimal');
  expect(matchesEdition(updateInfo, 'standard', 'win32')).toBe(true);
  expect(matchesEdition(updateInfo, 'minimal', 'win32')).toBe(false);
  expect(matchesEdition(updateInfo, 'standard', 'darwin')).toBe(false);
  const { controller, updater } = await setup();
  updater.info.files[0].url = 'https://example.invalid/installer.exe';
  expect((await controller.check()).error).toContain('不匹配');
  await controller.download();
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
});
it('uses the model-free update feed when a standard installation has cached its selected models', async () => {
  const { options } = await setup();
  const updater = new TestUpdater();
  const hasCachedModels = vi.fn(async () => true);
  updater.info.files[0].url = 'LLM-Go-Trainer-0.2.0-windows-x64-minimal.exe';
  const controller = new DesktopUpdates({
    ...options,
    updater: updater.adapter(),
    hasCachedModels,
  });
  controllers.push(controller);
  await controller.check();
  expect(updater.setFeedURL).toHaveBeenLastCalledWith(updateFeed('minimal'));
  expect(controller.status()).toMatchObject({
    phase: 'available',
    edition: 'standard',
    downloadEdition: 'minimal',
    reusesModels: true,
  });
  await controller.download();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(controller.status().phase).toBe('downloaded');
});
it('does not silently fall back to a model-bundled installer when cached-model update metadata is wrong', async () => {
  const { options } = await setup();
  const updater = new TestUpdater();
  const controller = new DesktopUpdates({
    ...options,
    updater: updater.adapter(),
    hasCachedModels: async () => true,
  });
  controllers.push(controller);
  expect((await controller.check()).error).toContain('不匹配');
  await controller.download();
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
});
it('keeps standard updates when no verified model is cached and reevaluates it on a new check', async () => {
  const { options } = await setup();
  const updater = new TestUpdater();
  const hasCachedModels = vi.fn(async () => false);
  const controller = new DesktopUpdates({
    ...options,
    updater: updater.adapter(),
    hasCachedModels,
  });
  controllers.push(controller);
  expect((await controller.check()).downloadEdition).toBe('standard');
  hasCachedModels.mockResolvedValue(true);
  updater.info.files[0].url = 'LLM-Go-Trainer-0.2.0-windows-x64-minimal.exe';
  expect((await controller.check()).downloadEdition).toBe('minimal');
  expect(updater.setFeedURL).toHaveBeenLastCalledWith(updateFeed('minimal'));
});
