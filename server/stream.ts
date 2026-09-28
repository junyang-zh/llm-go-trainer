import type { Response } from 'express';
import type { StreamEvent } from '../shared/types';

export function openStream(response: Response) {
  const controller = new AbortController();
  response.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  const disconnected = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on('close', disconnected);
  return {
    signal: controller.signal,
    send(event: StreamEvent) {
      if (!response.destroyed && !response.writableEnded)
        response.write(JSON.stringify(event) + '\n');
    },
    close() {
      response.off('close', disconnected);
      if (!response.destroyed) response.end();
    },
  };
}
