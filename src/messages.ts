import type { Analysis, AnalysisPhase, StreamEvent, ToolActivity } from '../shared/types';

export interface AnalysisMessage {
  id: string;
  question: string;
  text: string;
  status: string;
  state: 'running' | 'done' | 'stopped' | 'error';
  evaluations: Partial<Record<AnalysisPhase, { analysis: Analysis; final: boolean }>>;
  tools?: ToolActivity[];
}
export function finishMessage(
  message: AnalysisMessage,
  state: 'done' | 'error' | 'stopped',
  status: string,
): AnalysisMessage {
  return {
    ...message,
    state,
    status,
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
    case 'status':
      return { ...message, status: event.text };
    case 'tool': {
      const tools = [...(message.tools ?? [])];
      const index = tools.findIndex((tool) => tool.id === event.activity.id);
      if (index >= 0) {
        if (tools[index].state !== 'running') return message;
        tools[index] = event.activity;
      } else tools.push(event.activity);
      return {
        ...message,
        tools,
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
