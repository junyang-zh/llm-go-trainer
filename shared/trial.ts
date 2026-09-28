import { play, replay, toIndex } from './go';
import type { Game, Move } from './types';

export interface TrialBranch {
  moves: Move[];
  cursor: number;
}

// Navigation only changes the cursor; playing a new line replaces the recoverable suffix.
export function extendTrial(branch: TrialBranch | null, moves: Move[]): TrialBranch {
  const next = [...(branch?.moves.slice(0, branch.cursor) ?? []), ...moves];
  return { moves: next, cursor: next.length };
}

// Validate the entire engine continuation before exposing any of it as a trial.
export function trialVariation(game: Game, points: string[]): Move[] {
  let position = replay(game);
  const moves: Move[] = [];
  for (const point of points) {
    const move = { color: position.toPlay, point };
    position = play(position, move, game.size, game.rules);
    moves.push(move);
  }
  return moves;
}

// Track provenance through captures, including recapture on a historical point.
export function trialStoneNumbers(game: Game, turn: number, moves: Move[]): Map<number, number> {
  let position = replay({ ...game, moves: game.moves.slice(0, turn) });
  const stones = new Map<number, number>();
  for (const [offset, move] of moves.entries()) {
    position = play(position, move, game.size, game.rules);
    for (const index of stones.keys()) if (!position.board[index]) stones.delete(index);
    // Passes count as moves, but have no stone to label.
    if (move.point !== 'pass') stones.set(toIndex(move.point, game.size), offset + 1);
  }
  return stones;
}
