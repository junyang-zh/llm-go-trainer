// Decode UTF-8 incrementally: network chunks need not align with characters or lines.
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  maxLineLength = 1_000_000,
) {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        if (end > maxLineLength) throw new Error('流式数据超出限制');
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        yield line;
      }
      if (pending.length > maxLineLength) throw new Error('流式数据超出限制');
      if (done) break;
    }
    if (pending) yield pending.replace(/\r$/, '');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* readSseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  let data: string[] = [];
  for await (const line of readLines(body, signal)) {
    if (!line) {
      if (data.length) yield data.join('\n');
      data = [];
    } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield data.join('\n');
}
