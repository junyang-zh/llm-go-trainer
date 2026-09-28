import { legalPoints, neighbors, replay, toIndex, toPoint } from './go';
import type { Analysis, Game, Training } from './types';

export const RANKS = ['20k', '15k', '10k', '5k', '1k', '1d', '3d', '5d', '7d', '9d'];
export function trainingForRank(rank: string): Training {
  const strength = RANKS.indexOf(rank);
  return {
    rank,
    mode: 'human',
    randomness: Number(Math.max(0.1, 0.85 - strength * 0.08).toFixed(2)),
    aggression: 0.5,
    maxLoss: Number(Math.max(0.5, 10 - strength * 1.1).toFixed(1)),
    visits: 400,
  };
}
export function weightedChoice<T>(
  entries: { value: T; weight: number }[],
  random = Math.random,
): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!entries.length || !Number.isFinite(total) || total <= 0)
    throw new Error('没有可选的合法着法');
  let target = Math.min(1 - Number.EPSILON, Math.max(0, random())) * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target < 0) return entry.value;
  }
  return entries.at(-1)!.value;
}
export function selectMove(
  game: Game,
  analysis: Analysis,
  training: Training,
  random = Math.random,
) {
  const position = replay(game),
    legal = new Set([...legalPoints(game, position), 'pass']);
  const candidates = analysis.moveInfos
    .filter((c) => legal.has(c.move))
    .sort((a, b) => a.order - b.order);
  if (!candidates.length) throw new Error('引擎没有返回合法候选');
  const best = candidates[0];
  if (best.move === 'pass' || training.mode === 'strong')
    return { move: best.move, method: 'KataGo 最佳着法' };
  // HumanSL policy is rank-conditioned. Do not claim calibrated server Elo.
  if (training.mode === 'human' && analysis.humanPolicy?.length === game.size ** 2 + 1) {
    const entries = analysis.humanPolicy
      .slice(0, -1)
      .flatMap((weight, i) =>
        legal.has(toPoint(i, game.size)) && weight > 0
          ? [{ value: toPoint(i, game.size), weight }]
          : [],
      );
    if (entries.length)
      return {
        move: weightedChoice(entries, random),
        method: `HumanSL ${training.rank} 概率采样（棋风近似）`,
      };
  }
  const sign = position.toPlay === 'B' ? 1 : -1;
  const scoreBest = Math.max(
    ...candidates.filter((c) => c.move !== 'pass').map((c) => sign * c.scoreLead),
  );
  const eligible = candidates.filter(
    (c) => c.move !== 'pass' && scoreBest - sign * c.scoreLead <= training.maxLoss,
  );
  const entries = eligible.map((c) => {
    const i = toIndex(c.move, game.size);
    const contact = neighbors(i, game.size).filter(
      (n) => position.board[n] && position.board[n] !== position.toPlay,
    ).length;
    const loss = Math.max(0, scoreBest - sign * c.scoreLead);
    // Aggression is a transparent contact preference, not a claim to understand attack.
    const style = Math.exp((training.aggression - 0.5) * contact);
    const temperature = 0.15 + training.randomness * 4;
    return {
      value: c.move,
      weight:
        Math.max(1e-8, c.prior) ** (1 - training.randomness) *
        Math.exp(-loss / temperature) *
        style,
    };
  });
  return { move: weightedChoice(entries, random), method: '受限目损随机采样（等级未校准）' };
}
