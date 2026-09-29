import { writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const args = process.argv.slice(2);
const codex = args.includes('exec');
const url = codex
  ? JSON.parse(
      args
        .find((arg) => arg.startsWith('mcp_servers.go_trainer.url='))
        .split('=')
        .slice(1)
        .join('='),
    )
  : JSON.parse(args[args.indexOf('--mcp-config') + 1]).mcpServers.go_trainer.url;
const client = new Client({ name: 'fixture-agent', version: '1' });
const emit = (event) => console.log(JSON.stringify(event));
emit(codex ? { type: 'turn.started' } : { type: 'system', subtype: 'init' });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.GO_COACH_MCP_TOKEN}` } },
  }),
);
let index = 0;
try {
  const calls = input.includes('fixture:manage-games')
    ? [
        ['query_game_history', { query: '第二局' }],
        ['load_game', { gameId: '22222222-2222-4222-8222-222222222222' }],
        ['edit_trial', { id: 'saved-line', moves: ['D4'] }],
        ['save_game', { branchId: 'saved-line', title: 'Agent 保存' }],
        ['rename_game', { title: 'Agent 研究' }],
        ['inspect_position', { point: 'D4' }],
      ]
    : [
        ['inspect_position', { point: 'D4' }],
        [
          'analyze_variation',
          { moves: ['D5'], point: 'D4', visits: 100, purpose: '搜索白棋长出后的应对' },
        ],
      ];
  for (const [name, arguments_] of calls) {
    index++;
    const item = { id: `tool-${index}`, type: 'mcp_tool_call', server: 'go_trainer', tool: name };
    emit(
      codex
        ? { type: 'item.started', item }
        : {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              content_block: { type: 'tool_use', id: item.id, name, input: arguments_ },
            },
          },
    );
    const result = await client.callTool({ name, arguments: arguments_ });
    if (result.isError) throw new Error('Fixture tool failed');
    emit(
      codex
        ? { type: 'item.completed', item }
        : {
            type: 'user',
            message: {
              content: [{ type: 'tool_result', tool_use_id: item.id, content: '工具完成' }],
            },
          },
    );
  }
  const answer = input.includes('fixture:manage-games')
    ? '已加载第二局、保存变化并改名为 Agent 研究。'
    : '白 D4 被打吃，应向 D5 长出。';
  if (codex) {
    emit({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: answer } });
    emit({ type: 'turn.completed' });
    writeFileSync(args[args.indexOf('--output-last-message') + 1], answer);
  } else {
    emit({ type: 'stream_event', event: { delta: { type: 'text_delta', text: answer } } });
    emit({ type: 'result', result: answer, is_error: false });
  }
} finally {
  await client.close();
}
