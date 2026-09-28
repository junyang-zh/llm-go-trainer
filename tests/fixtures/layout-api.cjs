const express = require('express');

module.exports = function layoutApi() {
  const router = express.Router();
  router.use(express.json());
  router.get('/status', (_req, res) =>
    res.json({
      engine: {
        configured: true,
        running: true,
        ready: true,
        phase: 'ready',
        mode: 'managed',
        name: 'KataGo',
        pid: 100,
      },
      providers: { deepseek: false, codex: false, claude: false },
    }),
  );
  function analysis(game) {
    return {
      id: 'layout-fixture',
      perspective: 'B',
      turnNumber: game.moves.length,
      rootInfo: { visits: 100, winrate: 0.5, scoreLead: 0 },
      moveInfos: [{ move: 'C4', order: 0, visits: 100, winrate: 0.5, scoreLead: 0, pv: ['C4'] }],
    };
  }
  router.post('/analyze', (req, res) => {
    res.type('application/x-ndjson');
    res.end(JSON.stringify({ type: 'done', analysis: analysis(req.body.game) }) + '\n');
  });
  router.post('/bot-move', (req, res) => {
    const { game } = req.body;
    setTimeout(() => {
      res.json({
        move: ['Q16', 'D16', 'Q17'][Math.floor(game.moves.length / 2)],
        method: '测试对手',
        analysis: analysis(game),
      });
    }, 250);
  });
  return router;
};
