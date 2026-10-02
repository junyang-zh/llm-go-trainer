import { toIndex } from '../../shared/go';
import type { Candidate } from '../../shared/types';

export function boardOverlays(size: number) {
  const points = ['D4', 'E4', 'A' + size, (size === 19 ? 'T' : size === 13 ? 'N' : 'J') + '1'];
  const ownership = Array<number>(size ** 2).fill(0);
  for (const [point, value] of [
    ['D4', 0.95],
    ['E4', -0.95],
    ['F4', 0.79],
    ['G4', -0.79],
    ['H4', 0.8],
    ['J4', -0.8],
  ] as const)
    ownership[toIndex(point, size)] = value;
  const candidates: Candidate[] = points.map((move, order) => ({
    move,
    order,
    visits: 100,
    winrate: 0.5,
    scoreLead: 0,
    prior: 0.1,
    pv: [move],
  }));
  return { ownership, candidates };
}
