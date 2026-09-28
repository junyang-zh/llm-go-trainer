import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { KataGo } from '../server/katago';
import { LlmSettings } from '../server/llm-settings';
import { readLines } from '../shared/stream';
import type { StreamEvent } from '../shared/types';
import { trainingForRank } from '../shared/training';
import { whiteAtari } from './fixtures/coach';

it('streams tool execution through the coach API and keeps speculative results separate from the current position', async () => {
  const file = resolve('tests/fixtures/fake-katago.mjs');
  const engine = new KataGo({
    executable: process.execPath,
    prefixArgs: [file],
    model: file,
    config: file,
    timeout: 3000,
  });
  const config = {
    deepseekKey: '',
    deepseekUrl: 'https://api.deepseek.com',
    deepseekModel: 'test',
    codexPath: process.execPath,
    claudePath: process.execPath,
    codexScript: resolve('tests/fixtures/agent-cli.mjs'),
    claudeScript: resolve('tests/fixtures/agent-cli.mjs'),
    timeout: 5000,
  };
  const llm = new LlmSettings(config, undefined, async () => ({
    codex: { available: true, state: 'ready' },
    claude: { available: false, state: 'missing' },
    deepseek: { available: false, state: 'unconfigured' },
  }));
  const server = createServer(
    createApp(engine, config, '围棋教练', resolve('dist'), undefined, llm),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing port');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/coach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Go-Trainer': '1',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({
        game: whiteAtari,
        training: trainingForRank('5k'),
        action: 'chat',
        question: '白 D4 是否安定？',
        history: [],
      }),
    });
    const events: StreamEvent[] = [];
    for await (const line of readLines(response.body!)) if (line) events.push(JSON.parse(line));
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
    const completedTools = events.filter(
      (event) => event.type === 'tool' && event.activity.state === 'done',
    );
    expect(completedTools).toHaveLength(2);
    expect(
      events
        .filter((event) => event.type === 'analysis')
        .every((event) => event.analysis.turnNumber === 0),
    ).toBe(true);
    const done = events.at(-1);
    expect(done).toMatchObject({
      type: 'done',
      analysis: { turnNumber: 0 },
      evidence: { position: { turn: 0 } },
    });
    if (done?.type !== 'done') throw new Error('missing final response');
    expect((done.evidence as { toolResults: unknown[] }).toolResults).toHaveLength(2);
    expect(whiteAtari.moves).toHaveLength(0);
    expect(JSON.stringify(events)).not.toContain('GO_COACH_MCP_TOKEN');
  } finally {
    llm.close();
    await engine.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
