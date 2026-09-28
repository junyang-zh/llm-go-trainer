import type { Analysis, EngineStatus, Game, Status } from '../../shared/types';
import { newGame } from '../../shared/go';
export function evaluation(turnNumber: number, visits = 100): Analysis {
  return {
    id: 'test-analysis',
    turnNumber,
    perspective: 'B',
    rootInfo: { winrate: 0.2, scoreLead: -3.5, visits, currentPlayer: turnNumber % 2 ? 'W' : 'B' },
    moveInfos: [
      { move: 'D4', order: 0, visits, winrate: 0.2, scoreLead: -3.5, prior: 0.1, pv: ['D4', 'E5'] },
    ],
    ownership: Array(81).fill(0),
  };
}
export const recordedGame: Game = {
  ...newGame(9),
  moves: [
    { color: 'B', point: 'C3' },
    { color: 'W', point: 'G7' },
    { color: 'B', point: 'D6' },
  ],
};
export const testEngine: EngineStatus = {
  configured: true,
  running: true,
  humanModel: false,
  ready: true,
  phase: 'ready',
  mode: 'managed',
  name: 'KataGo',
  pid: 100,
};
export const testStatus: Status = {
  engine: testEngine,
  providers: { deepseek: false, codex: false, claude: false },
  llm: {
    preference: 'auto',
    selected: null,
    providers: {
      deepseek: { available: false, state: 'unconfigured' },
      codex: { available: false, state: 'missing' },
      claude: { available: false, state: 'missing' },
    },
  },
};
