// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GeneralSettings } from '../src/GeneralSettings';
import type { UpdateBridge, UpdateStatus } from '../shared/updates';

let host: HTMLDivElement, root: Root, state: UpdateStatus, bridge: UpdateBridge;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  state = {
    version: '0.1.1',
    edition: 'minimal',
    supported: true,
    canInstall: true,
    automatic: false,
    phase: 'idle',
  };
  bridge = {
    status: vi.fn(async () => state),
    check: vi.fn(async () => (state = { ...state, phase: 'available', latestVersion: '0.2.0' })),
    download: vi.fn(async () => (state = { ...state, phase: 'downloaded', progress: 100 })),
    install: vi.fn(async () => (state = { ...state, phase: 'installing' })),
    automatic: vi.fn(async (value) => (state = { ...state, automatic: value })),
    openRelease: vi.fn(async () => {}),
  };
  window.goTrainerUpdates = bridge;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete window.goTrainerUpdates;
});
function button(text: string) {
  return [...host.querySelectorAll('button')].find((item) => item.textContent === text)!;
}
it('checks and downloads explicitly, then saves local data before installation', async () => {
  const save = vi.fn(async () => {});
  await act(async () => root.render(<GeneralSettings beforeInstall={save} />));
  expect(host.textContent).toContain('minimal 版');
  await act(async () => button('检查更新').click());
  expect(host.textContent).toContain('发现新版本 · 0.2.0');
  expect(bridge.download).not.toHaveBeenCalled();
  await act(async () => button('下载更新').click());
  expect(bridge.install).not.toHaveBeenCalled();
  vi.mocked(bridge.install).mockImplementation(async () => {
    expect(save).toHaveBeenCalledTimes(1);
    return { ...state, phase: 'installing' };
  });
  await act(async () => button('重启并安装').click());
  expect(bridge.install).toHaveBeenCalledTimes(1);
});
it('persists the opt-in toggle and blocks installation if saving fails or analysis is busy', async () => {
  const save = vi.fn(async () => {
    throw new Error('保存失败');
  });
  await act(async () => root.render(<GeneralSettings beforeInstall={save} />));
  await act(async () => (host.querySelector('input') as HTMLInputElement).click());
  expect(bridge.automatic).toHaveBeenCalledWith(true);
  await act(async () => button('检查更新').click());
  await act(async () => button('下载更新').click());
  await act(async () => root.render(<GeneralSettings beforeInstall={save} busy />));
  expect(button('重启并安装').disabled).toBe(true);
  await act(async () => root.render(<GeneralSettings beforeInstall={save} />));
  await act(async () => button('重启并安装').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
  expect(bridge.install).not.toHaveBeenCalled();
});
it('explains desktop-only updates and signing requirements without offering unusable installation', async () => {
  delete window.goTrainerUpdates;
  await act(async () => root.render(<GeneralSettings beforeInstall={async () => {}} />));
  expect(host.textContent).toContain('请使用桌面应用');
  expect(host.querySelector('button')).toBeNull();
  window.goTrainerUpdates = bridge;
  state = { ...state, canInstall: false, phase: 'available', reason: '需要 Developer ID 签名' };
  await act(async () => root.render(<GeneralSettings beforeInstall={async () => {}} />));
  expect(host.textContent).toContain('需要 Developer ID 签名');
  expect(button('下载更新')).toBeUndefined();
});
