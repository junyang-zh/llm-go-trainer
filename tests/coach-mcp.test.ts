import { expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openCoachMcp } from '../server/coach-mcp';
import { CoachTools } from '../server/coach-tools';
import { whiteAtari, coachAnalysis } from './fixtures/coach';
import { trainingForRank } from '../shared/training';

it('serves scoped MCP tools, rejects unauthenticated/cross-origin calls and closes with the session', async () => {
  const analyze = vi.fn(async () => coachAnalysis(whiteAtari));
  const tools = new CoachTools(
    { status: () => ({ running: true, configured: true, humanModel: false }), analyze, close() {} },
    whiteAtari,
    trainingForRank('5k'),
  );
  const bridge = await openCoachMcp(tools);
  const client = new Client({ name: 'test-coach', version: '1' });
  try {
    expect((await fetch(bridge.url, { method: 'POST' })).status).toBe(401);
    expect(
      (
        await fetch(bridge.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bridge.token}`, Origin: 'https://example.org' },
        })
      ).status,
    ).toBe(403);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(bridge.url), {
        requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
      }),
    );
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'query_game_history',
      'inspect_position',
      'analyze_variation',
    ]);
    const result = await client.callTool({ name: 'inspect_position', arguments: { point: 'D4' } });
    expect(result.structuredContent).toMatchObject({ focus: { color: 'W', liberties: ['D5'] } });
    expect(
      (
        await client.callTool({
          name: 'analyze_variation',
          arguments: { moves: ['D4'], purpose: '非法落点' },
        })
      ).isError,
    ).toBe(true);
    expect(analyze).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await bridge.close();
  }
  await expect(fetch(bridge.url)).rejects.toThrow();
  expect(tools.signal.aborted).toBe(true);
});
