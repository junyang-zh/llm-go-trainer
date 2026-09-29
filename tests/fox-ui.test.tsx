// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FoxRecords } from '../src/FoxRecords';
import { api } from '../src/api';
import { libraryFixture } from './fixtures/library';

vi.mock('../src/api', () => ({ api: vi.fn() }));
let root: Root, host: HTMLDivElement;
const select = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  select.mockReset();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ uid: '', nickname: '', games: [] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(disabled = false) {
  await act(async () => root.render(<FoxRecords disabled={disabled} onSelect={select} />));
}
async function search() {
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '测试棋手',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
const catalog = {
  uid: '123',
  nickname: '测试棋手',
  games: [
    {
      chessId: '1234',
      black: '黑方棋手',
      white: '白方棋手',
      date: '2026-09-29',
      downloaded: false,
    },
  ],
};
it('queries only on submission, imports on selection and forwards SGF warnings', async () => {
  await mount();
  expect(api).toHaveBeenCalledTimes(1);
  vi.mocked(api).mockResolvedValueOnce(catalog);
  await search();
  expect(api).toHaveBeenLastCalledWith('library/fox/sync', { keyword: '测试棋手' });
  expect(host.textContent).toContain('黑方棋手 vs 白方棋手');
  expect(host.textContent).toContain('下载并打开');
  vi.mocked(api).mockResolvedValueOnce({ record: libraryFixture.games[0], warnings: ['规则警告'] });
  await act(async () => host.querySelector<HTMLButtonElement>('article button')!.click());
  expect(api).toHaveBeenLastCalledWith('library/fox/open', { chessId: '1234' });
  expect(select).toHaveBeenCalledWith(libraryFixture.games[0], ['规则警告']);
});
it('shows errors and permits retries without discarding the previous list', async () => {
  vi.mocked(api).mockResolvedValueOnce(catalog);
  await mount();
  vi.mocked(api).mockRejectedValueOnce(new Error('野狐请求失败：HTTP 503'));
  await act(async () => host.querySelector<HTMLButtonElement>('article button')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('HTTP 503');
  expect(host.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(false);
  expect(select).not.toHaveBeenCalled();
});
it('disables opening while the board is busy', async () => {
  vi.mocked(api).mockResolvedValueOnce(catalog);
  await mount(true);
  expect(host.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(true);
});
it('does not change the board if the user leaves during a download', async () => {
  vi.mocked(api).mockResolvedValueOnce(catalog);
  await mount();
  let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => host.querySelector<HTMLButtonElement>('article button')!.click());
  await act(async () => root.render(null));
  await act(async () => finish({ record: libraryFixture.games[0], warnings: [] }));
  expect(select).not.toHaveBeenCalled();
});
