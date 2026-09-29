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

it('persists only successful trial edits and ignores late edits after cancellation', async () => {
  const { newGame } = await import('../shared/go');
  const branch = {
    id: 'line',
    label: '变化',
    baseTurn: 0,
    base: newGame(9),
    moves: [{ color: 'B' as const, point: 'D4' }],
  };
  const edit: ToolActivity = {
    id: 'edit',
    name: 'edit_trial',
    label: '编辑',
    state: 'done',
    trialEdit: { id: 'line', branch },
  };
  let message = updateMessage(initial, { type: 'tool', activity: edit });
  expect(message.trials?.line).toEqual(branch);
  message = updateMessage(message, {
    type: 'tool',
    activity: { ...edit, id: 'failed', state: 'error', trialEdit: { id: 'line', branch: null } },
  });
  expect(message.trials?.line).toEqual(branch);
  const stopped = finishMessage(message, 'stopped', '已停止');
  expect(
    updateMessage(stopped, {
      type: 'tool',
      activity: { ...edit, id: 'late', trialEdit: { id: 'line', branch: null } },
    }),
  ).toBe(stopped);
  message = updateMessage(message, {
    type: 'tool',
    activity: { ...edit, id: 'delete', trialEdit: { id: 'line', branch: null } },
  });
  expect(message.trials).toEqual({});
});

it('retains partial work on budget pause, stops unfinished tools and ignores late events', () => {
  const running = updateMessage({ ...initial, text: '已有说明' }, { type: 'tool', activity });
  const paused = updateMessage(running, {
    type: 'paused',
    reason: '已达到最长用时',
    continuationId: 'token',
  });
  expect(paused).toMatchObject({
    state: 'paused',
    text: '已有说明',
    continuationId: 'token',
    tools: [{ state: 'stopped' }],
  });
  expect(updateMessage(paused, { type: 'text', text: 'late' })).toBe(paused);
  expect(finishMessage(paused, 'stopped', '已停止').continuationId).toBeUndefined();
  expect(
    updateMessage(initial, { type: 'error', error: '超时文字但不是额度事件' }).continuationId,
  ).toBeUndefined();
});
