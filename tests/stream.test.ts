import { afterEach, expect, it, vi } from 'vitest';
import { readLines } from '../shared/stream';
import { streamApi } from '../src/api';
import { type AnalysisMessage, updateMessage } from '../src/messages';
import type { StreamEvent } from '../shared/types';
afterEach(() => vi.unstubAllGlobals());

it('updates the conversation before HTTP closes and preserves partial text on a broken connection', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller;
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  let message: AnalysisMessage = {
    id: '1',
    question: '当前局势',
    text: '',
    status: '',
    state: 'running',
    evaluations: {},
  };
  let updated!: () => void;
  const first = new Promise<void>((resolve) => {
    updated = resolve;
  });
  const pending = streamApi('coach', {}, (event) => {
    message = updateMessage(message, event);
    updated();
  });
  const result = expect(pending).rejects.toThrow('未完成');
  source.enqueue(
    new TextEncoder().encode(
      JSON.stringify({ type: 'text', text: '黑棋右边较弱' } satisfies StreamEvent) + '\n',
    ),
  );
  await first;
  expect(message.text).toBe('黑棋右边较弱');
  expect(message.state).toBe('running');
  source.close();
  await result;
  message = updateMessage(message, { type: 'error', error: '连接中断' });
  expect(message.state).toBe('error');
  expect(message.text).toBe('黑棋右边较弱');
});
it('finishes on a done event, using the authoritative final answer', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"type":"text","text":"片段"}\n{"type":"done","answer":"完整回答","analysis":null}\n',
        ),
      ),
  );
  let message: AnalysisMessage = {
    id: '1',
    question: '分析',
    text: '',
    status: '',
    state: 'running',
    evaluations: {},
  };
  await streamApi('coach', {}, (event) => {
    message = updateMessage(message, event);
  });
  expect(message.text).toBe('完整回答');
  expect(message.state).toBe('done');
});
it('cancels a pending read and releases its stream lock', async () => {
  const canceled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel: canceled });
  const controller = new AbortController();
  const reader = readLines(body, controller.signal);
  const pending = reader.next();
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(canceled).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});
