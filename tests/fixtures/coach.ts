import { newGame } from '../../shared/go';
import type { Analysis, Game } from '../../shared/types';

export const whiteAtari: Game = {
  ...newGame(9),
  initialPlayer: 'W',
  initialStones: [
    { color: 'W', point: 'D4' },
    { color: 'B', point: 'C4' },
    { color: 'B', point: 'D3' },
    { color: 'B', point: 'E4' },
  ],
};
export const koGame: Game = {
  ...newGame(9),
  initialStones: [
    ...['A2', 'B1', 'B3'].map((point) => ({ color: 'B' as const, point })),
    ...['B2', 'C1', 'C3', 'D2'].map((point) => ({ color: 'W' as const, point })),
  ],
};
export function coachAnalysis(game: Game, visits = 800): Analysis {
  return {
    id: 'coach-fixture',
    perspective: 'B',
    turnNumber: game.moves.length,
    rootInfo: { winrate: 0.3, scoreLead: -4.5, visits },
    moveInfos: [
      { move: 'F5', order: 0, prior: 0.5, visits, winrate: 0.3, scoreLead: -4.5, pv: ['F5', 'G5'] },
    ],
    ownership: Array(game.size ** 2).fill(-0.3),
  };
}
export function toolCall(id: string, name: string, args: unknown) {
  return { id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } };
}
export function sseResponse(deltas: unknown[], finish = 'stop') {
  const data = [
    ...deltas.map((delta) => ({ choices: [{ delta }] })),
    { choices: [{ delta: {}, finish_reason: finish }] },
  ];
  return new Response(
    data.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
  );
}

export function longThinkingStream(call: ReturnType<typeof toolCall>) {
  const fragment = '检查棋块。';
  const chunks = 10000;
  const frame = (delta: unknown, finish: string | null = null) =>
    'data: ' +
    JSON.stringify({
      id: 'chatcmpl-fixture-streaming-response',
      object: 'chat.completion.chunk',
      created: 1750000000,
      model: 'deepseek-v4-pro',
      system_fingerprint: 'fp-fixture-provider-metadata',
      choices: [{ index: 0, delta, logprobs: null, finish_reason: finish }],
    }) +
    '\n\n';
  const body =
    frame({ reasoning_content: fragment }).repeat(chunks) +
    frame({ tool_calls: [{ ...call, index: 0 }] }) +
    frame({}, 'tool_calls') +
    'data: [DONE]\n\n';
  return {
    response: new Response(body),
    reasoning: fragment.repeat(chunks),
    wireLength: body.length,
  };
}
