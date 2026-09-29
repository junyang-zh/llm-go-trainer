import type { StreamEvent } from '../shared/types';
import type { AnalysisMessage } from '../shared/library';
export type { AnalysisMessage } from '../shared/library';

export function finishMessage(
  message: AnalysisMessage,
  state: 'done' | 'error' | 'stopped' | 'paused',
  status: string,
): AnalysisMessage {
  return {
    ...message,
    state,
    status,
    continuationId: undefined,
    tools: message.tools?.map((tool) =>
      tool.state === 'running'
        ? {
            ...tool,
            state: state === 'error' ? 'error' : 'stopped',
            detail: state === 'done' ? '未完成' : status,
          }
        : tool,
    ),
  };
}
export function updateMessage(message: AnalysisMessage, event: StreamEvent): AnalysisMessage {
  if (message.state !== 'running') return message;
  switch (event.type) {
    case 'paused':
      return {
        ...finishMessage(message, 'paused', event.reason),
        continuationId: event.continuationId,
      };
    case 'status':
      return { ...message, status: event.text };
    case 'tool': {
      const tools = [...(message.tools ?? [])];
      const index = tools.findIndex((tool) => tool.id === event.activity.id);
      if (index >= 0) {
        if (tools[index].state !== 'running') return message;
        tools[index] = event.activity;
      } else tools.push(event.activity);
      let trials = { ...message.trials };
      const edit = event.activity.state === 'done' ? event.activity.trialEdit : undefined;
      if (edit) {
        if (edit.branch) trials = { ...trials, [edit.id]: edit.branch };
        else delete trials[edit.id];
      }
      return {
        ...message,
        tools,
        trials,
        status: event.activity.state === 'running' ? event.activity.label : '正在整理分析',
      };
    }
    case 'analysis':
      return {
        ...message,
        evaluations: {
          ...message.evaluations,
          [event.phase]: { analysis: event.analysis, final: event.final },
        },
      };
    case 'text':
      return { ...message, text: event.text, status: '生成中' };
    case 'done':
      return finishMessage({ ...message, text: event.answer ?? message.text }, 'done', '');
    case 'error':
      return finishMessage(message, 'error', event.error);
  }
}
