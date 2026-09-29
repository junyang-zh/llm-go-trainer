const gameId = '11111111-1111-4111-8111-111111111111';
const game = {
  size: 19,
  komi: 7.5,
  rules: 'chinese',
  initialPlayer: 'B',
  initialStones: [],
  moves: [],
  metadata: {},
};
const branch = {
  id: 'line',
  label: '变化',
  gameId,
  baseTurn: 0,
  base: game,
  moves: [
    { color: 'B', point: 'C2' },
    { color: 'W', point: 'B2' },
  ],
};
module.exports = {
  game: { id: gameId, title: '选点浏览', updatedAt: new Date().toISOString(), game },
  conversation: {
    id: '22222222-2222-4222-8222-222222222222',
    title: '选点浏览',
    updatedAt: new Date().toISOString(),
    history: [],
    draft: '',
    messages: [
      {
        id: 'markup',
        question: '[问题不标点](#T19)',
        state: 'done',
        status: '',
        evaluations: {},
        context: { gameId, gameTitle: '选点浏览', turn: 0, trialMoves: [] },
        trials: { line: branch },
        tools: [
          {
            id: 'tool',
            name: 'inspect_position',
            label: '[记录不标点](#T18)',
            detail: '[详情不标点](#T17)',
            state: 'done',
          },
        ],
        text:
          '[远处标记](#A19)\n\n' +
          Array.from({ length: 35 }, (_, i) => `第 ${i + 1} 段讲解。`).join('\n\n') +
          '\n\n[变化一](#go/selector/one?branch=line&ply=0) [变化二](#go/selector/two?branch=line&ply=1)\n\n黑 [二路爬](#go/point/C2?group=one)，白 [B2](#go/point/B2?group=one)。\n\n白 [B3](#go/point/B3?group=two)，以及 [D4](#D4)。',
      },
    ],
  },
};
