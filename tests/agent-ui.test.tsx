import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentActivity } from '../src/AgentActivity';
import { finishMessage, updateMessage, type AnalysisMessage } from '../src/messages';
import type { ToolActivity } from '../shared/types';

const initial: AnalysisMessage = {
  id: 'message',
  question: '白棋是否安定',
  text: '',
  status: '',
  state: 'running',
  evaluations: {},
};
const activity: ToolActivity = {
  id: 'search',
  name: 'analyze_variation',
  label: '检查白棋长出',
  state: 'running',
  baseTurn: 12,
  moves: [{ color: 'W', point: 'D5' }],
};

it('updates tool progress in place and retains its details after the final answer', () => {
  let message = updateMessage(initial, { type: 'tool', activity });
  expect(message.tools).toHaveLength(1);
  expect(message.evaluations).toEqual({});
  message = updateMessage(message, {
    type: 'tool',
    activity: {
      ...activity,
      state: 'done',
      elapsedMs: 1500,
      evaluation: { visits: 800, winrate: 0.3, scoreLead: -4.5, pv: [{ color: 'B', point: 'E5' }] },
    },
  });
  message = updateMessage(message, { type: 'done', answer: '白棋应向上出头。', analysis: null });
  expect(message.tools).toHaveLength(1);
  expect(message.tools?.[0].state).toBe('done');
  const html = renderToStaticMarkup(<AgentActivity tools={message.tools!} />);
  expect(html).toContain('白 D5');
  expect(html).toContain('黑 E5');
  expect(html).toContain('黑胜率 30.0%');
  expect(html).toContain('黑目差 -4.5');
  expect(html).toContain('1.5s');
  expect(html).not.toContain('<details open');
});
it('marks active tools stopped on cancellation and ignores late updates', () => {
  const pending = updateMessage(initial, { type: 'tool', activity });
  const stopped = finishMessage(pending, 'stopped', '已停止');
  expect(stopped.tools?.[0].state).toBe('stopped');
  expect(updateMessage(stopped, { type: 'tool', activity: { ...activity, state: 'done' } })).toBe(
    stopped,
  );
});
it('preserves completed tools but marks remaining work failed when the provider disconnects', () => {
  let message = updateMessage(initial, { type: 'tool', activity: { ...activity, state: 'done' } });
  message = updateMessage(message, { type: 'tool', activity: { ...activity, id: 'second' } });
  message = updateMessage(message, { type: 'error', error: '连接中断' });
  expect(message.tools?.map((tool) => tool.state)).toEqual(['done', 'error']);
});
