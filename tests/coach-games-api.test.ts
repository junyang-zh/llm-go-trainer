import { expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { HistoryLibrary } from '../server/library';
import { LlmSettings } from '../server/llm-settings';
import { readLines } from '../shared/stream';
import type { StreamEvent } from '../shared/types';
import { trainingForRank } from '../shared/training';
import { libraryFixture, firstGameId, secondGameId, chatStatus } from './fixtures/library';

const providerFixture = createRequire(import.meta.url)('./fixtures/game-management-provider.cjs');
async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

it.each(['codex', 'claude', 'deepseek'] as const)(
  'runs game management through the %s provider and coach API without engine access',
  async (provider) => {
    const fixture = createServer(providerFixture());
    const baseUrl = await listen(fixture);
    const config = {
      deepseekKey: 'test-only',
      deepseekUrl: baseUrl,
      deepseekModel: 'fixture',
      codexPath: process.execPath,
      claudePath: process.execPath,
      codexScript: resolve('tests/fixtures/agent-cli.mjs'),
      claudeScript: resolve('tests/fixtures/agent-cli.mjs'),
      timeout: 5000,
    };
    const llm = new LlmSettings(config, undefined, async () => ({
      codex: { available: provider === 'codex', state: 'ready' },
      claude: { available: provider === 'claude', state: 'ready' },
      deepseek: { available: provider === 'deepseek', state: 'ready' },
    }));
    const library = new HistoryLibrary();
    libraryFixture.games.forEach((record) => library.saveGame(record));
    const engine = {
      status: () => chatStatus.engine,
      async analyze(): Promise<never> {
        throw new Error('Engine unavailable');
      },
      close() {},
    };
    const server = createServer(
      createApp(engine, config, '围棋教练', resolve('dist'), undefined, llm, library),
    );
    try {
      const url = await listen(server);
      const response = await fetch(url + '/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Go-Trainer': '1',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({
          game: libraryFixture.games[0].game,
          context: { gameId: firstGameId, gameTitle: '第一局', turn: 3, trialMoves: [] },
          training: trainingForRank('5k'),
          action: 'chat',
          question: 'fixture:manage-games',
          provider,
        }),
      });
      expect(response.ok).toBe(true);
      const events: StreamEvent[] = [];
      for await (const line of readLines(response.body!)) if (line) events.push(JSON.parse(line));
      expect(events.at(-1)).toMatchObject({
        type: 'done',
        answer: '已加载第二局、保存变化并改名为 Agent 研究。',
        analysis: null,
      });
      expect(
        events.filter((event) => event.type === 'tool' && event.activity.gameChange),
      ).toHaveLength(3);
      const record = library.snapshot().games.find((record) => record.title === 'Agent 研究')!;
      expect(record).toMatchObject({
        sourceId: secondGameId,
        game: { metadata: { GN: 'Agent 研究' }, moves: [{ color: 'B', point: 'D4' }] },
      });
      expect(library.getGame(firstGameId)).toEqual(libraryFixture.games[0]);
      expect(library.getGame(secondGameId)).toEqual(libraryFixture.games[1]);
      const done = events.at(-1) as Extract<StreamEvent, { type: 'done' }>;
      expect(
        (done.evidence as { toolResults: { result: unknown }[] }).toolResults.at(-1)?.result,
      ).toMatchObject({
        data: { focus: { color: 'B', point: 'D4' }, currentContext: { gameId: record.id } },
      });
    } finally {
      llm.close();
      await close(server);
      await close(fixture);
    }
  },
);
