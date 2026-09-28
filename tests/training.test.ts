import { describe, expect, it } from 'vitest';
import { newGame } from '../shared/go';
import { selectMove, trainingForRank } from '../shared/training';
import type { Analysis } from '../shared/types';
import { buildEvidence } from '../server/evidence';

const analysis: Analysis = {
  id: 'test',
  turnNumber: 0,
  perspective: 'B',
  rootInfo: { scoreLead: 2, winrate: 0.6, visits: 100 },
  moveInfos: [
    { move: 'D4', order: 0, visits: 80, prior: 0.5, scoreLead: 2, winrate: 0.6, pv: ['D4', 'E5'] },
    { move: 'E5', order: 1, visits: 20, prior: 0.3, scoreLead: -8, winrate: 0.2, pv: ['E5'] },
  ],
};
describe('training selection and coach evidence', () => {
  it('bounds score loss in the mover perspective (Black and White)', () => {
    const t = { ...trainingForRank('5k'), mode: 'balanced' as const, maxLoss: 1 };
    expect(selectMove(newGame(9), analysis, t, () => 0.99).move).toBe('D4');
    expect(selectMove({ ...newGame(9), initialPlayer: 'W' }, analysis, t, () => 0).move).toBe('E5');
  });
  it('uses HumanSL policy over legal board points while suppressing premature pass', () => {
    const policy = Array(82).fill(0);
    policy[0] = 0.01;
    policy[81] = 0.99;
    expect(
      selectMove(newGame(9), { ...analysis, humanPolicy: policy }, trainingForRank('5k'), () => 0.9)
        .move,
    ).toBe('A9');
    expect(
      selectMove(
        newGame(9),
        {
          ...analysis,
          moveInfos: [{ ...analysis.moveInfos[0], move: 'pass' }],
          humanPolicy: policy,
        },
        trainingForRank('5k'),
      ).move,
    ).toBe('pass');
  });
  it('filters occupied human-policy suggestions and uses legal fallback', () => {
    const game = newGame(9);
    game.initialStones = [{ color: 'B', point: 'A9' }];
    const policy = Array(82).fill(0);
    policy[0] = 1;
    expect(
      selectMove(game, { ...analysis, humanPolicy: policy }, trainingForRank('5k'), () => 0).move,
    ).toBe('D4');
  });
  it('labels score perspective and calculates White move loss correctly', () => {
    const game = {
      ...newGame(9),
      initialPlayer: 'W' as const,
      moves: [{ color: 'W' as const, point: 'D4' }],
    };
    const after = { ...analysis, rootInfo: { ...analysis.rootInfo, scoreLead: 5 } };
    const evidence = buildEvidence(game, trainingForRank('5k'), after, analysis);
    expect(evidence.estimatedLossFromMover).toBe(3);
    expect(evidence.after?.perspective).toBe('B');
    expect(evidence.position.board).toContain('O');
    expect(evidence.position.groups[0].liberties).toHaveLength(4);
    expect(evidence.beforePosition?.groups).toHaveLength(0);
    expect(evidence.beforePosition?.toPlay).toBe('W');
    expect(
      buildEvidence(game, trainingForRank('5k'), null, null).estimatedLossFromMover,
    ).toBeNull();
  });
});
