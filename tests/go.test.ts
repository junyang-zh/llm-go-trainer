import { describe, expect, it } from 'vitest';
import { areaScore, groupAt, newGame, play, replay, toIndex, toPoint } from '../shared/go';
import type { Game, Move } from '../shared/types';

function setup(black: string[], white: string[], toPlay: 'B' | 'W' = 'B'): Game {
  return {
    ...newGame(9),
    initialPlayer: toPlay,
    initialStones: [
      ...black.map((point) => ({ color: 'B' as const, point })),
      ...white.map((point) => ({ color: 'W' as const, point })),
    ],
  };
}
describe('Go position rules', () => {
  it('uses GTP coordinates without I, from upper-left to lower-right', () => {
    expect(toPoint(0, 19)).toBe('A19');
    expect(toPoint(360, 19)).toBe('T1');
    expect(toIndex('J10', 19)).toBe(179);
    expect(() => toIndex('I1', 19)).toThrow();
    expect(() => toIndex('T1', 9)).toThrow();
    for (let i = 0; i < 361; i++) expect(toIndex(toPoint(i, 19), 19)).toBe(i);
  });
  it('captures a surrounded group and maintains liberties', () => {
    const game = setup(['A2', 'B1', 'C2'], ['B2']);
    const p = play(replay(game), { color: 'B', point: 'B3' }, 9, 'chinese');
    expect(p.board[toIndex('B2', 9)]).toBeNull();
    expect(p.captures.B).toBe(1);
    expect(p.toPlay).toBe('W');
    expect(groupAt(p.board, toIndex('B3', 9), 9).liberties.size).toBe(4);
  });
  it('rejects suicide but allows capturing into no immediate liberties', () => {
    const game = setup([], ['A2', 'B1', 'C2', 'B3']);
    expect(() => play(replay(game), { color: 'B', point: 'B2' }, 9, 'chinese')).toThrow('自杀');
    const capture = setup(['A1', 'C1', 'A3', 'C3', 'B4', 'D2'], ['A2', 'B1', 'C2', 'B3']);
    expect(play(replay(capture), { color: 'B', point: 'B2' }, 9, 'chinese').captures.B).toBe(4);
  });
  it.each(['chinese', 'japanese'] as const)('rejects immediate ko recapture (%s)', (rules) => {
    const game = setup(['A2', 'B1', 'B3'], ['B2', 'C1', 'C3', 'D2']);
    const p = play(replay(game), { color: 'B', point: 'C2' }, 9, rules);
    expect(() => play(p, { color: 'W', point: 'B2' }, 9, rules)).toThrow('劫争');
  });
  it('distinguishes positional superko from simple ko after intervening passes', () => {
    const game = setup(['A2', 'B1', 'B3'], ['B2', 'C1', 'C3', 'D2']);
    let p = play(replay(game), { color: 'B', point: 'C2' }, 9, 'chinese');
    p = play(p, { color: 'W', point: 'pass' }, 9, 'chinese');
    p = play(p, { color: 'B', point: 'pass' }, 9, 'chinese');
    expect(() => play(p, { color: 'W', point: 'B2' }, 9, 'chinese')).toThrow('劫争');
    expect(() => play(p, { color: 'W', point: 'B2' }, 9, 'japanese')).not.toThrow();
  });
  it('preserves turn order and pass history', () => {
    const p = replay(newGame(9));
    expect(() => play(p, { color: 'W', point: 'A1' }, 9, 'chinese')).toThrow();
    expect(
      play(
        play(p, { color: 'B', point: 'pass' }, 9, 'chinese'),
        { color: 'W', point: 'pass' },
        9,
        'chinese',
      ).passes,
    ).toBe(2);
  });
  it.each([9, 13, 19])('places all handicap counts correctly on %i', (size) => {
    for (let n = 2; n <= 9; n++) {
      const game = newGame(size, n);
      expect(game.initialStones).toHaveLength(n);
      expect(new Set(game.initialStones.map((m) => m.point)).size).toBe(n);
      expect(replay(game).toPlay).toBe('W');
      expect(game.komi).toBe(0.5);
    }
  });
  it('counts only single-color bordered empty regions and supports dead removal', () => {
    const game = setup(['A2', 'B1', 'B3', 'C2'], ['H8']);
    const position = replay(game),
      score = areaScore(position, 9, 7.5);
    // A1 and B2 are both surrounded, in addition to the four live stones.
    expect(score.black).toBe(6);
    expect(score.white).toBe(1);
    expect(score.ownership[toIndex('E5', 9)]).toBe(0);
    expect(areaScore(position, 9, 7.5, [toIndex('H8', 9)]).black).toBe(81);
    expect(areaScore(replay(newGame(9)), 9, 7.5).black).toBe(0);
  });
});
