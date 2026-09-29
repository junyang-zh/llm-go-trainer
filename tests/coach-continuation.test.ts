import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { LlmSettings } from '../server/llm-settings';
import { HistoryLibrary } from '../server/library';
import { libraryFixture, firstGameId, secondGameId } from './fixtures/library';
import { defaultCoachLimits } from '../shared/llm';
import { readLines } from '../shared/stream';
import type { StreamEvent, Provider } from '../shared/types';
import type { ProviderConfig } from '../server/providers';
import { trainingForRank } from '../shared/training';
import { coachAnalysis, sseResponse, toolCall, whiteAtari } from './fixtures/coach';

const nativeFetch = globalThis.fetch;
afterEach(() => vi.unstubAllGlobals());
async function harness(provider: Provider = 'deepseek', patch: Partial<ProviderConfig> = {}) {
  const config: ProviderConfig = {
    deepseekKey: 'test-only',
    deepseekUrl: 'https://fixture.invalid',
    deepseekModel: 'test',
    codexPath: process.execPath,
    claudePath: process.execPath,
    codexScript: resolve('tests/fixtures/agent-cli.mjs'),
    claudeScript: resolve('tests/fixtures/agent-cli.mjs'),
    timeout: 5000,
    ...patch,
  };
  const llm = new LlmSettings(config, undefined, async () => ({
    deepseek: { available: provider === 'deepseek', state: 'ready' },
    codex: { available: provider === 'codex', state: 'ready' },
    claude: { available: provider === 'claude', state: 'ready' },
  }));
  const engine = {
    status: () => ({ configured: true, running: true, ready: true, humanModel: false }),
    analyze: vi.fn(async () => coachAnalysis(whiteAtari)),
    close() {},
  };
  const library = new HistoryLibrary();
  libraryFixture.games.forEach((game) => library.saveGame(game));
  const server = createServer(
    createApp(engine, config, '围棋教练', resolve('dist'), undefined, llm, library),
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    body: unknown = {
      game: whiteAtari,
      training: trainingForRank('5k'),
      action: 'chat',
      question: '接着摆试下',
    },
    signal?: AbortSignal,
  ) {
    return nativeFetch(base + '/api/coach', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Go-Trainer': '1',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(body),
    });
  }
  async function events(body?: unknown) {
    const response = await request(body);
    expect(response.ok).toBe(true);
    const result: StreamEvent[] = [];
    for await (const line of readLines(response.body!)) if (line) result.push(JSON.parse(line));
    return result;
  }
  return {
    llm,
    engine,
    request,
    events,
    async close() {
      llm.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
function intercept(model: (init: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init: RequestInit) =>
      String(url).startsWith('https://fixture.invalid') ? model(init) : nativeFetch(url, init),
    ),
  );
}
function paused(events: StreamEvent[]) {
  const last = events.at(-1);
  expect(last?.type).toBe('paused');
  if (last?.type !== 'paused') throw new Error('missing continuation');
  return last;
}
const call = (id: string, name: string, args: unknown, text = '', exhaust = false) =>
  sseResponse(
    [
      {
        content: text,
        tool_calls: [
          { ...toolCall(id, name, args), index: 0 },
          ...(exhaust ? [{ ...toolCall(id + '-extra', 'inspect_position', {}), index: 1 }] : []),
        ],
      },
    ],
    'tool_calls',
  );

it('continues with original task, evidence and editable trials, rotates tokens, and uses new limits', async () => {
  const app = await harness('deepseek', { limits: { ...defaultCoachLimits, toolCalls: 1 } });
  const requests: any[] = [];
  intercept(async (init) => {
    requests.push(JSON.parse(init.body as string));
    if (requests.length === 1)
      return call('same-id', 'edit_trial', { id: 'line', moves: ['D5'] }, '已摆第一手。', true);
    if (requests.length === 2)
      return call(
        'same-id',
        'edit_trial',
        { id: 'line', base: 'branch', source: 'line', moves: ['F5'] },
        '继续第二手。',
        true,
      );
    return sseResponse([{ content: '完成。' }]);
  });
  try {
    const first = await app.events();
    const one = paused(first);
    expect(one.reason).toContain('调用次数');
    expect(requests).toHaveLength(1);
    const second = await app.events({ continuationId: one.continuationId });
    const two = paused(second);
    expect(two.continuationId).not.toBe(one.continuationId);
    const edit = second.find((event) => event.type === 'tool' && event.activity.state === 'done');
    expect(edit).toMatchObject({
      activity: {
        trialEdit: {
          branch: {
            moves: [
              { color: 'W', point: 'D5' },
              { color: 'B', point: 'F5' },
            ],
          },
        },
      },
    });
    expect(requests[1].messages[1].content).toContain('已摆第一手');
    expect(requests[1].messages[1].content).toContain('toolResults');
    expect((await app.request({ continuationId: one.continuationId })).status).toBe(410);
    await app.llm.update({ limits: { toolCalls: 20 } });
    const final = await app.events({ continuationId: two.continuationId });
    expect(final.at(-1)).toMatchObject({
      type: 'done',
      answer: '已摆第一手。\n\n继续第二手。\n\n完成。',
    });
    expect(app.engine.analyze).toHaveBeenCalledOnce();
  } finally {
    await app.close();
  }
});

it('resumes after renaming the request game and retains the subsequently loaded board', async () => {
  const app = await harness('deepseek', { limits: { ...defaultCoachLimits, toolCalls: 1 } });
  const requests: any[] = [];
  intercept(async (init) => {
    requests.push(JSON.parse(init.body as string));
    if (requests.length === 1)
      return call('rename', 'rename_game', { title: '续接改名' }, '', true);
    if (requests.length === 2) return call('load', 'load_game', { gameId: secondGameId }, '', true);
    if (requests.length === 3) return call('inspect', 'inspect_position', {});
    return sseResponse([{ content: '完成。' }]);
  });
  try {
    const first = paused(
      await app.events({
        game: libraryFixture.games[0].game,
        context: { gameId: firstGameId, gameTitle: '第一局', turn: 3, trialMoves: [] },
        training: trainingForRank('5k'),
        action: 'chat',
        question: '改名并打开第二局',
      }),
    );
    const second = paused(await app.events({ continuationId: first.continuationId }));
    expect(requests[1].messages[1].content).toContain('续接改名');
    const final = await app.events({ continuationId: second.continuationId });
    expect(final.at(-1)?.type).toBe('done');
    const result = JSON.parse(requests[3].messages.at(-1).content);
    expect(result.currentContext).toMatchObject({ gameId: secondGameId, turn: 0 });
    expect(result.position.turn).toBe(0);
    expect(app.engine.analyze).toHaveBeenCalledOnce();
  } finally {
    await app.close();
  }
});

it.each(['codex', 'claude'] as const)(
  'pauses %s MCP at the configured call limit and can continue',
  async (provider) => {
    const app = await harness(provider, { limits: { ...defaultCoachLimits, toolCalls: 1 } });
    try {
      const first = await app.events();
      const token = paused(first);
      expect(token.reason).toContain('调用次数');
      expect(app.engine.analyze).toHaveBeenCalledOnce();
      await app.llm.update({ limits: { toolCalls: 12 } });
      expect((await app.events({ continuationId: token.continuationId })).at(-1)?.type).toBe(
        'done',
      );
    } finally {
      await app.close();
    }
  },
);

it('pauses when the search allowance is exhausted instead of inventing engine output', async () => {
  const app = await harness('deepseek', { limits: { ...defaultCoachLimits, searchVisits: 4000 } });
  let index = 0;
  intercept(async () =>
    call(`search-${index++}`, 'analyze_variation', {
      moves: index === 1 ? ['D5'] : ['D5', 'F5'],
      visits: 4000,
      purpose: '检查',
    }),
  );
  try {
    expect(paused(await app.events()).reason).toContain('搜索量');
    expect(app.engine.analyze).toHaveBeenCalledTimes(2); // initial position and one allowed search
  } finally {
    await app.close();
  }
});

it('preserves partial text on timeout, offers continuation and completes with a renewed deadline', async () => {
  const app = await harness('deepseek', { timeout: 80 });
  intercept(
    async (init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"尚未完成。"}}]}\n\n',
              ),
            );
            init.signal!.addEventListener('abort', () => controller.error(init.signal!.reason), {
              once: true,
            });
          },
        }),
      ),
  );
  try {
    const first = await app.events();
    expect(first).toContainEqual({ type: 'text', text: '尚未完成。' });
    const token = paused(first);
    expect(token.reason).toContain('超时');
    intercept(async () => sseResponse([{ content: '现在完成。' }]));
    await app.llm.update({ limits: { timeoutSeconds: 10 } });
    expect((await app.events({ continuationId: token.continuationId })).at(-1)).toMatchObject({
      type: 'done',
      answer: '尚未完成。\n\n现在完成。',
    });
  } finally {
    await app.close();
  }
});

it('does not offer continuation for a provider error and rejects unknown continuation tokens', async () => {
  const app = await harness();
  intercept(async () => new Response('', { status: 503 }));
  try {
    const events = await app.events();
    expect(events.at(-1)?.type).toBe('error');
    expect(events.some((event) => event.type === 'paused')).toBe(false);
    expect((await app.request({ continuationId: crypto.randomUUID() })).status).toBe(410);
  } finally {
    await app.close();
  }
});

it('expires a paused task without calling the provider again', async () => {
  const app = await harness('deepseek', { limits: { ...defaultCoachLimits, toolCalls: 1 } });
  const model = vi.fn(async () => call('one', 'inspect_position', {}, '', true));
  intercept(model);
  let time: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const token = paused(await app.events());
    time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000);
    expect((await app.request({ continuationId: token.continuationId })).status).toBe(410);
    expect(model).toHaveBeenCalledOnce();
  } finally {
    time?.mockRestore();
    await app.close();
  }
});

it('cancels provider work on manual disconnect and releases the coaching lock', async () => {
  const app = await harness();
  let providerStopped!: () => void;
  const stopped = new Promise<void>((resolve) => {
    providerStopped = resolve;
  });
  intercept(
    async (init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":"进行中"}}]}\n\n'),
            );
            init.signal!.addEventListener(
              'abort',
              () => {
                controller.error(init.signal!.reason);
                providerStopped();
              },
              { once: true },
            );
          },
        }),
      ),
  );
  const controller = new AbortController();
  try {
    const response = await app.request(undefined, controller.signal);
    for await (const line of readLines(response.body!)) {
      if (line && JSON.parse(line).type === 'text') {
        controller.abort();
        break;
      }
    }
    await stopped;
    intercept(async () => sseResponse([{ content: '新任务完成' }]));
    expect((await app.events()).at(-1)).toMatchObject({ type: 'done', answer: '新任务完成' });
  } finally {
    controller.abort();
    await app.close();
  }
});
