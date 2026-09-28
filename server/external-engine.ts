import type { Analysis, EngineConnection, Game, Training } from '../shared/types';
import type { AnalysisEngine, AnalysisOptions } from './engine';
import { readLines } from '../shared/stream';
import { engineResponse } from './schema';

export function validateEngineUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search)
    throw new Error('引擎地址不能包含凭据、查询参数或片段');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  )
    throw new Error('外部引擎需使用 HTTPS 或本机 HTTP 地址');
  return url.href;
}
// Other engines can implement this adapter contract without changing board or coach code.
export class ExternalEngine implements AnalysisEngine {
  private closed = false;
  private controller = new AbortController();
  constructor(
    private connection: Extract<EngineConnection, { mode: 'external' }>,
    private timeout = 120000,
  ) {
    validateEngineUrl(connection.url);
  }
  status() {
    return { configured: !this.closed, running: !this.closed, humanModel: false };
  }
  async analyze(game: Game, training: Training, options: AnalysisOptions = {}): Promise<Analysis> {
    if (this.closed) throw new Error('外部引擎已断开');
    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(
        training.searchLimit === 'time'
          ? Math.max(this.timeout, (training.maxTime ?? 5) * 1000 + 10000)
          : this.timeout,
      ),
      ...(options.signal ? [options.signal] : []),
    ]);
    const response = await fetch(this.connection.url, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Go-Trainer': '1',
        Accept: 'application/x-ndjson, application/json',
      },
      body: JSON.stringify({ game, training }),
    });
    if (!response.ok) throw new Error(`外部引擎 HTTP ${response.status}`);
    const validate = (raw: unknown): Analysis => {
      const data = engineResponse.parse(raw);
      if (
        (raw as Analysis)?.perspective !== 'B' ||
        data.turnNumber !== game.moves.length ||
        (data.ownership && data.ownership.length !== game.size ** 2)
      )
        throw new Error('外部引擎的视角、手数或棋盘大小不匹配');
      return { ...data, perspective: 'B' };
    };
    if (!response.headers.get('content-type')?.includes('application/x-ndjson'))
      return validate(await response.json());
    if (!response.body) throw new Error('外部引擎未返回数据');
    for await (const line of readLines(response.body, signal)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error('外部引擎分析失败');
      if (event.type === 'analysis' && event.phase === 'after')
        options.onProgress?.(validate(event.analysis));
      if (event.type === 'done') return validate(event.analysis);
    }
    throw new Error('外部引擎连接中断');
  }
  close() {
    this.closed = true;
    this.controller.abort();
  }
}
