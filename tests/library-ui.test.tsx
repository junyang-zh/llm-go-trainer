import { useRecordFixture } from './fixtures/presets';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { presetRecord, presetSummary, searchPresets } from '../server/presets';
import { api, streamApi } from '../src/api';
import type { Library } from '../shared/library';
import { CoachTools } from '../server/coach-tools';
import { HistoryLibrary } from '../server/library';
import { trainingForRank } from '../shared/training';
import {
  libraryFixture,
  chatStatus,
  chatAnswer,
  firstGameId,
  secondGameId,
  libraryBotMove,
  libraryCandidateAnalysis,
  captureTrialGame,
  passedHistoryGame,
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
    if (path === 'library/sources')
      return [
        {
          id: 'cwi',
          name: 'CWI',
          url: 'https://homepages.cwi.nl/~aeb/go/games/index.html',
          count: 96143,
          sizeBytes: 46246395,
          state: 'installed',
          bundled: true,
        },
      ];
    if (path.endsWith('/name')) {
      const record = saved.games.find((item) => item.id === path.split('/')[2])!;
      record.title = (body as { title: string }).title;
      record.game.metadata.GN = record.title;
      return structuredClone(record);
    }
    if (path === 'library') return structuredClone(saved);
    if (path.startsWith('library/presets?')) {
      const params = new URLSearchParams(path.split('?')[1]);
      return searchPresets(
        params.get('query') ?? '',
        Number(params.get('offset') ?? 0),
        Number(params.get('limit') ?? 20),
        undefined,
        (params.get('category') ?? undefined) as
          import('../shared/library').RecordCategory | undefined,
      );
    }
    if (path.startsWith('library/presets/')) {
      const id = path.split('/')[2];
      return path.endsWith('/summary') ? presetSummary(id) : presetRecord(id);
    }
    const kind = path === 'library/games' ? 'games' : 'conversations';
    const record = structuredClone(body) as Library[typeof kind][number];
    (saved[kind] as (typeof record)[]) = [
      record,
      ...saved[kind].filter((item) => item.id !== record.id),
    ];
    return record;
  });
  vi.mocked(streamApi).mockImplementation(async (path, body, emit) => {
    if (path === 'bot-move') {
      const result = libraryBotMove((body as { game: import('../shared/types').Game }).game);
      emit({ type: 'analysis', phase: 'after', analysis: result.analysis, final: false });
      emit({ type: 'done', ...result });
      return;
    }
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
  vi.useRealTimers();
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
async function seek(turn: number) {
  const input = host.querySelector<HTMLInputElement>('.timeline')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, turn);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function previous() {
  const button = host.querySelector<HTMLButtonElement>('[aria-label="上一手"]')!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
async function next() {
  const button = host.querySelector<HTMLButtonElement>('[aria-label="下一手"]')!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
it('applies agent loads, saves and renames in order, keeps the chat, and sends the new context next turn', async () => {
  let managedId = '';
  vi.mocked(streamApi).mockImplementationOnce(async (_path, body, emit) => {
    const request = body as {
      game: import('../shared/types').Game;
      context: import('../shared/library').BoardContext;
    };
    const records = new HistoryLibrary();
    saved.games.forEach((record) => records.saveGame(record));
    const tools = new CoachTools(
      { status: () => chatStatus.engine, analyze: vi.fn(), close() {} },
      request.game,
      trainingForRank('5k'),
      (activity) => emit({ type: 'tool', activity }),
      undefined,
      { library: records, context: request.context },
    );
    for (const [name, args] of [
      ['load_game', { gameId: secondGameId }],
      ['edit_trial', { id: 'line', moves: ['D4'] }],
      ['save_game', { branchId: 'line', title: '已保存' }],
      ['rename_game', { title: 'Agent 研究' }],
      ['rename_game', { gameId: firstGameId, title: '旧局改名' }],
    ] as const) {
      expect((await tools.run(name, args)).isError).toBeUndefined();
    }
    managedId = tools.snapshot().context!.gameId;
    saved.games = records.snapshot().games;
    emit({ type: 'done', answer: '[查看开局](#go/selector/root?turn=0)', analysis: null });
  });
  await act(async () => root.render(<App />));
  await point('D4'); // existing trial must be cleared when loading another game
  await click('当前局势');
  await click('发送');
  expect(host.querySelector('[aria-label="D4 黑子"]')).not.toBeNull();
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('1');
  expect(saved.games.find((record) => record.id === managedId)).toMatchObject({
    title: 'Agent 研究',
    sourceId: secondGameId,
  });
  expect(saved.games.find((record) => record.id === firstGameId)!.game.moves).toHaveLength(3);
  expect(saved.conversations).toHaveLength(1);
  await click('当前局势');
  await click('发送');
  expect(vi.mocked(streamApi).mock.calls.at(-1)![1]).toMatchObject({
    context: { gameId: managedId, gameTitle: 'Agent 研究', turn: 1, trialMoves: [] },
    game: { metadata: { GN: 'Agent 研究' } },
  });
  await click('查看开局');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe('1');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('0');
  await click('棋谱');
  expect(host.querySelector('.record-library')!.textContent).toContain('Agent 研究');
  expect(host.querySelector('.record-library')!.textContent).toContain('旧局改名');
});
it('does not echo an agent rename back over later server changes while a live game remains playable', async () => {
  saved.games = [];
  await act(async () => root.render(<App />));
  vi.mocked(streamApi).mockImplementationOnce(async (_path, body, emit) => {
    const { context } = body as { context: import('../shared/library').BoardContext };
    const record = structuredClone(saved.games.find((record) => record.id === context.gameId)!);
    record.title = '实战改名';
    record.game.metadata.GN = record.title;
    saved.games = [record];
    emit({
      type: 'tool',
      activity: {
        id: 'rename',
        name: 'rename_game',
        label: '棋局改名',
        state: 'done',
        gameChange: {
          operation: 'rename_game',
          record,
          context: { ...context, gameTitle: record.title },
        },
      },
    });
    emit({ type: 'done', answer: '已改名', analysis: null });
  });
  const writesBefore = vi
    .mocked(api)
    .mock.calls.filter(([path]) => path === 'library/games').length;
  await click('当前局势');
  await click('发送');
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === 'library/games')).toHaveLength(
    writesBefore,
  );
  await point('D4');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(saved.games[0]).toMatchObject({
    title: '实战改名',
    game: { moves: [{ color: 'B', point: 'D4' }] },
  });
});

it.each([
  ['panel', 3],
  ['board', 2],
] as const)(
  'adds whole candidate variations through the %s into a numbered, reversible trial',
  async (entry, turn) => {
    vi.useFakeTimers();
    engineReady = true;
    vi.mocked(streamApi).mockImplementation(async (_path, body, emit) => {
      const game = (body as { game: import('../shared/types').Game }).game;
      emit({ type: 'done', analysis: libraryCandidateAnalysis(game) });
    });
    await act(async () => root.render(<App />));
    await seek(turn);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => host.querySelector<HTMLButtonElement>('.evaluation-toggle')!.click());
    if (entry === 'panel') {
      await act(async () => host.querySelector<HTMLButtonElement>('.candidates button')!.click());
    } else {
      await click('候选点');
      await point('D4');
    }
    const number = (point: string) => host.querySelector(`[aria-label="${point} 试下"]`)!;
    expect(number('D4').textContent).toBe('1');
    expect(number('E4').textContent).toBe('2');
    expect(number('D4').getAttribute('fill')).toBe(turn === 3 ? '#222620' : '#fffefa');
    expect(number('E4').getAttribute('fill')).toBe(turn === 3 ? '#fffefa' : '#222620');
    expect(host.querySelector('[aria-label="变化下一手"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe(String(turn + 2));
    await point('F5');
    expect(number('F5').textContent).toBe('3');
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => host.querySelector<HTMLButtonElement>('.candidates button')!.click());
    expect(number('F4').textContent).toBe('4');
    expect(number('G4').textContent).toBe('5');
    await previous();
    expect(number('G4')).toBeNull();
    expect(number('F4').textContent).toBe('4');
    await seek(turn);
    expect(host.querySelector('.trial-stone')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe(String(turn + 5));
    await seek(turn + 5);
    expect(number('G4').textContent).toBe('5');
    await seek(turn + 1);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => host.querySelector<HTMLButtonElement>('.candidates button')!.click());
    expect(number('E4').textContent).toBe('2');
    expect(number('F4').textContent).toBe('3');
    expect(number('F5')).toBeNull();
    expect(number('G4')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe(String(turn + 3));
    expect(saved.games.find((game) => game.id === firstGameId)!.game.moves).toEqual(
      libraryFixture.games[0].game.moves,
    );
  },
);
it('rejects an illegal candidate continuation without applying a partial trial', async () => {
  vi.useFakeTimers();
  engineReady = true;
  vi.mocked(streamApi).mockImplementation(async (_path, body, emit) => {
    const game = (body as { game: import('../shared/types').Game }).game;
    emit({ type: 'done', analysis: libraryCandidateAnalysis(game, true) });
  });
  await act(async () => root.render(<App />));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  await act(async () => host.querySelector<HTMLButtonElement>('.evaluation-toggle')!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('.candidates button')!.click());
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector('[aria-label="D4 空点"]')).not.toBeNull();
  expect(host.querySelector('.workspace-status')!.textContent).toContain('已有棋子');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('3');
});
it('rewinds trial moves with buttons and the timeline without entering future history', async () => {
  await act(async () => root.render(<App />));
  await seek(1);
  await point('D4');
  await point('E4');
  const timeline = () => host.querySelector<HTMLInputElement>('.timeline')!;
  const nextButton = () => host.querySelector<HTMLButtonElement>('[aria-label="下一手"]')!;
  expect(timeline().value).toBe('3');
  expect(nextButton().disabled).toBe(true);
  await previous();
  expect(timeline().value).toBe('2');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="E4 空点"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="G7 空点"]')).not.toBeNull();
  expect(timeline().max).toBe('3');
  await next();
  expect(timeline().value).toBe('3');
  expect(host.querySelectorAll('.trial-stone')).toHaveLength(2);
  await seek(2);
  await point('F4');
  expect(host.querySelector('[aria-label="E4 空点"]')).not.toBeNull();
  await point('G4');
  expect(timeline().value).toBe('4');
  expect(timeline().max).toBe('4');
  await seek(3);
  expect(host.querySelectorAll('.trial-stone')).toHaveLength(2);
  expect(host.querySelector('[aria-label="G4 空点"]')).not.toBeNull();
  expect(timeline().max).toBe('4');
  await next();
  expect(host.querySelector('[aria-label="G4 试下"]')).not.toBeNull();
  await seek(1);
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(nextButton().disabled).toBe(false);
  expect(timeline().max).toBe('4');
  await next();
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  await seek(0);
  expect(timeline().max).toBe('3');
  await next();
  await next();
  expect(host.querySelector('[aria-label="G7 白子"]')).not.toBeNull();
  expect(saved.games.find((game) => game.id === firstGameId)!.game.moves).toEqual(
    libraryFixture.games[0].game.moves,
  );
});
it('can rewind a trial from move zero and jump directly back into earlier history', async () => {
  await act(async () => root.render(<App />));
  await seek(0);
  await point('D4');
  await previous();
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('0');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="上一手"]')!.disabled).toBe(true);
  await next();
  expect(host.querySelector('[aria-label="D4 试下"]')!.textContent).toBe('1');
  await click('清空试下');
  await seek(2);
  await point('D4');
  await point('E4');
  await seek(1);
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector('[aria-label="G7 空点"]')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('1');
});
it('pauses automatic play when undoing its trial move so it does not replay the move', async () => {
  engineReady = true;
  await act(async () => root.render(<App />));
  await seek(1);
  await act(async () =>
    host.querySelector<HTMLInputElement>('[aria-label="AI 自动落子"]')!.click(),
  );
  expect(host.querySelector('[aria-label="E5 试下"]')).not.toBeNull();
  await previous();
  expect(host.querySelector<HTMLInputElement>('[aria-label="AI 自动落子"]')!.checked).toBe(false);
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(vi.mocked(streamApi).mock.calls.filter(([path]) => path === 'bot-move')).toHaveLength(1);
  await next();
  expect(host.querySelector('[aria-label="E5 试下"]')).not.toBeNull();
  expect(vi.mocked(streamApi).mock.calls.filter(([path]) => path === 'bot-move')).toHaveLength(1);
});
it('restores captured stones when rewinding and replaces only the future when passing', async () => {
  saved.games[0].game = structuredClone(captureTrialGame);
  await act(async () => root.render(<App />));
  await seek(0);
  await point('A1');
  await point('B1');
  expect(host.querySelector('[aria-label="A1 试下"]')).toBeNull();
  expect(host.querySelector('[aria-label="B1 试下"]')!.textContent).toBe('2');
  await previous();
  expect(host.querySelector('[aria-label="A1 试下"]')!.textContent).toBe('1');
  expect(host.querySelector('[aria-label="B1 空点"]')).not.toBeNull();
  await next();
  expect(host.querySelector('[aria-label="A1 空点"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="B1 试下"]')!.textContent).toBe('2');
  await previous();
  await click('停一手');
  await previous();
  await next();
  expect(host.querySelector('[aria-label="A1 试下"]')!.textContent).toBe('1');
  expect(host.querySelector('[aria-label="B1 空点"]')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('2');
});
it('sends and saves only the viewed trial prefix, excluding its recoverable future', async () => {
  await act(async () => root.render(<App />));
  await seek(1);
  await point('D4');
  await point('E4');
  await point('F4');
  await seek(2);
  await click('当前局势');
  await click('发送');
  expect(vi.mocked(streamApi).mock.calls.at(-1)![1]).toMatchObject({
    context: { turn: 1, trialMoves: [{ color: 'W', point: 'D4' }] },
    game: {
      moves: [
        { color: 'B', point: 'C3' },
        { color: 'W', point: 'D4' },
      ],
    },
  });
  await click('保存试下为新棋局');
  expect(saved.games[0].game.moves).toHaveLength(2);
  expect(saved.games[0].game.moves.at(-1)!.point).toBe('D4');
  expect(host.querySelector('.trial-stone')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe('2');
});
it('an illegal move leaves the recoverable trial intact', async () => {
  await act(async () => root.render(<App />));
  await seek(1);
  await point('D4');
  await point('E4');
  await previous();
  await act(async () =>
    host
      .querySelector('[aria-label="C3 黑子"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  expect(host.querySelector('.workspace-status')!.textContent).toContain('已有棋子');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe('3');
  await next();
  expect(host.querySelector('[aria-label="E4 试下"]')!.textContent).toBe('2');
});
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
  await click('棋谱');
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
  const requests = vi.mocked(streamApi).mock.calls.filter(([path]) => path === 'bot-move');
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
it('restored historical games also keep AI moves in trials at the main-line end', async () => {
  engineReady = true;
  await act(async () => root.render(<App />));
  expect(host.querySelector('[aria-label="对局模式"]')).toBeNull();
  await act(async () =>
    (host.querySelector('[aria-label="AI 自动落子"]') as HTMLInputElement).click(),
  );
  expect(host.querySelector('[aria-label="E5 试下"]')).not.toBeNull();
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
  const color = host.querySelector('[aria-label="AI 执子"]') as HTMLSelectElement;
  await act(async () => {
    color.value = 'B';
    color.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelector('[aria-label="F5 试下"]')).not.toBeNull();
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
  expect(host.querySelectorAll('.trial-stone')).toHaveLength(2);
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

it('restores saved coach branches, switches exclusive selectors, jumps across games and keeps edits out of the main line', async () => {
  const base = structuredClone(saved.games[0].game);
  vi.mocked(streamApi).mockImplementation(async (_path, _body, emit) => {
    emit({
      type: 'tool',
      activity: {
        id: 'create',
        name: 'edit_trial',
        label: '编辑试下',
        state: 'done',
        trialEdit: {
          id: 'line',
          branch: {
            id: 'line',
            label: '变化',
            gameId: firstGameId,
            baseTurn: 3,
            base,
            moves: [
              { color: 'W', point: 'D4' },
              { color: 'B', point: 'E4' },
            ],
          },
        },
      },
    });
    emit({
      type: 'done',
      analysis: null,
      answer:
        '[起点](#go/selector/a?branch=line&ply=0) [走一手](#go/selector/b?branch=line&ply=1) [实战](#go/selector/c?turn=1) [坏分支](#go/selector/bad?branch=missing) [D4](#go/point/D4?group=a) [E4](#go/point/E4?group=b)',
    });
  });
  await act(async () => root.render(<App />));
  await click('当前局势');
  await click('发送');
  await click('起点');
  const anchor = host.querySelector<HTMLElement>('[data-go-point="D4"]')!;
  anchor.focus();
  await act(async () => root.render(<App />));
  expect(document.activeElement).toBe(anchor);
  expect(host.querySelector('[data-go-point="D4"]')).not.toBeNull();
  expect(host.querySelector('[data-go-point="E4"]')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('3');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.max).toBe('5');
  await click('走一手');
  expect(host.querySelector('[data-go-point="D4"]')).toBeNull();
  expect(host.querySelector('[data-go-point="E4"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(host.querySelectorAll('.coach-selector[aria-pressed="true"]')).toHaveLength(1);
  await click('走一手');
  expect(host.querySelector('[data-go-point]')).toBeNull();
  await click('走一手');
  await point('F4');
  expect(host.querySelectorAll('.coach-selector[aria-pressed="true"]')).toHaveLength(0);
  expect(saved.games.find((g) => g.id === firstGameId)!.game).toEqual(base);
  await click('坏分支');
  expect(host.querySelector('.workspace-status')!.textContent).toContain('尚未生成或已删除');
  await click('实战');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('1');
  expect(host.querySelector('.trial-stone')).toBeNull();
  await click('棋谱');
  await act(async () =>
    [...host.querySelectorAll('.history-list b')]
      .find((el) => el.textContent === '第二局')!
      .parentElement!.click(),
  );
  await click('走一手');
  expect(host.querySelector<HTMLInputElement>('.timeline')!.value).toBe('4');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await click('走一手');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="收起对话面板"]')!.click(),
  );
  expect(host.querySelector('[data-go-point]')).toBeNull();
});

it('opening history at its final move creates trials and saving keeps repeated branches in one group', async () => {
  await act(async () => root.render(<App />));
  await click('棋谱');
  await act(async () =>
    (host.querySelector('.history-list article button') as HTMLButtonElement).click(),
  );
  await point('D4');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toHaveLength(3);
  await click('保存试下为新棋局');
  const branch = saved.games[0];
  expect(branch).toMatchObject({ sourceId: firstGameId, groupId: firstGameId, forkTurn: 3 });
  await click('棋谱');
  expect(host.querySelector('.record-group h3')?.textContent).toContain('同源棋谱组（2）');
  await act(async () =>
    (host.querySelector('.history-list article button') as HTMLButtonElement).click(),
  );
  await point('E4');
  await click('保存试下为新棋局');
  expect(saved.games[0]).toMatchObject({ sourceId: branch.id, groupId: firstGameId, forkTurn: 4 });
});

it('browses the paginated CWI catalog, removes authored content and never auto-saves originals', async () => {
  await act(async () => root.render(<App />));
  const originalCount = saved.games.length;
  await click('棋谱');
  expect(host.querySelector('.record-help')).toBeNull();
  expect(
    [...host.querySelectorAll('.record-filters button')].some(
      (button) => button.textContent === '全部',
    ),
  ).toBe(false);
  await click('死活题');
  expect(host.querySelectorAll('.record-entry')).toHaveLength(0);
  await click('定式');
  expect(host.querySelectorAll('.record-entry')).toHaveLength(0);
  await click('经典名局');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(host.querySelectorAll('.record-entry')).toHaveLength(20);
  await click('下一页');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(host.querySelector('.record-pagination')?.textContent).toContain('21–40');
  const search = host.querySelector('input[type="search"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      search,
      'fixture/1.sgf',
    );
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(host.querySelectorAll('.record-entry')).toHaveLength(1);
  expect(host.querySelector('.record-details')!.textContent).not.toContain('公共领域');
  expect(host.querySelector('.record-library')!.textContent).not.toMatch(
    /使用依据|日本规则终局|000001/,
  );
  expect([...host.querySelectorAll('button')].some((button) => button.textContent === '改名')).toBe(
    false,
  );
  await act(async () =>
    (host.querySelector('.history-list article button') as HTMLButtonElement).click(),
  );
  expect((host.querySelector('.timeline') as HTMLInputElement).value).toBe('0');
  await point('D4');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(saved.games).toHaveLength(originalCount);
  await click('保存试下为新棋局');
  expect(saved.games).toHaveLength(originalCount + 1);
  expect(saved.games[0].sourceId).toBe('c0000000-0000-4000-8000-000000000001');
  expect(saved.games[0].game.metadata.CP).toContain('公共领域');
});

it('allows review trials after the historical game ended with two passes', async () => {
  saved.games[0].game = structuredClone(passedHistoryGame);
  await act(async () => root.render(<App />));
  await point('D4');
  expect(host.querySelector('[aria-label="D4 试下"]')).not.toBeNull();
  expect(saved.games.find((item) => item.id === firstGameId)!.game.moves).toEqual(
    passedHistoryGame.moves,
  );
});

it('renames personal games without changing the review cursor, and shows download sources', async () => {
  await act(async () => root.render(<App />));
  await seek(1);
  await click('棋谱');
  expect(host.querySelector('.record-library')!.textContent).not.toContain(firstGameId.slice(-6));
  await click('改名');
  const input = host.querySelector('[aria-label="棋谱名称"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '我的复盘',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('保存名称');
  expect(
    saved.games.some((item) => item.title === '我的复盘' && item.game.metadata.GN === '我的复盘'),
  ).toBe(true);
  expect((host.querySelector('.timeline') as HTMLInputElement).value).toBe('1');
  await click('下载棋谱');
  expect(host.querySelector('.record-source')!.textContent).toContain('已随应用预置');
  expect(host.querySelector('.record-source')!.textContent).toContain('96,143');
});

const recordFixture = useRecordFixture();
