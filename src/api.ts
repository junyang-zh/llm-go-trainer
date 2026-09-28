import type { StreamEvent } from '../shared/types';
import { readLines } from '../shared/stream';

export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `请求失败：${response.status}`);
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
    throw new Error(body.error ?? `请求失败：${response.status}`);
  }
  if (!response.body) throw new Error('浏览器未收到数据流');
  let complete = false;
  for await (const line of readLines(response.body, signal)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === 'error') throw new Error(event.error);
    onEvent(event);
    if (event.type === 'done') {
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error('连接中断，分析未完成');
}
