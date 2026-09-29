import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { callCli, callDeepSeek, cliInvocation, type ProviderConfig } from '../server/providers';

const config: ProviderConfig = {
  deepseekKey: 'test-key-not-real',
  deepseekUrl: 'https://api.deepseek.com',
  deepseekModel: 'test-model',
  codexPath: process.execPath,
  claudePath: process.execPath,
  codexScript: resolve('tests/fixtures/fake-cli.mjs'),
  claudeScript: resolve('tests/fixtures/fake-cli.mjs'),
  timeout: 3000,
};
afterEach(() => vi.unstubAllGlobals());
describe('LLM adapters', () => {
  it.each([false, true])('enables native web tools with MCP=%s', (withMcp) => {
    const mcp = withMcp ? { url: 'http://127.0.0.1:1234/mcp', token: 'test-token' } : undefined;
    const codex = cliInvocation('codex', config, 'answer.txt', true, mcp).args;
    const overrides = codex.filter((_, index) => codex[index - 1] === '-c');
    expect(overrides).toContain('web_search="live"');
    expect(overrides).toContain('features.shell_tool=false');
    expect(overrides).toContain('features.unified_exec=false');
    expect(codex[codex.indexOf('--sandbox') + 1]).toBe('read-only');
    const claude = cliInvocation('claude', config, '', true, mcp).args;
    if (mcp) {
      for (const args of [codex, claude]) {
        expect(args.join(' ')).not.toContain(mcp.token);
        expect(args.join(' ')).toContain('GO_COACH_MCP_TOKEN');
        expect(args.join(' ')).not.toContain('dangerously');
      }
    }
    expect(claude[claude.indexOf('--tools') + 1]).toBe('WebSearch,WebFetch');
    const allowed = claude.slice(
      claude.indexOf('--allowedTools') + 1,
      claude.indexOf('--setting-sources'),
    );
    expect(allowed).toContain('WebSearch');
    expect(allowed).toContain('WebFetch');
    expect(allowed.includes('mcp__go_trainer__analyze_variation')).toBe(withMcp);
    expect(
      allowed.every(
        (tool) => ['WebSearch', 'WebFetch'].includes(tool) || tool.startsWith('mcp__go_trainer__'),
      ),
    ).toBe(true);
  });
  it.each(['default', 'none', 'low', 'high', 'max'])(
    'sends DeepSeek effort %s without leaking it into the prompt',
    async (effort) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ choices: [{ message: { content: '回答' } }] })),
        );
      vi.stubGlobal('fetch', fetch);
      await callDeepSeek({ ...config, deepseekEffort: effort }, []);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.reasoning_effort).toBe(effort === 'default' ? undefined : effort);
      expect(body.messages).toEqual([]);
    },
  );
  it('maps selected CLI models and effort to literal arguments and preserves defaults', () => {
    const selected = {
      ...config,
      codexModel: 'custom-model;$(echo no)',
      codexEffort: 'high',
      claudeModel: 'sonnet',
      claudeEffort: 'medium',
    };
    const codex = cliInvocation('codex', selected, 'answer.txt').args;
    expect(codex.slice(2, 6)).toEqual([
      '--model',
      'custom-model;$(echo no)',
      '-c',
      'model_reasoning_effort="high"',
    ]);
    const claude = cliInvocation('claude', selected, '').args;
    expect(claude.slice(2, 6)).toEqual(['--model', 'sonnet', '--effort', 'medium']);
    expect(
      cliInvocation('codex', { ...config, codexEffort: 'default' }, '').args.join(' '),
    ).not.toContain('model_reasoning_effort');
    expect(cliInvocation('claude', { ...config, claudeEffort: 'default' }, '').args).not.toContain(
      '--effort',
    );
  });
  it('sends chat protocol to the configured model and returns only the answer', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '考虑弱棋的出路。', reasoning_content: 'internal' } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await callDeepSeek(config, [{ role: 'user', content: '解释 D4' }])).toBe(
      '考虑弱棋的出路。',
    );
    expect(fetch.mock.calls[0][0].href).toBe('https://api.deepseek.com/chat/completions');
    const options = fetch.mock.calls[0][1];
    expect(JSON.parse(options.body).model).toBe('test-model');
    expect(options.body).not.toContain('test-key-not-real');
    expect(options.redirect).toBe('error');
  });
  it('redacts provider HTTP response bodies on errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('sensitive provider details', { status: 401 })),
    );
    await expect(callDeepSeek(config, [])).rejects.toThrow('HTTP 401');
  });
  it.each(['codex', 'claude'] as const)(
    'passes literal prompts via stdin for %s',
    async (provider) => {
      const prompt = 'D4; $(echo injected) `echo hi`\n黑棋该如何应对？';
      expect(await callCli(provider, config, prompt)).toBe(`讲解：${prompt}`);
    },
  );
  it('handles CLI failures and deadlines', async () => {
    await expect(callCli('claude', config, 'fail')).rejects.toThrow('退出码');
    await expect(callCli('claude', { ...config, timeout: 200 }, 'timeout')).rejects.toThrow('超时');
  });
});

describe('live provider output', () => {
  it.each(['codex', 'claude'] as const)(
    '%s accepts multiple megabytes of tool events without limiting cumulative CLI output',
    async (provider) => {
      const text: string[] = [];
      expect(
        await callCli(provider, { ...config, timeout: 0 }, 'verbose-output', {
          onText: (value) => text.push(value),
        }),
      ).toBe('讲解：verbose-output');
      expect(text.join('')).not.toContain('private-tool-result');
    },
  );
  it.each([
    { provider: 'codex' as const, stream: false },
    { provider: 'codex' as const, stream: true },
    { provider: 'claude' as const, stream: false },
    { provider: 'claude' as const, stream: true },
  ])(
    'returns a large $provider answer intact with streaming=$stream',
    async ({ provider, stream }) => {
      let latest = '';
      const answer = await callCli(
        provider,
        { ...config, timeout: 0 },
        'large-answer',
        stream
          ? {
              onText: (value) => {
                latest = value;
              },
            }
          : {},
      );
      expect(answer).toBe('棋'.repeat(1_050_000));
      if (stream) expect(latest).toBe(answer);
    },
  );
  it.each(['codex', 'claude'] as const)(
    '%s reports native web activity separately from Go tools',
    async (provider) => {
      const statuses: string[] = [];
      expect(
        await callCli(provider, config, 'web-search', {
          onStatus: (status) => statuses.push(status),
        }),
      ).toBe('讲解：web-search');
      expect(statuses).toContain(`${provider === 'codex' ? 'Codex' : 'Claude'} 正在搜索网页`);
      if (provider === 'claude') expect(statuses).toContain('Claude 正在读取网页');
      expect(statuses.join('')).not.toContain('围棋工具');
    },
  );
  it('streams DeepSeek answer before completion, preserves split UTF-8 and omits private reasoning', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const received: string[] = [];
    let completed = false;
    let first!: () => void;
    const arrived = new Promise<void>((resolve) => {
      first = resolve;
    });
    const promise = callDeepSeek(config, [], {
      onText: (text) => {
        received.push(text);
        first();
      },
    }).then((text) => {
      completed = true;
      return text;
    });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      'data: {"choices":[{"delta":{"reasoning_content":"private-reasoning"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"黑棋"}}]}\r\n\r\n',
    );
    for (const byte of bytes) source.enqueue(Uint8Array.of(byte));
    await arrived;
    expect(completed).toBe(false);
    expect(received).toEqual(['黑棋']);
    source.enqueue(
      encoder.encode('data: {"choices":[{"delta":{"content":"先补强。"}}]}\n\ndata: [DONE]\n\n'),
    );
    source.close();
    expect(await promise).toBe('黑棋先补强。');
    expect(received).toEqual(['黑棋', '黑棋先补强。']);
  });
  it('rejects a provider stream ending without its terminator', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"未完"}}]}\n\n')),
    );
    await expect(callDeepSeek(config, [], { onText() {} })).rejects.toThrow('未完成');
  });
  it.each(['codex', 'claude'] as const)(
    '%s emits public output while its process is still running',
    async (provider) => {
      let completed = false;
      const received: string[] = [];
      let first!: () => void;
      const arrived = new Promise<void>((resolve) => {
        first = resolve;
      });
      const promise = callCli(provider, config, '应手', {
        onText: (text) => {
          received.push(text);
          first();
        },
      }).then((text) => {
        completed = true;
        return text;
      });
      await arrived;
      expect(completed).toBe(false);
      expect(received[0]).toBe('讲解：');
      expect(await promise).toBe('讲解：应手');
      expect(received.join('')).not.toContain('private-reasoning');
    },
  );
  it.each(['codex', 'claude'] as const)(
    '%s cancels a live process and rejects a truncated result',
    async (provider) => {
      const controller = new AbortController();
      await expect(
        callCli(provider, config, 'abort', {
          signal: controller.signal,
          onText: () => controller.abort(),
        }),
      ).rejects.toThrow('已停止');
      await expect(callCli(provider, config, 'truncated', { onText() {} })).rejects.toThrow(
        '未完成',
      );
    },
  );
});
