import { writeFileSync } from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const args = process.argv.slice(2);
if (prompt === 'timeout') await new Promise((resolve) => setTimeout(resolve, 10000));
if (prompt === 'fail') process.exit(2);
const answer = prompt === 'large-answer' ? '棋'.repeat(1_050_000) : `讲解：${prompt}`;
const output = args.indexOf('--output-last-message');
const stream = args.includes('--json') || args.includes('stream-json');
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');
if (stream) {
  if (prompt === 'verbose-output') {
    // Real CLI streams include repeated reasoning and large tool results, even
    // when the public answer is short. These records exceed the former total cap.
    for (let i = 0; i < 24; i++) {
      const payload = 'private-tool-result'.repeat(8000);
      emit(
        output >= 0
          ? {
              type: 'item.completed',
              item: {
                id: `tool-${i}`,
                type: 'mcp_tool_call',
                result: { content: [{ type: 'text', text: payload }] },
              },
            }
          : {
              type: 'user',
              message: {
                content: [{ type: 'tool_result', tool_use_id: `tool-${i}`, content: payload }],
              },
            },
      );
    }
  }
  if (prompt === 'web-search') {
    if (output >= 0) {
      const item = { id: 'web', type: 'web_search', query: '围棋规则' };
      emit({ type: 'item.started', item });
      emit({ type: 'item.completed', item });
    } else {
      for (const name of ['WebSearch', 'WebFetch']) {
        emit({
          type: 'stream_event',
          event: { type: 'content_block_start', content_block: { type: 'tool_use', name } },
        });
      }
    }
  }
  if (output >= 0) {
    emit({ type: 'turn.started' });
    emit({
      type: 'item.completed',
      item: { id: 'private', type: 'reasoning', text: 'private-reasoning' },
    });
    emit({ type: 'item.updated', item: { id: 'answer', type: 'agent_message', text: '讲解：' } });
  } else {
    emit({ type: 'system', subtype: 'init' });
    emit({
      type: 'stream_event',
      event: { delta: { type: 'thinking_delta', thinking: 'private-reasoning' } },
    });
    emit({ type: 'stream_event', event: { delta: { type: 'text_delta', text: '讲解：' } } });
  }
  if (prompt === 'truncated') process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, prompt === 'abort' ? 10000 : 30));
  if (output >= 0) {
    emit({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: answer } });
    emit({ type: 'turn.completed' });
    writeFileSync(args[output + 1], answer);
  } else {
    emit({ type: 'stream_event', event: { delta: { type: 'text_delta', text: prompt } } });
    emit({ type: 'result', is_error: false, result: answer });
  }
} else if (output >= 0) {
  writeFileSync(args[output + 1], answer);
  console.log('progress, not the answer');
} else console.log(answer);
