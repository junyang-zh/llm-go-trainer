import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Analysis, Game, Training } from '../shared/types';
import { newGame, replay } from '../shared/go';
import { trainingForRank } from '../shared/training';
import type { AnalysisOptions } from './engine';
export type { AnalysisOptions } from './engine';
import { engineResponse } from './schema';

export interface EngineConfig {
  executable: string;
  model: string;
  config: string;
  humanModel?: string;
  timeout: number;
  prefixArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}
type Pending = {
  resolve: (value: Analysis) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  size: number;
  turn: number;
  onProgress?: (analysis: Analysis) => void;
  cleanup: () => void;
};
export class KataGo {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private diagnostics = '';
  private lastError?: string;
  private stopped = false;
  private children = new Map<ChildProcessWithoutNullStreams, Promise<void>>();
  private terminating = new WeakSet<ChildProcessWithoutNullStreams>();
  private onExit = () => {
    for (const child of this.children.keys()) child.kill('SIGKILL');
  };
  async initialize(signal?: AbortSignal) {
    this.stopped = false;
    await this.analyze(newGame(19), { ...trainingForRank('5k'), visits: 1 }, { signal });
  }
  constructor(private config: EngineConfig) {}
  status() {
    return {
      configured:
        !!this.config.model && existsSync(this.config.model) && existsSync(this.config.config),
      running: !!this.child,
      humanModel: !!this.config.humanModel && existsSync(this.config.humanModel),
      error: this.lastError,
      pid: this.child?.pid,
    };
  }
  private start() {
    if (this.stopped) throw new Error('引擎已停止');
    if (this.child) return this.child;
    if (!this.status().configured) throw new Error('KataGo 文件不完整');
    const args = [
      ...(this.config.prefixArgs ?? []),
      'analysis',
      '-model',
      this.config.model,
      '-config',
      this.config.config,
      '-override-config',
      'reportAnalysisWinratesAs=BLACK',
    ];
    if (this.config.humanModel) args.push('-human-model', this.config.humanModel);
    this.diagnostics = '';
    this.lastError = undefined;
    const child = spawn(this.config.executable, args, {
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
      cwd: this.config.cwd,
      env: this.config.env,
      detached: false,
    });
    this.child = child;
    if (!this.children.size) process.once('exit', this.onExit);
    this.children.set(
      child,
      new Promise<void>((resolve) =>
        child.once('close', () => {
          this.children.delete(child);
          if (!this.children.size) process.removeListener('exit', this.onExit);
          resolve();
        }),
      ),
    );
    child.stderr.on('data', (chunk) => {
      this.diagnostics = (this.diagnostics + chunk.toString()).slice(-4000);
    });
    child.stdin.on('error', (error) =>
      this.fail(child, new Error(`KataGo 输入流关闭：${error.message}`)),
    );
    child.on('error', (error) => this.fail(child, new Error(`无法启动 KataGo：${error.message}`)));
    child.on('exit', (code) =>
      this.fail(child, new Error(`KataGo 已退出 (${code})。${this.diagnostics.slice(-1500)}`)),
    );
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      if (!raw || typeof raw !== 'object') return;
      const pending = this.pending.get(raw.id);
      if (!pending) return;
      if (raw.error) {
        this.finish(raw.id, new Error(`KataGo：${String(raw.error)}`));
        return;
      }
      if (raw.warning) return;
      const result = engineResponse.safeParse(raw);
      if (!result.success) {
        this.finish(raw.id, new Error('KataGo 返回了无法识别的数据'));
        return;
      }
      const value = result.data;
      if (
        value.turnNumber !== pending.turn ||
        (value.ownership && value.ownership.length !== pending.size ** 2)
      ) {
        this.finish(raw.id, new Error('KataGo 响应的手数或棋盘大小不匹配'));
        return;
      }
      const analysis: Analysis = { ...value, perspective: 'B' };
      if (raw.isDuringSearch) pending.onProgress?.(analysis);
      else this.finish(raw.id, undefined, analysis);
    });
    return child;
  }
  private finish(id: string, error?: Error, value?: Analysis) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.cleanup();
    this.pending.delete(id);
    if (error) pending.reject(error);
    else pending.resolve(value!);
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.lastError = error.message;
    this.child = undefined;
    for (const id of this.pending.keys()) this.finish(id, error);
    this.terminate(child);
  }
  private terminate(child: ChildProcessWithoutNullStreams) {
    if (this.terminating.has(child)) return;
    this.terminating.add(child);
    child.stdin.end();
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
  }
  async analyze(game: Game, training: Training, options: AnalysisOptions = {}): Promise<Analysis> {
    options.signal?.throwIfAborted();
    replay(game);
    if (this.pending.size >= 4) throw new Error('分析队列已满，请等待当前分析完成');
    const child = this.start(),
      id = randomUUID();
    const request = {
      id,
      moves: game.moves.map((m) => [m.color, m.point]),
      initialStones: game.initialStones.map((m) => [m.color, m.point]),
      initialPlayer: game.initialPlayer,
      rules: game.rules === 'chinese' ? 'chinese-ogs' : 'japanese',
      komi: game.komi,
      boardXSize: game.size,
      boardYSize: game.size,
      analyzeTurns: [game.moves.length],
      maxVisits: training.visits,
      includeOwnership: true,
      includePolicy: true,
      analysisPVLen: 12,
      ...(options.onProgress
        ? { reportDuringSearchEvery: 0.5, firstReportDuringSearchAfter: 0.1 }
        : {}),
      overrideSettings: {
        reportAnalysisWinratesAs: 'BLACK',
        ...(this.config.humanModel
          ? { humanSLProfile: `rank_${training.rank}`, ignorePreRootHistory: false }
          : {}),
      },
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            child,
            new Error('KataGo 分析超时；引擎已重置，可增加 KATAGO_TIMEOUT_MS 后重试。'),
          ),
        this.config.timeout,
      );
      const abort = () => {
        this.finish(id, new Error('分析已停止'));
        if (!child.stdin.destroyed)
          child.stdin.write(
            JSON.stringify({ id: randomUUID(), action: 'terminate', terminateId: id }) + '\n',
            () => {},
          );
      };
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        size: game.size,
        turn: game.moves.length,
        onProgress: options.onProgress,
        cleanup: () => options.signal?.removeEventListener('abort', abort),
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) {
        abort();
        return;
      }
      child.stdin.write(JSON.stringify(request) + '\n', (error) => {
        if (error) this.fail(child, error);
      });
    });
  }
  async close() {
    this.stopped = true;
    const pending = [...this.children.values()];
    if (this.child) this.fail(this.child, new Error('KataGo 服务已停止'));
    for (const child of this.children.keys()) this.terminate(child);
    await Promise.all(pending);
  }
}
