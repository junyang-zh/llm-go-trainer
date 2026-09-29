const express = require('express');
const calls = [
  ['query_game_history', { query: '第二局' }],
  ['load_game', { gameId: '22222222-2222-4222-8222-222222222222' }],
  ['edit_trial', { id: 'saved-line', moves: ['D4'] }],
  ['save_game', { branchId: 'saved-line', title: 'Agent 保存' }],
  ['rename_game', { title: 'Agent 研究' }],
  ['inspect_position', { point: 'D4' }],
];
module.exports = function managementProvider() {
  const site = express();
  site.use(express.json({ limit: '2mb' }));
  site.get('/models', (_req, res) => res.json({ data: [{ id: 'fixture' }] }));
  site.post('/chat/completions', (req, res) => {
    const results = req.body.messages.filter((message) => message.role === 'tool');
    if (results.some((message) => JSON.parse(message.content).error)) {
      res.status(500).json({ error: 'Fixture tool failed' });
      return;
    }
    const call = calls[results.length];
    const delta = call
      ? {
          tool_calls: [
            {
              index: 0,
              id: `call-${results.length}`,
              type: 'function',
              function: { name: call[0], arguments: JSON.stringify(call[1]) },
            },
          ],
        }
      : { content: '已加载第二局、保存变化并改名为 Agent 研究。' };
    res.type('text/event-stream');
    res.end(
      `data: ${JSON.stringify({ choices: [{ delta, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  return site;
};
