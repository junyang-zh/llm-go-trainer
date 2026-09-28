import { describe, expect, it } from 'vitest';
import { newGame } from '../shared/go';
import {
  compatibleHistory,
  evaluationSegments,
  positionKey,
  positionKeys,
  recordEvaluation,
} from '../src/evaluation-history';
import { evaluation, recordedGame } from './fixtures/evaluation';

describe('evaluation history', () => {
  it('retains Black perspective when White is to play', () => {
    const point = recordEvaluation({}, positionKey(recordedGame, 1), evaluation(1), true)[1];
    expect(point.winrate).toBe(0.2);
    expect(point.scoreLead).toBe(-3.5);
  });
  it('keeps the shared prefix, removes discarded branches, and ignores metadata', () => {
    const keys = positionKeys(recordedGame);
    let points = {};
    for (let turn = 0; turn <= 3; turn++)
      points = recordEvaluation(points, keys[turn], evaluation(turn), true);
    const branch = {
      ...recordedGame,
      moves: [...recordedGame.moves.slice(0, 2), { color: 'B' as const, point: 'F4' }],
    };
    expect(Object.keys(compatibleHistory(points, positionKeys(branch)))).toEqual(['0', '1', '2']);
    expect(
      Object.keys(
        compatibleHistory(
          points,
          positionKeys({ ...recordedGame, moves: recordedGame.moves.slice(0, 1) }),
        ),
      ),
    ).toEqual(['0', '1']);
    expect(
      compatibleHistory(points, positionKeys({ ...recordedGame, metadata: { PB: 'changed' } })),
    ).toEqual(points);
    expect(positionKey(recordedGame, 2)).toBe(keys[2]);
  });
  it('separates board size, rules, komi and setup stones', () => {
    const key = positionKey(recordedGame, 0);
    const points = recordEvaluation({}, key, evaluation(0), true);
    for (const changed of [
      { ...recordedGame, komi: 6.5 },
      { ...recordedGame, rules: 'japanese' as const },
      newGame(13),
      newGame(9, 2),
      { ...recordedGame, initialPlayer: 'W' as const },
    ])
      expect(compatibleHistory(points, positionKeys(changed))).toEqual({});
  });
  it('retains deeper completed searches and replaces partial results with final results', () => {
    const key = positionKey(recordedGame, 0);
    const final = recordEvaluation({}, key, evaluation(0, 800), true);
    expect(recordEvaluation(final, key, evaluation(0, 100), true)).toBe(final);
    expect(recordEvaluation(final, key, evaluation(0, 900), false)).toBe(final);
    const partial = recordEvaluation({}, key, evaluation(0, 50), false);
    expect(recordEvaluation(partial, key, evaluation(0, 100), true)[0]).toMatchObject({
      visits: 100,
      final: true,
    });
  });
  it('leaves missing turns as gaps and rejects invalid engine numbers', () => {
    let points = {};
    for (const turn of [3, 0, 1])
      points = recordEvaluation(points, positionKey(recordedGame, turn), evaluation(turn), true);
    expect(
      evaluationSegments(Object.values(points)).map((segment) =>
        segment.map((point) => point.turn),
      ),
    ).toEqual([[0, 1], [3]]);
    const value = evaluation(0);
    for (const rootInfo of [
      { ...value.rootInfo, winrate: 2 },
      { ...value.rootInfo, scoreLead: NaN },
      { ...value.rootInfo, visits: -1 },
    ])
      expect(recordEvaluation({}, 'invalid', { ...value, rootInfo }, true)).toEqual({});
  });
});
