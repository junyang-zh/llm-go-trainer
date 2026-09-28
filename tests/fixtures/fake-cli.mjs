import { writeFileSync } from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const args = process.argv.slice(2);
if (prompt === 'timeout') await new Promise((resolve) => setTimeout(resolve, 10000));
if (prompt === 'fail') process.exit(2);
const answer = `讲解：${prompt}`;
const output = args.indexOf('--output-last-message');
const stream = args.includes('--json') || args.includes('stream-json');
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');
if (stream) {
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
