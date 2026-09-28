import { COLUMNS, groupAt, replay, toPoint } from '../shared/go';
import type { Analysis, Game, Training } from '../shared/types';

export function compact(analysis: Analysis | null) {
  if (!analysis) return null;
  return {
    perspective: 'B',
    root: analysis.rootInfo,
    candidates: analysis.moveInfos
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, 5)
      .map((c) => ({ ...c, pv: c.pv.slice(0, 10) })),
    ownership: analysis.ownership
      ? {
          note: 'predicted endgame ownership; row-major from top-left; +1 Black, -1 White',
          values: analysis.ownership.map((v) => Number(v.toFixed(2))),
        }
      : undefined,
  };
}
export function positionFacts(game: Game) {
  const position = replay(game),
    seen = new Set<number>();
  const groups = position.board.flatMap((color, i) => {
    if (!color || seen.has(i)) return [];
    const group = groupAt(position.board, i, game.size);
    group.stones.forEach((p) => seen.add(p));
    return [
      {
        color,
        stones: [...group.stones].map((p) => toPoint(p, game.size)),
        liberties: [...group.liberties].map((p) => toPoint(p, game.size)),
      },
    ];
  });
  const board =
    Array.from(
      { length: game.size },
      (_, y) =>
        `${game.size - y} ${position.board
          .slice(y * game.size, (y + 1) * game.size)
          .map((c) => (c === 'B' ? 'X' : c === 'W' ? 'O' : '.'))
          .join(' ')}`,
    ).join('\n') +
    '\n  ' +
    COLUMNS.slice(0, game.size).split('').join(' ');
  return {
    size: game.size,
    rules:
      game.rules === 'chinese'
        ? 'Chinese area / positional superko / handicap bonus N'
        : 'Japanese territory / simple ko',
    komi: game.komi,
    turn: game.moves.length,
    toPlay: position.toPlay,
    captures: position.captures,
    initialStones: game.initialStones,
    board,
    groups,
    lastMove: game.moves.at(-1),
    recentMoves: game.moves.slice(-16),
  };
}
export function buildEvidence(
  game: Game,
  training: Training,
  after: Analysis | null,
  before: Analysis | null,
  engineName = 'KataGo',
) {
  const last = game.moves.at(-1);
  return {
    schemaVersion: 1,
    learnerRank: training.rank,
    engineAvailable: !!after,
    engineName,
    position: positionFacts(game),
    beforePosition: last ? positionFacts({ ...game, moves: game.moves.slice(0, -1) }) : null,
    after: compact(after),
    before: compact(before),
    estimatedLossFromMover:
      before && after && last
        ? (last.color === 'B' ? 1 : -1) * (before.rootInfo.scoreLead - after.rootInfo.scoreLead)
        : null,
  };
}
