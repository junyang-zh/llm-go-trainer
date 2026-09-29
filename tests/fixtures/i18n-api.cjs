const express = require('express');
const layoutApi = require('./layout-api.cjs');
const coachLimitsApi = require('./coach-limits-api.cjs');
const advancedModel = require('../../config/katago/models.json').find(
  (model) => model.tier === 'advanced',
);
module.exports = function i18nApi() {
  const router = express.Router();
  router.use(express.json());
  let stage = 'pending',
    count = 0;
  const requests = new Set();
  function send({ res, game }) {
    if (stage === 'pending') return;
    if (stage === 'error') {
      res.end(JSON.stringify({ type: 'error', error: 'Fixture engine unavailable' }) + '\n');
      return;
    }
    const moves = ['C4', 'D5', 'E4'].slice(0, count);
    const analysis = {
      id: 'i18n-fixture',
      perspective: 'B',
      turnNumber: game.moves.length,
      rootInfo: { visits: stage === 'done' ? 1200 : 300, winrate: 0.65, scoreLead: 3.5 },
      searchStats: { visitsPerSecond: 600 },
      moveInfos: moves.map((move, order) => ({
        move,
        order,
        visits: 100,
        winrate: 0.65,
        scoreLead: 3.5,
        pv: [move],
      })),
    };
    res.write(
      JSON.stringify({ type: 'analysis', phase: 'after', analysis, final: stage === 'done' }) +
        '\n',
    );
    if (stage === 'done') res.end(JSON.stringify({ type: 'done', analysis }) + '\n');
  }
  router.post('/fixture/search', (req, res) => {
    stage = req.body.stage;
    count = req.body.count ?? 0;
    for (const request of requests) send(request);
    res.json({ ok: true });
  });
  router.post('/analyze', (req, res) => {
    res.type('application/x-ndjson');
    res.flushHeaders();
    const request = { res, game: req.body.game };
    requests.add(request);
    res.on('close', () => requests.delete(request));
    send(request);
  });
  router.get('/engine/connection', (_req, res) => res.json({ mode: 'managed' }));
  router.get('/models', (_req, res) =>
    res.json({
      notice: '模型设置读取失败，已恢复默认选择；已下载的文件仍保留。',
      canSelect: true,
      storageBytes: 1024 ** 3,
      selected: { main: advancedModel.id, human: null },
      models: [
        {
          id: advancedModel.id,
          name: advancedModel.name,
          sha256: 'a'.repeat(64),
          url: 'https://example.com/model.bin.gz',
          role: 'main',
          tier: 'balanced',
          architecture: '自定义',
          error:
            'KataGo 主模型 下载失败（katagotraining.org）：下载失败 HTTP 503：katagotraining.org',
          description: '',
          boards: [9, 13, 19],
          source: 'https://example.com',
          installed: true,
          diskBytes: 1024 ** 3,
          phase: 'installed',
        },
      ],
    }),
  );
  router.use(coachLimitsApi());
  router.use(layoutApi());
  return router;
};
