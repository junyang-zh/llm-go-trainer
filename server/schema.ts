import { z } from 'zod';
import { RANKS } from '../shared/training';

const color = z.enum(['B', 'W']);
const move = z.object({ color, point: z.string().regex(/^(?:[A-HJ-T](?:[1-9]|1[0-9])|pass)$/) });
export const gameSchema = z.object({
  size: z.union([z.literal(9), z.literal(13), z.literal(19)]),
  komi: z.number().min(-100).max(100).multipleOf(0.5),
  rules: z.enum(['chinese', 'japanese']),
  initialPlayer: color,
  initialStones: z.array(move).max(361),
  moves: z.array(move).max(1500),
  metadata: z
    .record(z.string().max(20), z.string().max(1000))
    .refine((m) => Object.keys(m).length <= 30),
});
export const trainingSchema = z.object({
  rank: z.string().refine((r) => RANKS.includes(r)),
  mode: z.enum(['human', 'balanced', 'strong']),
  randomness: z.number().min(0).max(1),
  aggression: z.number().min(0).max(1),
  maxLoss: z.number().min(0).max(30),
  visits: z.number().int().min(50).max(10000),
});
export const analysisRequest = z.object({ game: gameSchema, training: trainingSchema });
export const coachRequest = analysisRequest.extend({
  provider: z.enum(['deepseek', 'codex', 'claude']).optional(),
  action: z.enum(['move', 'position', 'variation', 'chat']),
  question: z.string().max(4000).default(''),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
    .max(12)
    .default([]),
});
const candidate = z.object({
  move: z.string(),
  order: z.number().int(),
  visits: z.number().nonnegative(),
  winrate: z.number().min(0).max(1),
  scoreLead: z.number(),
  scoreStdev: z.number().optional(),
  prior: z.number(),
  pv: z.array(z.string()),
  humanPrior: z.number().optional(),
});
export const engineResponse = z.object({
  id: z.string(),
  turnNumber: z.number().int(),
  rootInfo: z.object({
    winrate: z.number().min(0).max(1),
    scoreLead: z.number(),
    visits: z.number(),
    currentPlayer: color.optional(),
  }),
  moveInfos: z.array(candidate),
  ownership: z.array(z.number().min(-1).max(1)).optional(),
  policy: z.array(z.number()).optional(),
  humanPolicy: z.array(z.number()).optional(),
});
