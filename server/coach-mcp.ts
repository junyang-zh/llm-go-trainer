import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CoachTools, coachToolDefinitions } from './coach-tools';

export const coachMcpName = 'go_trainer';
export const coachMcpTokenEnv = 'GO_COACH_MCP_TOKEN';
export interface CoachMcpConnection {
  url: string;
  token: string;
}

// Each coach request owns a short-lived endpoint and token; no user CLI config is changed.
export async function openCoachMcp(tools: CoachTools) {
  const site = express();
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  let url = '';
  const active = new Set<Server>();
  site.use((req, res, next) => {
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (
      req.headers.host !== new URL(url).host ||
      (req.headers.origin && req.headers.origin !== new URL(url).origin)
    ) {
      res.sendStatus(403);
      return;
    }
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      res.sendStatus(401);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  site.use(express.json({ limit: '24kb' }));
  site.post('/mcp', async (req, res) => {
    const server = new Server(
      { name: coachMcpName, version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    active.add(server);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: coachToolDefinitions.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema, type: 'object' as const },
        annotations: {
          readOnlyHint: tool.name !== 'edit_trial',
          destructiveHint: false,
          openWorldHint: false,
        },
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const result = await tools.run(
        request.params.name,
        request.params.arguments ?? {},
        undefined,
        extra.signal,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data) }],
        structuredContent: result.data,
        isError: !!result.isError,
      };
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      active.delete(server);
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res
          .status(500)
          .json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: '围棋工具请求失败' } });
      else res.end();
    }
  });
  site.all('/mcp', (_req, res) => res.sendStatus(405));
  const http = createServer(site);
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', () => {
      const address = http.address();
      if (!address || typeof address === 'string') {
        reject(new Error('围棋工具端口不可用'));
        return;
      }
      url = `http://127.0.0.1:${address.port}/mcp`;
      resolve();
    });
  });
  return {
    url,
    token,
    async close() {
      tools.close();
      await Promise.all([...active].map((server) => server.close()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
