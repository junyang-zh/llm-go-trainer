// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api, streamApi } from '../src/api';
import type { Library } from '../shared/library';
import {
  libraryFixture,
  chatStatus,
  chatAnswer,
  firstGameId,
  secondGameId,
  libraryBotMove,
} from './fixtures/library';
vi.mock('../src/api', () => ({ api: vi.fn(), streamApi: vi.fn() }));
let root: Root, host: HTMLDivElement, saved: Library;
let engineReady = false;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  saved = structuredClone(libraryFixture);
  engineReady = false;
  vi.mocked(api).mockImplementation(async (path, body) => {
    if (path === 'status')
      return { ...chatStatus, engine: { ...chatStatus.engine, ready: engineReady } };
    if (path === 'bot-move')
      return libraryBotMove((body as { game: import('../shared/types').Game }).game);
    if (path === 'library') return structuredClone(saved);
    const kind = path === 'library/games' ? 'games' : 'conversations';
    const record = structuredClone(body) as Library[typeof kind][number];
    (saved[kind] as (typeof record)[]) = [
      record,
      ...saved[kind].filter((item) => item.id !== record.id),
    ];
    return record;
  });
  vi.mocked(streamApi).mockImplementation(async (_path, _body, emit) => {
    emit({ type: 'done', answer: chatAnswer, analysis: null });
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.resetAllMocks();
});
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === text)!;
  expect(button, text).toBeDefined();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
async function point(point: string) {
  const target = host.querySelector(`[aria-label="${point} 空点"]`)!;
  expect(target).not.toBeNull();
  await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
it('keeps a conversation across navigation and games, snapshots trial context, restores conversations and branches independently', async () => {
  await act(async () => root.render(<App />));
  await click('当前局势');
  await click('发送');
  const originalChat = host.querySelector('.chat-log')!.textContent;
  expect(originalChat).toContain('第一局 · 第 3 手');
  await act(async () => (host.querySelector('[aria-label="上一手"]') as HTMLButtonElement).click());
  expect(host.querySelector('.chat-log')!.textContent).toBe(originalChat);
  await point('D4');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(saved.games.find((game) => game.id === firstGameId)!.game.moves).toHaveLength(3);
  await click('当前局势');
  await click('发送');
  const payload = vi.mocked(streamApi).mock.calls.at(-1)![1] as {
    context: unknown;
    history: unknown[];
    game: { moves: unknown[] };
  };
  expect(payload.context).toMatchObject({
    gameId: firstGameId,
    turn: 2,
    trialMoves: [{ color: 'B', point: 'D4' }],
  });
  expect(payload.history).toHaveLength(2);
  expect(payload.game.moves).toHaveLength(3);
  await click('清空试下');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector('.chat-log')!.textContent).toContain('试下 +1 手');
  await point('E4');
  await click('保存试下为新棋局');
  expect(saved.games).toHaveLength(3);
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toEqual(
    libraryFixture.games[0].game.moves,
  );
  expect(host.querySelector('.trial-stone')).toBeNull();
  await click('历史棋局');
  await act(async () =>
    [...host.querySelectorAll('.history-list b')]
      .find((item) => item.textContent === '第二局')!
      .parentElement!.click(),
  );
  expect(host.querySelector('.chat-log')!.textContent).toContain('试下 +1 手');
  await click('当前局势');
  await click('发送');
  expect(
    (vi.mocked(streamApi).mock.calls.at(-1)![1] as { context: { gameId: string } }).context.gameId,
  ).toBe(secondGameId);
  const chat = host.querySelector('.chat-log')!.textContent;
  await click('新对话');
  expect(host.querySelector('.chat-log')!.textContent).toBe('');
  await click('历史对话');
  await act(async () =>
    [...host.querySelectorAll('.history-list b')]
      .find((item) => item.textContent === '当前局势')!
      .parentElement!.click(),
  );
  expect(host.querySelector('.chat-log')!.textContent).toBe(chat);
  expect(host.querySelector('.timeline')!.getAttribute('value')).toBe('0');
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await click('历史对话');
  await act(async () =>
    [...host.querySelectorAll('.history-list b')]
      .find((item) => item.textContent === '当前局势')!
      .parentElement!.click(),
  );
  expect(host.querySelector('.chat-log')!.textContent).toBe(chat);
});
it('uses normal moves at the end of the main line and preserves the conversation on new games', async () => {
  await act(async () => root.render(<App />));
  await click('当前局势');
  await click('发送');
  await click('新对局');
  await act(async () =>
    host
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector('.chat-log')!.textContent).toContain(chatAnswer);
  await point('D4');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(saved.games[0].game.moves).toEqual([{ color: 'B', point: 'D4' }]);
});

it('starting play from a historical turn creates a new game instead of truncating the saved original', async () => {
  await act(async () => root.render(<App />));
  await act(async () => (host.querySelector('[aria-label="上一手"]') as HTMLButtonElement).click());
  await click('分支新棋局');
  expect(saved.games).toHaveLength(3);
  expect(saved.games[0].game.moves).toHaveLength(2);
  await point('D4');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(saved.games[0].game.moves).toHaveLength(3);
  expect(saved.games[0].game.moves.at(-1)?.point).toBe('D4');
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
});

it('AI and manual moves from history share a trial branch; forking makes following moves real', async () => {
  engineReady = true;
  await act(async () => root.render(<App />));
  for (let i = 0; i < 2; i++)
    await act(async () =>
      (host.querySelector('[aria-label="上一手"]') as HTMLButtonElement).click(),
    );
  await act(async () =>
    (host.querySelector('[aria-label="AI 自动落子"]') as HTMLInputElement).click(),
  );
  expect(host.querySelector('[aria-label="E5 试下"]')).not.toBeNull();
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
  await point('F5');
  expect(host.querySelectorAll('.trial-stone')).toHaveLength(3);
  expect(host.querySelector('[aria-label="G5 试下"]')).not.toBeNull();
  const requests = vi.mocked(api).mock.calls.filter(([path]) => path === 'bot-move');
  expect(requests).toHaveLength(2);
  expect((requests[1][1] as { game: { moves: unknown[] } }).game.moves).toHaveLength(3);
  await act(async () =>
    (host.querySelector('[aria-label="AI 自动落子"]') as HTMLInputElement).click(),
  );
  await click('保存试下为新棋局');
  await point('H5');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(saved.games[0].game.moves).toHaveLength(5);
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
});
it('the home page AI switch and color selector play real moves at the main-line end', async () => {
  engineReady = true;
  await act(async () => root.render(<App />));
  expect(host.querySelector('[aria-label="对局模式"]')).toBeNull();
  await act(async () =>
    (host.querySelector('[aria-label="AI 自动落子"]') as HTMLInputElement).click(),
  );
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves.at(-1)).toEqual({
    color: 'W',
    point: 'E5',
  });
  const color = host.querySelector('[aria-label="AI 执子"]') as HTMLSelectElement;
  await act(async () => {
    color.value = 'B';
    color.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves.at(-1)).toEqual({
    color: 'B',
    point: 'F5',
  });
  expect(host.querySelector('.trial-stone')).toBeNull();
});

it('inserts quick prompts as editable drafts and only requests coaching after send', async () => {
  await act(async () => root.render(<App />));
  const input = host.querySelector('textarea')!;
  for (const prompt of ['解释这一手', '当前局势', '分析后续变化']) {
    await click(prompt);
    expect(input.value).toBe(prompt);
    expect(document.activeElement).toBe(input);
    expect(streamApi).not.toHaveBeenCalled();
    expect(host.querySelector('.chat-log')!.textContent).toBe('');
  }
  await click('发送');
  expect(streamApi).toHaveBeenCalledTimes(1);
  expect(vi.mocked(streamApi).mock.calls[0][1]).toMatchObject({ action: 'variation' });
  expect(input.value).toBe('');
});
