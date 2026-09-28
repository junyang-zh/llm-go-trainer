import type { Library } from '../../shared/library';
import { newGame } from '../../shared/go';
import { recordedGame, testStatus, evaluation } from './evaluation';
export const firstGameId = '11111111-1111-4111-8111-111111111111';
export const secondGameId = '22222222-2222-4222-8222-222222222222';
export const libraryFixture: Library = {
  games: [
    {
      id: firstGameId,
      title: '第一局',
      updatedAt: '2026-09-28T01:00:00.000Z',
      game: { ...recordedGame, metadata: { GN: '第一局' } },
    },
    {
      id: secondGameId,
      title: '第二局',
      updatedAt: '2026-09-27T01:00:00.000Z',
      game: { ...newGame(9), metadata: { GN: '第二局' } },
    },
  ],
  conversations: [],
};
export const chatStatus = {
  ...testStatus,
  engine: { ...testStatus.engine, configured: false, ready: false, running: false },
  llm: {
    ...testStatus.llm,
    selected: 'codex',
    providers: { ...testStatus.llm.providers, codex: { available: true, state: 'ready' } },
  },
};
export const chatAnswer = '先观察棋块的联络。';
export const captureTrialGame = {
  ...newGame(9),
  initialStones: [{ color: 'W' as const, point: 'A2' }],
  moves: [{ color: 'B' as const, point: 'C3' }],
};

export function libraryBotMove(game: import('../../shared/types').Game) {
  const occupied = new Set([...game.initialStones, ...game.moves].map((move) => move.point));
  return {
    move: ['E5', 'F5', 'G5', 'H5'].find((point) => !occupied.has(point))!,
    method: '测试落子',
    analysis: evaluation(game.moves.length),
  };
}

export function libraryCandidateAnalysis(game: import('../../shared/types').Game, invalid = false) {
  const occupied = new Set([...game.initialStones, ...game.moves].map((move) => move.point));
  const pv = ['D4', 'E4', 'F4', 'G4', 'H4'].filter((point) => !occupied.has(point)).slice(0, 2);
  const analysis = evaluation(game.moves.length);
  analysis.moveInfos = [
    { ...analysis.moveInfos[0], move: pv[0], pv: invalid ? [pv[0], 'C3'] : pv },
  ];
  return analysis;
}
