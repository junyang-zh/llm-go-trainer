import { matchesRecord } from '../shared/library';
import { searchPresets } from './presets';
import { summarizeRecord } from '../shared/presets';
import { defaultCoachLimits, type CoachLimits } from '../shared/llm';
import type { CoachBudget } from './coach-budget';
import type { BoardContext } from '../shared/library';
import type { HistoryLibrary } from './library';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { groupAt, other, play, replay, toIndex, toPoint } from '../shared/go';
import type { Analysis, Game, Move, ToolActivity, Training } from '../shared/types';
import type { AnalysisEngine } from './engine';
import { compact, positionFacts } from './evidence';
import { editCoachTrial, type CoachTrial } from '../shared/trial';

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
  edit_trial: z
    .object({
      id: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,40}$/)
        .describe('本轮讲解中的稳定分支 ID；重复 ID 原子替换，失败保留原分支'),
      label: z.string().trim().min(1).max(80).default('试下变化'),
      operation: z.enum(['set', 'delete']).default('set'),
      base: z.enum(['current', 'main', 'branch']).default('current'),
      turn: z.number().int().min(0).max(1500).optional().describe('base=main 时指定原局起点手数'),
      source: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,40}$/)
        .optional()
        .describe('base=branch 时指定本轮已创建的分支 ID'),
      ply: z
        .number()
        .int()
        .min(0)
        .max(1500)
        .optional()
        .describe('base=branch 时保留前几手，再用 moves 替换后缀；省略则追加'),
      moves: z
        .array(z.string().max(4))
        .max(60)
        .default([])
        .describe('从起点依次试下，自动交替颜色；空数组可截断分支'),
    })
    .strict(),
  query_game_history: z
    .object({
      gameId: z.uuid().optional().describe('省略时搜索棋谱；提供 ID 时读取历史或预置棋谱'),
      query: z
        .string()
        .max(200)
        .default('')
        .describe('按名称、棋手、关键词搜索；空格分隔多个关键词'),
      category: z
        .enum(['all', 'history', 'famous', 'joseki', 'tsumego'])
        .default('history')
        .describe('history 历史对局；famous CWI 全库；joseki 定式；tsumego 死活；all 全部'),
      groupId: z.uuid().optional().describe('仅查询指定同源棋谱组'),
      turn: z
        .number()
        .int()
        .min(0)
        .max(1500)
        .optional()
        .describe('读取棋局的指定手数局面；省略时读取全局'),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
    })
    .strict(),
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
  edit_trial:
    '创建、修改或删除讲解用的试下分支，不修改实战棋谱。可从当前局面（含用户试下）、原局某手或本轮已有分支某手开始。合法性检查成功后保存到对话并返回可点击的 Markdown selector 链接；用户点击才切换棋盘。',
  query_game_history:
    '搜索本地历史对局和预置著名棋谱、定式、死活题；支持 query、category、groupId 和分页。按 gameId 读取完整棋谱、来源版权和指定手数的棋盘。返回当前选中的棋局 ID、原局手数及用户试下手顺；历史棋局和对话独立。',
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
  private idPrefix = '';
  private visits = 0;
  private cache = new Map<string, Analysis>();
  private trials = new Map<string, CoachTrial>();
  readonly results: { name: string; arguments: unknown; result: CoachToolResult }[] = [];
  readonly signal: AbortSignal;

  constructor(
    private engine: AnalysisEngine,
    private game: Game,
    private training: Training,
    private onActivity?: (activity: ToolActivity) => void,
    signal?: AbortSignal,
    private session?: { library: HistoryLibrary; context?: BoardContext },
    private limits: CoachLimits = defaultCoachLimits,
    private budget?: CoachBudget,
    saved?: ReturnType<CoachTools['snapshot']>,
  ) {
    if (saved) {
      this.idPrefix = randomUUID() + ':';
      this.cache = new Map(saved.cache);
      this.trials = new Map(saved.trials);
      this.results.push(...saved.results);
    }
    this.signal = AbortSignal.any([this.controller.signal, ...(signal ? [signal] : [])]);
  }
  snapshot() {
    return { cache: [...this.cache], trials: [...this.trials], results: [...this.results] };
  }
  get available() {
    return (
      (!!this.budget || !this.limits.toolCalls || this.calls < this.limits.toolCalls) &&
      !this.signal.aborted
    );
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
    const task = this.queue.then(() => this.execute(name, args, this.idPrefix + id, signal));
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
      label:
        name === 'edit_trial'
          ? '编辑试下'
          : name === 'query_game_history'
            ? '搜索棋谱'
            : name === 'inspect_position'
              ? '检查棋块'
              : '搜索变化',
      state: 'running',
    };
    const emit = (patch: Partial<ToolActivity>) => {
      activity = { ...activity, ...patch, elapsedMs: Date.now() - started };
      this.onActivity?.(activity);
    };
    let result: CoachToolResult;
    try {
      this.calls++;
      if (this.limits.toolCalls > 0 && this.calls > this.limits.toolCalls) {
        this.budget?.hit('已达到工具调用次数上限');
        throw new Error('本次工具调用额度已用完，请依据已有结果完成讲解');
      }
      if (name === 'edit_trial') {
        const args = coachToolSchemas.edit_trial.parse(raw);
        let branch: CoachTrial | null = null;
        if (args.operation === 'delete') {
          if (!this.trials.has(args.id)) throw new Error('找不到本轮试下分支');
        } else {
          let base = this.game;
          let baseTurn = this.session?.context?.turn ?? this.game.moves.length;
          let prefix: Move[] = [];
          let ply = 0;
          if (args.base === 'main') {
            if (args.turn === undefined || args.source !== undefined || args.ply !== undefined)
              throw new Error('原局起点需要 turn，不能带 source 或 ply');
            const original = this.session?.context
              ? this.session.library.getGame(this.session.context.gameId).game
              : this.game;
            if (args.turn > original.moves.length) throw new Error('原局手数超出范围');
            base = { ...original, moves: original.moves.slice(0, args.turn) };
            baseTurn = args.turn;
          } else if (args.base === 'branch') {
            if (!args.source || args.turn !== undefined)
              throw new Error('分支起点需要 source，不能带 turn');
            const source = this.trials.get(args.source);
            if (!source) throw new Error('找不到本轮试下分支');
            base = source.base;
            baseTurn = source.baseTurn;
            prefix = source.moves;
            ply = args.ply ?? prefix.length;
          } else if (
            args.turn !== undefined ||
            args.source !== undefined ||
            args.ply !== undefined
          ) {
            throw new Error('当前局面起点不能带 turn、source 或 ply');
          }
          const moves = editCoachTrial(base, prefix, ply, args.moves);
          if (base.moves.length + moves.length > 1500) throw new Error('试下总手数超出范围');
          branch = {
            id: args.id,
            label: args.label,
            gameId: this.session?.context?.gameId,
            baseTurn,
            base: structuredClone(base),
            moves,
          };
        }
        signal.throwIfAborted();
        if (branch) this.trials.set(args.id, branch);
        else this.trials.delete(args.id);
        result = {
          data: {
            branch,
            id: args.id,
            ...(branch
              ? {
                  selector: `[${args.label.replace(/[\[\]\\]/g, '')}](#go/selector/${args.id}?branch=${args.id}&ply=0)`,
                  position: positionFacts({
                    ...branch.base,
                    moves: [...branch.base.moves, ...branch.moves],
                  }),
                }
              : {}),
            remainingCalls: this.limits.toolCalls
              ? Math.max(0, this.limits.toolCalls - this.calls)
              : 'unlimited',
          },
        };
        emit({
          state: 'done',
          trialEdit: { id: args.id, branch },
          detail: branch ? `${branch.label} · ${branch.moves.length} 手` : '分支已删除',
        });
        this.results.push({ name, arguments: raw, result });
        return result;
      }
      if (name === 'query_game_history') {
        const args = coachToolSchemas.query_game_history.parse(raw);
        if (!this.session) throw new Error('历史棋局库不可用');
        let data: Record<string, unknown>;
        if (args.gameId) {
          const saved = this.session.library.getGame(args.gameId);
          const turn = args.turn ?? saved.game.moves.length;
          if (turn > saved.game.moves.length) throw new Error('手数超出棋局范围');
          data = {
            ...saved,
            turn,
            position: positionFacts({ ...saved.game, moves: saved.game.moves.slice(0, turn) }),
          };
        } else {
          const history = ['all', 'history'].includes(args.category)
            ? this.session.library
                .snapshot()
                .games.filter(
                  (item) =>
                    (!args.groupId || (item.groupId ?? item.id) === args.groupId) &&
                    matchesRecord(item, args.query),
                )
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
            : [];
          const historicalPage = history
            .slice(args.offset, args.offset + args.limit)
            .map(summarizeRecord);
          const presets = ['all', 'famous'].includes(args.category)
            ? searchPresets(
                args.query,
                Math.max(0, args.offset - history.length),
                args.limit - historicalPage.length,
                args.groupId,
              )
            : { total: 0, games: [] };
          data = {
            total: history.length + presets.total,
            games: [...historicalPage, ...presets.games],
          };
        }
        result = {
          data: {
            ...data,
            currentContext: this.session.context,
            remainingCalls: this.limits.toolCalls
              ? Math.max(0, this.limits.toolCalls - this.calls)
              : 'unlimited',
          },
        };
        emit({ state: 'done' });
        this.results.push({ name, arguments: raw, result });
        return result;
      }
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
          if (
            this.limits.searchVisits > 0 &&
            this.visits + search.visits > this.limits.searchVisits
          ) {
            this.budget?.hit('已达到累计搜索量上限');
            throw new Error('本次搜索额度已用完，请依据已有结果完成讲解');
          }
          this.visits += search.visits;
          analysis = await this.engine.analyze(
            game,
            { ...this.training, visits: search.visits, searchLimit: 'visits' },
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
          currentContext: this.session?.context,
          focus,
          ...(analysis
            ? {
                analysis: compact(analysis),
                perspective: 'B',
                engineName: this.engine.status().name || 'KataGo',
              }
            : {}),
          remainingCalls: this.limits.toolCalls
            ? Math.max(0, this.limits.toolCalls - this.calls)
            : 'unlimited',
          remainingSearchVisits: this.limits.searchVisits
            ? this.limits.searchVisits - this.visits
            : 'unlimited',
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
