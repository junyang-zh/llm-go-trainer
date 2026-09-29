import { t } from './i18n';
import type { StreamEvent } from '../shared/types';
import { readLines } from '../shared/stream';

export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? t('requestFailed', { v0: response.status }));
  return result;
}

export async function streamApi(
  path: string,
  data: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Go-Trainer': '1',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error ?? t('requestFailed', { v0: response.status }));
  }
  if (!response.body) throw new Error(t('noResponseStreamReceived'));
  let complete = false;
  // Local events include the full accumulated answer and tool evidence. Their size
  // must not impose a second, hidden work limit on a long-running coach request.
  for await (const line of readLines(response.body, signal, Infinity)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === 'error') throw new Error(event.error);
    onEvent(event);
    if (event.type === 'done' || event.type === 'paused') {
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error(t('connectionInterruptedAnalysisIncomplete'));
}
