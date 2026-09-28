import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { KataGo } from '../server/katago';
import { newGame } from '../shared/go';
import { readLines } from '../shared/stream';
import type { StreamEvent } from '../shared/types';
import { trainingForRank } from '../shared/training';
import { LlmSettings } from '../server/llm-settings';

const file = resolve('tests/fixtures/fake-katago.mjs');
const engine = new KataGo({
  executable: process.execPath,
  prefixArgs: [file],
  model: file,
  config: file,
  timeout: 3000,
});
const providers = {
  deepseekKey: '',
  deepseekUrl: 'https://api.deepseek.com',
  deepseekModel: 'test',
  codexPath: process.execPath,
  claudePath: process.execPath,
  codexScript: resolve('tests/fixtures/fake-cli.mjs'),
  claudeScript: resolve('tests/fixtures/fake-cli.mjs'),
  timeout: 3000,
};
const llm = new LlmSettings(providers, undefined, async (config) => ({
  deepseek: {
    available: !!config.deepseekKey,
    state: config.deepseekKey ? 'ready' : 'unconfigured',
  },
  codex: { available: true, state: 'ready' },
  claude: { available: true, state: 'ready' },
}));
const app = createApp(engine, providers, '围棋教练', resolve('dist'), undefined, llm);
let server: Server, base: string;
beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  if (addr && typeof addr !== 'string') base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  llm.close();
  engine.close();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});
const payload = () => ({ game: newGame(9), training: trainingForRank('5k') });
const post = (route: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1', ...extra },
    body: JSON.stringify(body),
  });
describe('local API contracts', () => {
  it('rejects hostile origins, DNS rebinding, missing app headers and invalid inputs', async () => {
    expect((await post('/api/analyze', payload(), { Origin: 'https://evil.example' })).status).toBe(
      403,
    );
    // Node fetch overwrites Host; use the raw HTTP client for a DNS-rebinding request.
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        base + '/api/status',
        { headers: { Host: 'evil.example:3001' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(reboundStatus).toBe(403);
    expect((await post('/api/analyze', payload(), { 'X-Go-Trainer': '' })).status).toBe(403);
    expect((await post('/api/analyze', { ...payload(), training: { visits: -10 } })).status).toBe(
      400,
    );
  });
  it('returns analysis, selects a legal move and generates coach evidence server-side', async () => {
    const analyzed = await post('/api/analyze', payload());
    expect(analyzed.status).toBe(200);
    expect((await analyzed.json()).perspective).toBe('B');
    const move = await post('/api/bot-move', payload());
    expect((await move.json()).move).toBe('D4');
    const request = {
      ...payload(),
      provider: 'claude',
      action: 'position',
      question: '',
      history: [],
      evidence: { fabricatedWinrate: 1 },
    };
    const coached = await post('/api/coach', request);
    expect(coached.status).toBe(200);
    const response = await coached.json();
    expect(response.answer).not.toContain('fabricatedWinrate');
    expect(response.evidence.after.root.winrate).toBe(0.55);
  });
  it('does not invoke the bot after two passes', async () => {
    const { game, training } = payload();
    game.moves = [
      { color: 'B', point: 'pass' },
      { color: 'W', point: 'pass' },
    ];
    expect((await post('/api/bot-move', { game, training })).status).toBe(400);
  });
  it('never returns API secrets in health information', async () => {
    const status = await (await fetch(base + '/api/status')).json();
    expect(status.providers.deepseek).toBe(false);
    expect(JSON.stringify(status)).not.toContain('deepseekKey');
  });
  it('saves private keys without returning them and applies model settings to the next request', async () => {
    const patch = {
      preference: 'codex',
      deepseek: { apiKey: 'test-api-private-key' },
      codex: { model: 'test-custom-codex', effort: 'low' },
    };
    expect(
      (await post('/api/llm/settings', patch, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    const saved = await post('/api/llm/settings', patch);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    const view = await saved.json();
    expect(view.deepseek.keySource).toBe('app');
    expect(view.codex).toEqual(patch.codex);
    for (const body of [
      view,
      await (await fetch(base + '/api/status')).json(),
      await (await fetch(base + '/api/llm/settings')).json(),
    ])
      expect(JSON.stringify(body)).not.toContain('test-api-private-key');
    expect((await llm.resolve()).config).toMatchObject({
      codexModel: 'test-custom-codex',
      codexEffort: 'low',
    });
    const coached = await post('/api/coach', { ...payload(), action: 'position', history: [] });
    expect(coached.status).toBe(200);
    expect((await coached.json()).answer).toContain('讲解');
    const invalid = await post('/api/llm/settings', {
      deepseek: { apiKey: 'test-api-private-key' },
      unexpected: true,
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain('test-api-private-key');
    await post('/api/llm/settings', { preference: 'auto', deepseek: { apiKey: null } });
    expect((await llm.status()).selected).toBe('codex');
  });
});

it('streams engine progress, public CLI text and a final response in order', async () => {
  const response = await post(
    '/api/coach',
    { ...payload(), provider: 'claude', action: 'position', history: [] },
    { Accept: 'application/x-ndjson' },
  );
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  const events: StreamEvent[] = [];
  for await (const line of readLines(response.body!)) events.push(JSON.parse(line));
  expect(events[0].type).toBe('status');
  const partial = events.findIndex((event) => event.type === 'analysis' && !event.final);
  const final = events.findIndex((event) => event.type === 'analysis' && event.final);
  const text = events.findIndex((event) => event.type === 'text');
  expect(partial).toBeGreaterThan(0);
  expect(final).toBeGreaterThan(partial);
  expect(text).toBeGreaterThan(final);
  expect(events.at(-1)?.type).toBe('done');
  expect(JSON.stringify(events)).not.toContain('private-reasoning');
});
it('cancels on client disconnect and releases the coach for another request', async () => {
  const response = await post(
    '/api/coach',
    { ...payload(), game: newGame(9, 0, 96), provider: 'claude', action: 'position', history: [] },
    { Accept: 'application/x-ndjson' },
  );
  for await (const line of readLines(response.body!)) {
    if (JSON.parse(line).type === 'analysis') break;
  }
  let next: Response | undefined;
  for (let i = 0; i < 20; i++) {
    next = await post('/api/coach', {
      ...payload(),
      provider: 'claude',
      action: 'position',
      history: [],
    });
    if (next.status !== 429) break;
    await next.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(next?.status).toBe(200);
  expect((await next!.json()).answer).toContain('讲解');
});
