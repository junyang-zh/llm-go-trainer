import { defaultCoachLimits } from '../shared/llm';
import { afterEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { callCli, callDeepSeek, type ProviderConfig } from '../server/providers';
import { CoachTools } from '../server/coach-tools';
import {
  whiteAtari,
  coachAnalysis,
  toolCall,
  sseResponse,
  longThinkingStream,
} from './fixtures/coach';
import { trainingForRank } from '../shared/training';
import type { AnalysisEngine } from '../server/engine';
import type { ToolActivity } from '../shared/types';

const config: ProviderConfig = {
  deepseekKey: 'test-only',
  deepseekUrl: 'https://api.deepseek.com',
  deepseekModel: 'test',
  codexPath: process.execPath,
  claudePath: process.execPath,
  codexScript: resolve('tests/fixtures/agent-cli.mjs'),
  claudeScript: resolve('tests/fixtures/agent-cli.mjs'),
  timeout: 5000,
};
function harness(limits = defaultCoachLimits) {
  const engine: AnalysisEngine = {
    status: () => ({ configured: true, running: true, humanModel: false }),
    analyze: vi.fn(async (game, training) => coachAnalysis(game, training.visits)),
    close() {},
  };
  const events: ToolActivity[] = [];
  return {
    engine,
    events,
    tools: new CoachTools(
      engine,
      whiteAtari,
      trainingForRank('5k'),
      (event) => events.push(event),
      undefined,
      undefined,
      limits,
    ),
  };
}
afterEach(() => vi.unstubAllGlobals());

it('accepts long thinking streams without counting repeated SSE metadata as generated output', async () => {
  const { tools } = harness();
  const fixture = longThinkingStream(toolCall('inspect', 'inspect_position', { point: 'D4' }));
  expect(fixture.wireLength).toBeGreaterThan(2_000_000);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(fixture.response)
    .mockResolvedValueOnce(sseResponse([{ content: '白 D4 只剩一气，应向 D5 长出。' }]));
  vi.stubGlobal('fetch', fetch);
  const onText = vi.fn();
  expect(await callDeepSeek(config, [], { tools, onText })).toBe('白 D4 只剩一气，应向 D5 长出。');
  expect(onText.mock.calls).toEqual([['白 D4 只剩一气，应向 D5 长出。']]);
  const second = JSON.parse(fetch.mock.calls[1][1].body);
  expect(second.messages[0].reasoning_content).toBe(fixture.reasoning);
  expect(JSON.parse(second.messages[1].content).focus.liberties).toEqual(['D5']);
});
it.each(['content', 'reasoning_content'])(
  'still rejects excessive generated %s instead of forwarding or truncating it',
  async (field) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(Array.from({ length: 4 }, () => ({ [field]: 'x'.repeat(600000) }))),
        ),
    );
    const onText = vi.fn();
    await expect(callDeepSeek(config, [], { onText })).rejects.toThrow('DeepSeek 输出超出限制');
    expect(onText.mock.calls.every(([text]) => text.length <= 2_000_000)).toBe(true);
    if (field === 'reasoning_content') expect(onText).not.toHaveBeenCalled();
  },
);
it('assembles streamed tool arguments, executes multiple rounds and keeps reasoning out of public output', async () => {
  const { tools, events, engine } = harness();
  const inspect = toolCall('inspect', 'inspect_position', { point: 'D4' });
  const search = toolCall('search', 'analyze_variation', {
    moves: ['D5'],
    visits: 100,
    purpose: '检查白棋出头',
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      sseResponse(
        [
          { reasoning_content: 'private first reasoning' },
          { content: '先检查白棋。' },
          {
            tool_calls: [
              { ...inspect, index: 0, function: { ...inspect.function, arguments: '{"point":' } },
            ],
          },
          { tool_calls: [{ index: 0, function: { arguments: '"D4"}' } }] },
        ],
        'tool_calls',
      ),
    )
    .mockResolvedValueOnce(
      sseResponse(
        [
          { reasoning_content: 'private second reasoning' },
          { tool_calls: [{ ...search, index: 0 }] },
        ],
        'tool_calls',
      ),
    )
    .mockResolvedValueOnce(sseResponse([{ content: '白棋应向 D5 长出。' }]));
  vi.stubGlobal('fetch', fetch);
  const text: string[] = [];
  const answer = await callDeepSeek(config, [{ role: 'user', content: '白棋是否安定' }], {
    tools,
    onText: (value) => text.push(value),
  });
  expect(answer).toBe('白棋应向 D5 长出。');
  expect(text.join('')).not.toContain('private');
  const second = JSON.parse(fetch.mock.calls[1][1].body);
  expect(second.messages[1]).toMatchObject({
    role: 'assistant',
    reasoning_content: 'private first reasoning',
    tool_calls: [inspect],
  });
  expect(JSON.parse(second.messages[2].content).focus.liberties).toEqual(['D5']);
  const third = JSON.parse(fetch.mock.calls[2][1].body);
  expect(third.messages[3].reasoning_content).toBe('private second reasoning');
  expect(JSON.parse(third.messages[4].content).analysis.root).toMatchObject({
    winrate: 0.3,
    scoreLead: -4.5,
  });
  expect(events.filter((event) => event.state === 'done')).toHaveLength(2);
  expect(engine.analyze).toHaveBeenCalledOnce();
});
it('returns a tool error to the API so it can correct an illegal candidate', async () => {
  const { tools, engine } = harness();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                reasoning_content: 'private',
                tool_calls: [
                  toolCall('bad', 'analyze_variation', { moves: ['D4'], purpose: '检查' }),
                ],
              },
            },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'D4 已有白子，向 D5 长。' } }] }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  await callDeepSeek(config, [], { tools });
  const followup = JSON.parse(fetch.mock.calls[1][1].body);
  expect(JSON.parse(followup.messages[1].content).error).toContain('已有棋子');
  expect(engine.analyze).not.toHaveBeenCalled();
});
it('uses the shared call allowance without imposing a separate round limit', async () => {
  const { tools } = harness({ ...defaultCoachLimits, toolCalls: 8 });
  const fetch = vi.fn().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: body.tools
              ? {
                  content: '',
                  tool_calls: [toolCall(`call-${fetch.mock.calls.length}`, 'inspect_position', {})],
                }
              : { content: '白棋先长出。' },
          },
        ],
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    await callDeepSeek(config, [], {
      tools,
    }),
  ).toBe('白棋先长出。');
  expect(fetch).toHaveBeenCalledTimes(9);
  expect(JSON.parse(fetch.mock.calls[8][1].body).tools).toBeUndefined();
});
it('cancels an API tool search without starting another model request', async () => {
  const { tools, engine } = harness();
  const controller = new AbortController();
  vi.mocked(engine.analyze).mockImplementation(
    (_game, _training, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(new Error('stopped')), {
          once: true,
        });
        controller.abort();
      }),
  );
  const fetch = vi.fn().mockResolvedValue(
    sseResponse(
      [
        {
          tool_calls: [
            { ...toolCall('search', 'analyze_variation', { purpose: '检查' }), index: 0 },
          ],
        },
      ],
      'tool_calls',
    ),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    callDeepSeek(config, [], { tools, signal: controller.signal, onText() {} }),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
});
it.each(['codex', 'claude'] as const)(
  'runs %s tools through MCP and forwards actual execution states',
  async (provider) => {
    const { tools, events, engine } = harness();
    const statuses: string[] = [],
      text: string[] = [];
    const result = await callCli(provider, config, '白 D4 是否安定？', {
      tools,
      onStatus: (value) => statuses.push(value),
      onText: (value) => text.push(value),
    });
    expect(result).toContain('D5');
    expect(statuses.some((value) => value.includes('调用围棋工具'))).toBe(true);
    expect(events.filter((event) => event.state === 'done').map((event) => event.name)).toEqual([
      'inspect_position',
      'analyze_variation',
    ]);
    expect(vi.mocked(engine.analyze).mock.calls[0][0].moves).toEqual([{ color: 'W', point: 'D5' }]);
    expect(tools.signal.aborted).toBe(true);
    expect(text.join('')).not.toContain('GO_COACH_MCP_TOKEN');
  },
);
it.each(['codex', 'claude'] as const)(
  'cancels an active %s MCP search when the CLI request is stopped',
  async (provider) => {
    const { tools, events, engine } = harness();
    const controller = new AbortController();
    vi.mocked(engine.analyze).mockImplementation(
      (_game, _training, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(new Error('stopped')), {
            once: true,
          });
          controller.abort();
        }),
    );
    await expect(
      callCli(provider, config, '检查白棋', { tools, signal: controller.signal }),
    ).rejects.toThrow('已停止');
    expect(tools.signal.aborted).toBe(true);
    expect(engine.analyze).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ name: 'analyze_variation', state: 'stopped' });
  },
);
it('runs beyond the former tool round and call limits with the unlimited defaults', async () => {
  const { tools } = harness();
  let calls = 0;
  const fetch = vi.fn(async () => {
    calls++;
    return calls <= 14
      ? sseResponse(
          [{ tool_calls: [{ ...toolCall(`call-${calls}`, 'inspect_position', {}), index: 0 }] }],
          'tool_calls',
        )
      : sseResponse([{ content: '完成。' }]);
  });
  vi.stubGlobal('fetch', fetch);
  expect(await callDeepSeek({ ...config, timeout: 0 }, [], { tools, onText() {} })).toBe('完成。');
  expect(fetch).toHaveBeenCalledTimes(15);
  expect(tools.results).toHaveLength(14);
});
