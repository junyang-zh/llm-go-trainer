const express = require('express');

module.exports = function layoutApi() {
  const router = express.Router();
  router.use(express.json());
  const library = { games: [], conversations: [] };
  router.post('/fixture/reset', (_req, res) => {
    library.games = [];
    library.conversations = [];
    res.json({ ok: true });
  });
  router.get('/library', (_req, res) => res.json(library));
  for (const kind of ['games', 'conversations'])
    router.post(`/library/${kind}`, (req, res) => {
      library[kind] = [req.body, ...library[kind].filter((item) => item.id !== req.body.id)];
      res.json(req.body);
    });
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
      providers: { deepseek: false, codex: true, claude: false },
      llm: {
        preference: 'auto',
        selected: 'codex',
        providers: {
          codex: { available: true, state: 'ready' },
          claude: { available: false, state: 'missing' },
          deepseek: { available: false, state: 'unconfigured' },
        },
      },
    }),
  );
  function analysis(game) {
    const occupied = new Set(game.moves.map((move) => move.point));
    const pv = ['C4', 'D5', 'E4', 'F4'].filter((point) => !occupied.has(point)).slice(0, 2);
    return {
      id: 'layout-fixture',
      perspective: 'B',
      turnNumber: game.moves.length,
      rootInfo: { visits: 100, winrate: 0.5, scoreLead: 0 },
      moveInfos: pv.length
        ? [{ move: pv[0], order: 0, visits: 100, winrate: 0.5, scoreLead: 0, pv }]
        : [],
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
  router.post('/coach', (req, res) => {
    res.type('application/x-ndjson');
    const send = (event) => res.write(JSON.stringify(event) + '\n');
    const activity = {
      id: 'fixture-search',
      name: 'analyze_variation',
      label: '检查断点后的应对',
      state: 'running',
      baseTurn: req.body.game.moves.length,
      moves: [{ color: 'B', point: 'C4' }],
    };
    send({ type: 'tool', activity });
    const timer = setTimeout(() => {
      send({
        type: 'tool',
        activity: {
          ...activity,
          state: 'done',
          elapsedMs: 300,
          evaluation: {
            visits: 100,
            winrate: 0.6,
            scoreLead: 2.5,
            pv: [{ color: 'W', point: 'D5' }],
          },
        },
      });
      send({ type: 'text', text: '**黑棋粘住断点**，保持联络。' });
      send({ type: 'done', answer: '**黑棋粘住断点**，保持联络。', analysis: null });
      res.end();
    }, 300);
    res.on('close', () => clearTimeout(timer));
  });
  return router;
};
