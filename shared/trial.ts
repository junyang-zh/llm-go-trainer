import { play, replay, toIndex } from './go';
import type { Game, Move } from './types';

// Track provenance through captures, including recapture on a historical point.
export function trialStoneIndices(game: Game, turn: number, moves: Move[]): number[] {
  let position = replay({ ...game, moves: game.moves.slice(0, turn) });
  const stones = new Set<number>();
  for (const move of moves) {
    position = play(position, move, game.size, game.rules);
    for (const index of stones) if (!position.board[index]) stones.delete(index);
    if (move.point !== 'pass') stones.add(toIndex(move.point, game.size));
  }
  return [...stones];
}
