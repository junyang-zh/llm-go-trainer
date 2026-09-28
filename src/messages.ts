import type { Analysis, AnalysisPhase, StreamEvent } from '../shared/types';

export interface AnalysisMessage {
  id: string;
  question: string;
  text: string;
  status: string;
  state: 'running' | 'done' | 'stopped' | 'error';
  evaluations: Partial<Record<AnalysisPhase, { analysis: Analysis; final: boolean }>>;
}
export function updateMessage(message: AnalysisMessage, event: StreamEvent): AnalysisMessage {
  if (message.state !== 'running') return message;
  switch (event.type) {
    case 'status':
      return { ...message, status: event.text };
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
      return { ...message, text: event.answer ?? message.text, state: 'done', status: '' };
    case 'error':
      return { ...message, state: 'error', status: event.error };
  }
}
