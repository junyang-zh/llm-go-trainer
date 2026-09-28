import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureRuntime, runtimePlatform } from '../server/installer';
import { KataGo } from '../server/katago';
import { KataGoModels } from '../server/katago-models';
import { newGame } from '../shared/go';
import { trainingForRank } from '../shared/training';
import type { Game, ManagedBackend } from '../shared/types';

// Uses real engine output only. Results go to stdout, never into the repository.
// Usage: node --import tsx scripts/benchmark-backends.ts <cache-directory> [rounds]
const directory = resolve(process.argv[2] || '.local/katago');
const rounds = Number(process.argv[3] || 3);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10)
  throw new Error('rounds must be an integer from 1 to 10');
const models = new KataGoModels(directory);
await models.load();
const selection = models.artifacts();
const midgame: Game = {
  ...newGame(19),
  moves: ['D4', 'Q16', 'D16', 'Q4', 'R10', 'C10', 'K4', 'K16', 'F3', 'R6', 'C14', 'O17'].map(
    (point, i) => ({
      color: i % 2 ? 'W' : 'B',
      point,
    }),
  ),
};
const positions = [
  { name: 'opening', game: newGame(19) },
  { name: '12-move-position', game: midgame },
];
const runtimes = new Map<ManagedBackend, Awaited<ReturnType<typeof ensureRuntime>>>();
const signal = AbortSignal.timeout(30 * 60 * 1000);
for (const backend of ['opencl', 'cuda'] as const) {
  const started = performance.now();
  runtimes.set(
    backend,
    await ensureRuntime(
      resolve('.'),
      directory,
      signal,
      (p) => {
        if (p.phase === 'installing') console.error(p.progress?.label);
      },
      runtimePlatform(undefined, undefined, undefined, backend),
      selection,
    ),
  );
  console.log(
    JSON.stringify({ phase: 'prepare', backend, ms: Math.round(performance.now() - started) }),
  );
}
console.log(
  JSON.stringify({
    main: selection.main.name,
    human: selection.human?.name ?? null,
    rounds,
    board: 19,
    searchThreads: 6,
    batchSize: 8,
  }),
);
for (let round = 0; round < rounds; round++) {
  // Alternate order to reduce systematic thermal/background-load bias.
  for (const backend of (round % 2 ? ['cuda', 'opencl'] : ['opencl', 'cuda']) as ManagedBackend[]) {
    const engine = new KataGo(runtimes.get(backend)!.config);
    try {
      const started = performance.now();
      await engine.initialize(signal);
      console.log(
        JSON.stringify({
          phase: 'startup',
          backend,
          round,
          ms: Math.round(performance.now() - started),
        }),
      );
      for (const visits of [400, 4000]) {
        for (const { name, game } of positions) {
          const before = performance.now();
          const analysis = await engine.analyze(
            game,
            { ...trainingForRank('5k'), visits },
            { signal },
          );
          const ms = performance.now() - before;
          if (
            analysis.perspective !== 'B' ||
            !analysis.moveInfos.length ||
            analysis.ownership?.length !== 361
          )
            throw new Error('Invalid real engine analysis');
          console.log(
            JSON.stringify({
              phase: 'analysis',
              backend,
              round,
              position: name,
              requestedVisits: visits,
              visits: analysis.rootInfo.visits,
              ms: Math.round(ms),
              visitsPerSecond: Math.round((analysis.rootInfo.visits * 1000) / ms),
              humanPolicy: analysis.humanPolicy?.length ?? 0,
            }),
          );
        }
      }
    } finally {
      await engine.close();
    }
  }
}
await models.close();
