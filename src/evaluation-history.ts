import type { Analysis, Game } from '../shared/types';

export interface EvaluationPoint {
  key: string;
  turn: number;
  // Stored exactly as returned by the engine: Black win probability and Black score lead.
  winrate: number;
  scoreLead: number;
  visits: number;
  final: boolean;
}
export type EvaluationHistory = Record<number, EvaluationPoint>;
function setupKey(game: Game) {
  return JSON.stringify([game.size, game.rules, game.komi, game.initialPlayer, game.initialStones]);
}
export function positionKey(game: Game, turn = game.moves.length) {
  return (
    setupKey(game) +
    game.moves
      .slice(0, turn)
      .map((move) => `;${move.color}:${move.point}`)
      .join('')
  );
}
export function positionKeys(game: Game) {
  const keys = [setupKey(game)];
  for (const move of game.moves) keys.push(keys.at(-1) + `;${move.color}:${move.point}`);
  return keys;
}
export function compatibleHistory(history: EvaluationHistory, keys: string[]): EvaluationHistory {
  return Object.fromEntries(
    Object.entries(history).filter(([, point]) => keys[point.turn] === point.key),
  );
}
export function recordEvaluation(
  history: EvaluationHistory,
  key: string,
  analysis: Analysis,
  final: boolean,
): EvaluationHistory {
  const { winrate, scoreLead, visits } = analysis.rootInfo;
  if (
    analysis.perspective !== 'B' ||
    !Number.isInteger(analysis.turnNumber) ||
    analysis.turnNumber < 0 ||
    !Number.isFinite(winrate) ||
    winrate < 0 ||
    winrate > 1 ||
    !Number.isFinite(scoreLead) ||
    !Number.isFinite(visits) ||
    visits < 0
  )
    return history;
  const previous = history[analysis.turnNumber];
  if (previous?.key === key) {
    if (previous.final && (!final || previous.visits > visits)) return history;
    if (!previous.final && !final && previous.visits > visits) return history;
  }
  return {
    ...history,
    [analysis.turnNumber]: { key, turn: analysis.turnNumber, winrate, scoreLead, visits, final },
  };
}
// A missing turn is a gap, never an interpolated or invented engine evaluation.
export function evaluationSegments(points: EvaluationPoint[]) {
  const segments: EvaluationPoint[][] = [];
  for (const point of [...points].sort((a, b) => a.turn - b.turn)) {
    const last = segments.at(-1);
    if (last && last.at(-1)!.turn + 1 === point.turn) last.push(point);
    else segments.push([point]);
  }
  return segments;
}
