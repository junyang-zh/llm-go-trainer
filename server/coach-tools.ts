import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { groupAt, other, play, replay, toIndex, toPoint } from '../shared/go';
import type { Analysis, Game, Move, ToolActivity, Training } from '../shared/types';
import type { AnalysisEngine } from './engine';
import { compact, positionFacts } from './evidence';

const context = {
  base: z.enum(['current', 'before']).default('current').describe('从当前局面或最后一手之前开始'),
  moves: z
    .array(z.string().max(4))
    .max(30)
    .default([])
    .describe('从 base 开始依次试下的 GTP 坐标，自动交替行棋；pass 表示停一手'),
  point: z.string().max(4).optional().describe('需要重点观察的棋块坐标'),
};
export const coachToolSchemas = {
  inspect_position: z.object(context).strict(),
  analyze_variation: z
    .object({
      ...context,
      visits: z
        .number()
        .int()
        .min(50)
        .max(4000)
        .default(800)
        .describe('引擎搜索量；困难战术可提高到 2000–4000'),
      purpose: z.string().trim().min(1).max(120).describe('本次搜索要回答的具体围棋问题'),
    })
    .strict(),
};
const descriptions = {
  inspect_position:
    '查看当前或试下后的棋盘、棋块和气。可指定 point 检查一块棋；试下只作用于本次查询，不改变实战棋谱。',
  analyze_variation:
    '让围棋引擎搜索指定变化后的最佳应对，返回黑方胜率/目差、主变化和归属预测。moves 可强制试下原候选之外的落点；比较不同攻击、防守或脱先方案以回答安定、断点、征子等问题。',
};
export const coachToolDefinitions = Object.entries(coachToolSchemas).map(([name, schema]) => ({
  name,
  description: descriptions[name as keyof typeof descriptions],
  inputSchema: z.toJSONSchema(schema, { io: 'input' }),
}));
export interface CoachToolResult {
  isError?: boolean;
  data: Record<string, unknown>;
}

export class CoachTools {
  private controller = new AbortController();
  private queue: Promise<unknown> = Promise.resolve();
  private calls = 0;
  private visits = 0;
  private cache = new Map<string, Analysis>();
  readonly results: { name: string; arguments: unknown; result: CoachToolResult }[] = [];
  readonly signal: AbortSignal;

  constructor(
    private engine: AnalysisEngine,
    private game: Game,
    private training: Training,
    private onActivity?: (activity: ToolActivity) => void,
    signal?: AbortSignal,
  ) {
    this.signal = AbortSignal.any([this.controller.signal, ...(signal ? [signal] : [])]);
  }
  get available() {
    return this.calls < 12 && !this.signal.aborted;
  }
  close() {
    this.controller.abort();
  }
  run(
    name: string,
    args: unknown,
    id: string = randomUUID(),
    signal?: AbortSignal,
  ): Promise<CoachToolResult> {
    const task = this.queue.then(() => this.execute(name, args, id, signal));
    this.queue = task.catch(() => {});
    return task;
  }
  private async execute(
    name: string,
    raw: unknown,
    id: string,
    requestSignal?: AbortSignal,
  ): Promise<CoachToolResult> {
    const signal = AbortSignal.any([this.signal, ...(requestSignal ? [requestSignal] : [])]);
    signal.throwIfAborted();
    const started = Date.now();
    let activity: ToolActivity = {
      id,
      name,
      label: name === 'inspect_position' ? '检查棋块' : '搜索变化',
      state: 'running',
    };
    const emit = (patch: Partial<ToolActivity>) => {
      activity = { ...activity, ...patch, elapsedMs: Date.now() - started };
      this.onActivity?.(activity);
    };
    let result: CoachToolResult;
    try {
      if (++this.calls > 12) throw new Error('本次工具调用额度已用完，请依据已有结果完成讲解');
      if (name !== 'inspect_position' && name !== 'analyze_variation')
        throw new Error('未知围棋工具');
      const search =
        name === 'analyze_variation' ? coachToolSchemas.analyze_variation.parse(raw) : undefined;
      const args = search ?? coachToolSchemas.inspect_position.parse(raw);
      const baseTurn = args.base === 'before' ? this.game.moves.length - 1 : this.game.moves.length;
      if (baseTurn < 0) throw new Error('开局没有上一手局面');
      const game: Game = { ...this.game, moves: this.game.moves.slice(0, baseTurn) };
      let position = replay(game);
      const moves: Move[] = [];
      for (const point of args.moves) {
        const move = {
          color: position.toPlay,
          point: point.toLowerCase() === 'pass' ? 'pass' : point.toUpperCase(),
        };
        position = play(position, move, game.size, game.rules);
        game.moves.push(move);
        moves.push(move);
      }
      const index = args.point ? toIndex(args.point, game.size) : -1;
      if (args.point && index < 0) throw new Error('棋块坐标不能是 pass');
      const focus =
        index >= 0
          ? {
              point: toPoint(index, game.size),
              color: position.board[index],
              stones: [...groupAt(position.board, index, game.size).stones].map((p) =>
                toPoint(p, game.size),
              ),
              liberties: [...groupAt(position.board, index, game.size).liberties].map((p) =>
                toPoint(p, game.size),
              ),
            }
          : undefined;
      emit({
        baseTurn,
        moves,
        label:
          name === 'inspect_position'
            ? `检查${args.point ? ` ${args.point.toUpperCase()} 棋块` : '棋盘'}`
            : (search?.purpose ?? '搜索变化'),
      });
      let analysis: Analysis | undefined;
      if (search) {
        const evaluation = (value: Analysis) => {
          let color = position.toPlay;
          return {
            ...value.rootInfo,
            pv: (value.moveInfos.find((c) => c.order === 0)?.pv ?? []).slice(0, 10).map((point) => {
              const move = { color, point };
              color = other(color);
              return move;
            }),
          };
        };
        const key = JSON.stringify([baseTurn, moves, search.visits]);
        analysis = this.cache.get(key);
        if (!analysis) {
          if (!(this.engine.status().ready ?? this.engine.status().configured))
            throw new Error('围棋引擎未就绪');
          if (this.visits + search.visits > 12000)
            throw new Error('本次搜索额度已用完，请依据已有结果完成讲解');
          this.visits += search.visits;
          analysis = await this.engine.analyze(
            game,
            { ...this.training, visits: search.visits },
            {
              signal,
              onProgress: (value) => {
                if (!signal.aborted) emit({ evaluation: evaluation(value) });
              },
            },
          );
          signal.throwIfAborted();
          this.cache.set(key, analysis);
        }
        emit({ evaluation: evaluation(analysis) });
      }
      signal.throwIfAborted();
      result = {
        data: {
          baseTurn,
          moves,
          position: positionFacts(game),
          focus,
          ...(analysis
            ? {
                analysis: compact(analysis),
                perspective: 'B',
                engineName: this.engine.status().name || 'KataGo',
              }
            : {}),
          remainingCalls: Math.max(0, 12 - this.calls),
          remainingSearchVisits: 12000 - this.visits,
        },
      };
      emit({
        state: 'done',
        detail: focus
          ? focus.color
            ? `${focus.color === 'B' ? '黑' : '白'}棋 ${focus.stones.length} 子 · ${focus.liberties.length} 气`
            : `${focus.point} 为空点`
          : undefined,
      });
    } catch (error) {
      const message = signal.aborted
        ? '已停止'
        : error instanceof z.ZodError
          ? `工具参数无效：${error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('；')}`
          : error instanceof Error
            ? error.message
            : '工具执行失败';
      emit({ state: signal.aborted ? 'stopped' : 'error', detail: message });
      if (signal.aborted) throw new Error('已停止');
      result = { isError: true, data: { error: message } };
    }
    this.results.push({ name, arguments: raw, result });
    return result;
  }
}
