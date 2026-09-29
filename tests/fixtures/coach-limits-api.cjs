const express = require('express');
module.exports = function coachLimitsApi() {
  const router = express.Router();
  router.use(express.json());
  const providers = {
    codex: { available: true, state: 'ready' },
    claude: { available: false, state: 'missing' },
    deepseek: { available: false, state: 'unconfigured' },
  };
  const view = {
    preference: 'auto',
    selected: 'codex',
    providers,
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'fixture',
      effort: 'default',
      keyConfigured: false,
      keySource: 'none',
    },
    codex: { model: '', effort: 'default' },
    claude: { model: '', effort: 'default' },
    models: { deepseek: [], codex: [], claude: [] },
    limits: { timeoutSeconds: 0, toolCalls: 0, searchVisits: 0 },
  };
  router.get('/llm/settings', (_req, res) => res.json(view));
  router.post('/llm/settings', (req, res) => {
    view.limits = { ...view.limits, ...req.body.limits };
    res.json(view);
  });
  router.post('/coach', (req, res) => {
    res.type('application/x-ndjson');
    const send = (event) => res.write(JSON.stringify(event) + '\n');
    if (req.body.continuationId) {
      if (Object.keys(req.body).length !== 1 || req.body.continuationId !== 'fixture-token') {
        send({ type: 'error', error: 'Invalid continuation request' });
      } else {
        send({ type: 'text', text: '第一段。\n\n继续完成。' });
        send({ type: 'done', answer: '第一段。\n\n继续完成。', analysis: null });
      }
    } else {
      send({ type: 'text', text: '第一段。' });
      send({
        type: 'paused',
        reason: '已达到最长用时，分析已超时',
        continuationId: 'fixture-token',
      });
    }
    res.end();
  });
  return router;
};
