import type { RecordSources } from './record-sources';
import express from 'express';
import { presetRecord, presetSgf, presetSummary, searchPresets } from './presets';
import { cwiPresetInfo } from '../shared/presets';
import { randomUUID } from 'node:crypto';
import { CoachBudget } from './coach-budget';
import { HistoryLibrary } from './library';
import { FoxRecords } from './fox';
import { CoachTools } from './coach-tools';
import { join } from 'node:path';
import { LlmSettings } from './llm-settings';
import { z } from 'zod';
import { analysisRequest, coachRequest } from './schema';
import type { AnalysisEngine, EngineController } from './engine';
import { connectionSchema } from './engine-manager';
import type { ProviderConfig } from './providers';
import { coach } from './providers';
import { buildEvidence } from './evidence';
import { replay } from '../shared/go';
import { selectMove } from '../shared/training';
import { openStream } from './stream';
import type { Analysis, AnalysisPhase } from '../shared/types';
import type { KataGoModels } from './katago-models';
import { selectionSchema } from './katago-catalog';

export function createApp(
  engine: AnalysisEngine,
  providers: ProviderConfig,
  prompt: string,
  webRoot: string,
  controller?: EngineController,
  llm = new LlmSettings(providers),
  library = new HistoryLibrary(),
  models?: KataGoModels,
  records?: RecordSources,
  fox = new FoxRecords(library),
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Loopback binding alone doesn't block hostile websites or DNS rebinding.
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
      res.status(403).json({ error: 'Local requests only' });
      return;
    }
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://${host}`, 'http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)
    ) {
      res.status(403).json({ error: 'Origin denied' });
      return;
    }
    if (
      req.path.startsWith('/api') &&
      req.method !== 'GET' &&
      (req.headers['x-go-trainer'] !== '1' || !req.is('application/json'))
    ) {
      res.status(403).json({ error: 'JSON app requests only' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    next();
  });
  app.use('/api/library', express.json({ limit: '32mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/library/sources', (_req, res) => res.json(records?.list() ?? []));
  app.get('/api/library/fox', (_req, res) => res.json(fox.snapshot()));
  app.post('/api/library/fox/sync', async (req, res) => res.json(await fox.sync(req.body)));
  app.post('/api/library/fox/open', async (req, res) => res.json(await fox.open(req.body)));
  app.post('/api/library/sources/:id/download', (req, res) => {
    if (!records) throw new Error('Record downloader unavailable');
    res.json(records.start(req.params.id));
  });
  app.post('/api/library/sources/:id/cancel', async (req, res) => {
    if (!records) throw new Error('Record downloader unavailable');
    res.json(await records.cancel(req.params.id));
  });
  app.post('/api/library/games/:id/name', (req, res) => {
    const title = z.string().trim().min(1).max(200).parse(req.body.title);
    res.json(library.renameGame(z.uuid().parse(req.params.id), title));
  });
  app.get('/api/library', (_req, res) => res.json(library.snapshot()));
  app.get('/api/library/presets', (req, res) => {
    const query = z
      .object({
        query: z.string().max(200).default(''),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        groupId: z.uuid().optional(),
      })
      .parse(req.query);
    res.json(searchPresets(query.query, query.offset, query.limit, query.groupId));
  });
  app.get('/api/library/presets/:id/sgf', (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const sgf = presetSgf(id);
    const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
    const source = presetSummary(id)!.preset!;
    const notice = `SO[${esc(source.source + ' · ' + source.sourceUrl)}]CP[${esc(cwiPresetInfo.license + ' ' + cwiPresetInfo.licenseUrl)}]`;
    res.json({ sgf: sgf.replace(/\(\s*;/, (root) => root + notice) });
  });
  app.get('/api/library/presets/:id/summary', (req, res) => {
    const record = presetSummary(z.uuid().parse(req.params.id));
    if (!record) {
      res.status(404).json({ error: '找不到预置棋谱' });
      return;
    }
    res.json(record);
  });
  app.get('/api/library/presets/:id', (req, res) => {
    const record = presetRecord(z.uuid().parse(req.params.id));
    if (!record) {
      res.status(404).json({ error: '找不到预置棋谱' });
      return;
    }
    res.json(record);
  });

  app.post('/api/library/games', (req, res) => res.json(library.saveGame(req.body)));
  app.post('/api/library/conversations', (req, res) =>
    res.json(library.saveConversation(req.body)),
  );
  app.get('/api/status', async (_req, res) => {
    const current = await llm.status();
    res.json({
      engine: engine.status(),
      llm: current,
      providers: {
        deepseek: current.providers.deepseek.available,
        codex: current.providers.codex.available,
        claude: current.providers.claude.available,
      },
    });
  });
  app.get('/api/llm/settings', async (_req, res) => res.json(await llm.view()));
  app.post('/api/llm/settings', async (req, res) => res.json(await llm.update(req.body)));
  app.post('/api/llm/check', async (_req, res) => res.json(await llm.refresh()));
  app.get('/api/engine/connection', (_req, res) =>
    res.json(controller?.connection() ?? { mode: 'managed' }),
  );
  app.get('/api/models', (_req, res) => {
    if (!models) {
      res.status(501).json({ error: '模型管理不可用' });
      return;
    }
    res.json(models.view());
  });
  app.post('/api/models/:action', async (req, res) => {
    if (!models) {
      res.status(501).json({ error: '模型管理不可用' });
      return;
    }
    const id = () => z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body).id;
    switch (req.params.action) {
      case 'download':
        models.download(id());
        break;
      case 'cancel':
        await models.cancel(id());
        break;
      case 'delete':
        await models.remove(id());
        break;
      case 'add':
        await models.addCustom(req.body);
        break;
      case 'refresh': {
        const { page } = z
          .object({ page: z.number().int().min(1).max(100).default(1) })
          .parse(req.body);
        await models.refresh(page);
        break;
      }
      case 'select':
        if (!controller?.selectModels) throw new Error('当前引擎不支持模型选择');
        await controller.selectModels(selectionSchema.parse(req.body));
        break;
      default:
        res.status(404).json({ error: 'Unknown model action' });
        return;
    }
    res.status(202).json(models.view());
  });
  app.post('/api/engine/:action', async (req, res) => {
    if (!controller) {
      res.status(501).json({ error: '引擎管理不可用' });
      return;
    }
    switch (req.params.action) {
      case 'start':
        await controller.start();
        break;
      case 'stop':
        await controller.stop();
        break;
      case 'restart':
        await controller.restart();
        break;
      case 'connect':
        await controller.connect(connectionSchema.parse(req.body));
        break;
      default:
        res.status(404).json({ error: 'Unknown engine action' });
        return;
    }
    res.status(202).json(engine.status());
  });
  app.post('/api/analyze', async (req, res) => {
    const { game, training } = analysisRequest.parse(req.body);
    replay(game);
    if (!req.headers.accept?.includes('application/x-ndjson')) {
      res.json(await engine.analyze(game, training));
      return;
    }
    const stream = openStream(res);
    try {
      stream.send({ type: 'status', text: `${engine.status().name || 'KataGo'} 搜索中` });
      const analysis = await engine.analyze(game, training, {
        signal: stream.signal,
        onProgress: (value) =>
          stream.send({ type: 'analysis', phase: 'after', analysis: value, final: false }),
      });
      stream.send({ type: 'analysis', phase: 'after', analysis, final: true });
      stream.send({ type: 'done', analysis });
    } catch (error) {
      stream.send({ type: 'error', error: error instanceof Error ? error.message : '分析失败' });
    } finally {
      stream.close();
    }
  });
  app.post('/api/bot-move', async (req, res) => {
    const { game, training } = analysisRequest.parse(req.body);
    if (replay(game).passes >= 2) {
      res.status(400).json({ error: '双方已停一手；请复盘或开始新对局。' });
      return;
    }
    if (!req.headers.accept?.includes('application/x-ndjson')) {
      const analysis = await engine.analyze(game, training);
      res.json({ ...selectMove(game, analysis, training), analysis });
      return;
    }
    const stream = openStream(res);
    try {
      const analysis = await engine.analyze(game, training, {
        signal: stream.signal,
        onProgress: (value) =>
          stream.send({ type: 'analysis', phase: 'after', analysis: value, final: false }),
      });
      stream.send({ type: 'done', ...selectMove(game, analysis, training), analysis });
    } catch (error) {
      stream.send({ type: 'error', error: error instanceof Error ? error.message : '分析失败' });
    } finally {
      stream.close();
    }
  });
  let coaching = false;
  // Resumptions use server-owned evidence and the original board, never client-supplied results.
  const continuations = new Map<
    string,
    {
      expires: number;
      request: z.infer<typeof coachRequest>;
      tools: ReturnType<CoachTools['snapshot']>;
      text: string;
      after?: Analysis | null;
      before?: Analysis | null;
    }
  >();
  app.post('/api/coach', async (req, res) => {
    for (const [id, saved] of continuations)
      if (saved.expires < Date.now()) continuations.delete(id);
    const continuationId =
      req.body?.continuationId === undefined
        ? undefined
        : z.object({ continuationId: z.uuid() }).strict().parse(req.body).continuationId;
    const resumed = continuationId ? continuations.get(continuationId) : undefined;
    if (continuationId && !resumed) {
      res.status(410).json({ error: '继续任务已过期或应用已重启，请重新提问' });
      return;
    }
    const request = resumed?.request ?? coachRequest.parse(req.body);
    const { game, training, provider: requested, action, question, history, context } = request;
    replay(game);
    if (context && !resumed) {
      const saved = library.getGame(context.gameId);
      const expected = {
        ...saved.game,
        moves: [...saved.game.moves.slice(0, context.turn), ...context.trialMoves],
      };
      if (
        context.turn > saved.game.moves.length ||
        JSON.stringify(expected) !== JSON.stringify(game)
      ) {
        res.status(400).json({ error: '棋局上下文与当前局面不一致' });
        return;
      }
      context.gameTitle = saved.title;
    }
    if (coaching) {
      res.status(429).json({ error: '已有分析进行中' });
      return;
    }
    if (action === 'move' && !game.moves.length) {
      res.status(400).json({ error: '棋盘上还没有落子' });
      return;
    }
    const { provider, config } = await llm.resolve(requested);
    // Authentication checks may outlive a client that already cancelled its request.
    if (res.destroyed) return;
    if (coaching) {
      res.status(429).json({ error: '已有分析进行中' });
      return;
    }
    if (continuationId && continuations.get(continuationId) !== resumed) {
      res.status(410).json({ error: '本轮额度已使用，请等待当前任务完成' });
      return;
    }
    coaching = true;
    if (continuationId) continuations.delete(continuationId);
    const stream = req.headers.accept?.includes('application/x-ndjson')
      ? openStream(res)
      : undefined;
    const controller = new AbortController();
    const budget = new CoachBudget(config.timeout);
    const signal = AbortSignal.any([
      controller.signal,
      budget.signal,
      ...(stream ? [stream.signal] : []),
    ]);
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', disconnected);
    const tools = new CoachTools(
      engine,
      game,
      training,
      (activity) => stream?.send({ type: 'tool', activity }),
      signal,
      { library, context },
      config.limits,
      budget,
      resumed?.tools,
    );
    let text = resumed?.text ?? '';
    const prefix = text ? text + '\n\n' : '';
    let after = resumed?.after,
      before = resumed?.before;
    try {
      const analyze = async (phase: AnalysisPhase) => {
        stream?.send({
          type: 'status',
          text: `${engine.status().name || 'KataGo'} ${phase === 'before' ? '分析落子前局面' : '分析当前局面'}`,
        });
        const value = await engine.analyze(
          phase === 'before' ? { ...game, moves: game.moves.slice(0, -1) } : game,
          training,
          {
            signal,
            onProgress: stream
              ? (analysis) => stream.send({ type: 'analysis', phase, analysis, final: false })
              : undefined,
          },
        );
        stream?.send({ type: 'analysis', phase, analysis: value, final: true });
        return value;
      };
      // Engine evidence is generated on the server, never trusted from client chat text.
      const ready = engine.status().ready ?? engine.status().configured;
      if (after === undefined) after = ready ? await analyze('after') : null;
      if (!after)
        stream?.send({ type: 'status', text: `${engine.status().name || 'KataGo'} 未就绪` });
      if (before === undefined)
        before = after && action === 'move' ? await analyze('before') : null;
      const evidence = buildEvidence(
        game,
        training,
        after,
        before,
        engine.status().name || 'KataGo',
      );
      const tasks = {
        move: '解释最后这一手，比较落子前候选与落子后变化',
        position: '说明当前局势与双方的全局优先级',
        variation: '分析当前最佳候选的后续变化',
        chat: question,
      };
      stream?.send({
        type: 'status',
        text: `${provider === 'deepseek' ? 'DeepSeek' : provider === 'codex' ? 'Codex' : 'Claude'} 连接中`,
      });
      const answer = await coach(
        provider,
        config,
        prompt,
        {
          ...evidence,
          boardContext: context,
          ...(resumed
            ? {
                continuation: {
                  requested: true,
                  previousText: resumed.text,
                  toolResults: resumed.tools.results,
                  trials: resumed.tools.trials.map(([, trial]) => trial),
                  currentContext: resumed.tools.context,
                  currentGame: resumed.tools.game,
                },
              }
            : {}),
        },
        `${action}: ${tasks[action]}${action !== 'chat' && question ? '\n' + question : ''}`,
        history,
        {
          signal,
          tools,
          budget,
          onText: (value) => {
            text = prefix + value;
            stream?.send({ type: 'text', text });
          },
          onStatus: stream ? (text) => stream.send({ type: 'status', text }) : undefined,
        },
      );
      signal.throwIfAborted();
      text = prefix + answer;
      const fullEvidence = { ...evidence, boardContext: context, toolResults: tools.results };
      if (stream)
        stream.send({ type: 'done', answer: text, evidence: fullEvidence, analysis: after });
      else res.json({ answer: text, evidence: fullEvidence, analysis: after });
    } catch (error) {
      if (
        budget.reason &&
        !controller.signal.aborted &&
        !stream?.signal.aborted &&
        !res.destroyed
      ) {
        const id = randomUUID();
        while (continuations.size >= 8) continuations.delete(continuations.keys().next().value!);
        continuations.set(id, {
          expires: Date.now() + 30 * 60 * 1000,
          request: { ...request, provider },
          tools: tools.snapshot(),
          text,
          after,
          before,
        });
        const paused = { type: 'paused' as const, reason: budget.reason, continuationId: id };
        if (stream) stream.send(paused);
        else res.json(paused);
      } else if (stream)
        stream.send({ type: 'error', error: error instanceof Error ? error.message : '分析失败' });
      else throw error;
    } finally {
      budget.close();
      controller.abort();
      tools.close();
      res.off('close', disconnected);
      stream?.close();
      coaching = false;
    }
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API route' });
  });
  app.use(express.static(webRoot));
  app.get('/', (_req, res) => res.sendFile(join(webRoot, 'index.html')));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = error instanceof z.ZodError ? 400 : 502;
      const message =
        error instanceof z.ZodError
          ? '请求参数无效，请检查输入与设置'
          : error instanceof Error
            ? error.message
            : '服务暂时不可用';
      res.status(status).json({ error: message });
    },
  );
  return app;
}
