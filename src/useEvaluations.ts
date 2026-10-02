import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, EngineStatus, Game, Training } from '../shared/types';
import { streamApi } from './api';
import { t } from './i18n';
import {
  positionKey,
  positionKeys,
  recordEvaluation,
  type EvaluationHistory,
  type EvaluationPoint,
} from './evaluation-history';

export interface EvaluationCompletion {
  // Includes the opening position; the notification counts moves as positions - 1.
  positions: number;
  visitsPerSecond?: number;
}

function historyForKeys(cache: Record<string, EvaluationPoint>, keys: string[]): EvaluationHistory {
  return Object.fromEntries(keys.flatMap((key, turn) => (cache[key] ? [[turn, cache[key]]] : [])));
}

export function useEvaluations(
  game: Game,
  turn: number,
  training: Training,
  engine: EngineStatus | undefined,
  paused: boolean,
  mainlineGame: Game = game,
) {
  const keys = useMemo(() => positionKeys(game), [game]);
  const mainlineKeys = useMemo(() => positionKeys(mainlineGame), [mainlineGame]);
  const positionCount = useMemo(
    () => new Set([...keys, ...mainlineKeys]).size,
    [keys, mainlineKeys],
  );
  const lastSource = useRef('');
  const source = engine?.ready
    ? JSON.stringify([engine.mode, engine.name, engine.backend, engine.pid])
    : lastSource.current;
  if (engine?.ready) lastSource.current = source;
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const live = useRef({ keys, mainlineKeys, source });
  live.current = { keys, mainlineKeys, source };
  // Position keys let mainline and trial evaluations coexist at the same move number.
  const store = useRef({ source: '', points: {} as Record<string, EvaluationPoint> });
  const [snapshot, setSnapshot] = useState(store.current);
  const [currentResult, setCurrentResult] = useState<{
    key: string;
    source: string;
    analysis: Analysis;
  }>();
  const [completedQueue, setCompletedQueue] = useState<{
    keys: string[];
    mainlineKeys: string[];
    source: string;
    revision: number;
    summary: EvaluationCompletion;
  }>();
  const completion =
    completedQueue?.keys === keys &&
    completedQueue.mainlineKeys === mainlineKeys &&
    completedQueue.source === source &&
    completedQueue.revision === revision
      ? completedQueue.summary
      : undefined;
  const [pendingTurn, setPendingTurn] = useState<number | null>(null);
  const [progress, setProgress] = useState<Analysis | null>(null);
  const [failure, setFailure] = useState<{ request: string; message: string; attempts: number }>();
  const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const currentKey = keys[turn];
  const requestKey = source + currentKey + ':' + revision;
  const error = failure?.request === requestKey ? failure.message : '';
  const points = useMemo(
    () => (snapshot.source === source ? historyForKeys(snapshot.points, keys) : {}),
    [snapshot, source, keys],
  );
  const mainlinePoints = useMemo(
    () => (snapshot.source === source ? historyForKeys(snapshot.points, mainlineKeys) : {}),
    [snapshot, source, mainlineKeys],
  );
  const analysis =
    currentResult?.key === currentKey && currentResult.source === source
      ? currentResult.analysis
      : null;
  const visits = Math.min(training.visits, 100);

  const record = useCallback(
    (analyzedGame: Game, value: Analysis, final: boolean) => {
      if (revision !== generation.current || source !== live.current.source) return;
      const key = positionKey(analyzedGame, value.turnNumber);
      if (
        value.turnNumber > analyzedGame.moves.length ||
        (live.current.keys[value.turnNumber] !== key &&
          live.current.mainlineKeys[value.turnNumber] !== key)
      )
        return;
      const cache = store.current.source === source ? store.current.points : {};
      const previous = cache[key] ? { [value.turnNumber]: cache[key] } : {};
      const next = recordEvaluation(previous, key, value, final);
      // Keep only one full analysis (ownership/policy/PV); history stores compact root numbers.
      if (key === currentKey && next[value.turnNumber]?.key === key)
        setCurrentResult((previous) =>
          previous?.key === key &&
          previous.source === source &&
          previous.analysis.rootInfo.visits > value.rootInfo.visits
            ? previous
            : { key, source, analysis: value },
        );
      if (next === previous) return;
      // Retain the real game's entire curve while pruning abandoned trial branches.
      const retainedKeys = new Set([...live.current.mainlineKeys, ...live.current.keys]);
      store.current = {
        source,
        points: {
          ...Object.fromEntries(Object.entries(cache).filter(([key]) => retainedKeys.has(key))),
          [key]: next[value.turnNumber],
        },
      };
      setSnapshot(store.current);
    },
    [source, revision, currentKey],
  );

  function reset() {
    active.current?.abort();
    generation.current++;
    setRevision(generation.current);
    store.current = { source, points: {} };
    setSnapshot(store.current);
    setCurrentResult(undefined);
    setCompletedQueue(undefined);
    setFailure(undefined);
  }
  useEffect(() => {
    if (!engine?.ready || paused) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(
      () =>
        void (async () => {
          try {
            // Prioritize the viewed position, then fill both the trial and the entire
            // original record, including future mainline positions while in a trial.
            const jobs = new Map<string, { game: Game; turn: number }>();
            jobs.set(currentKey, { game, turn });
            for (const [record, recordKeys] of [
              [game, keys],
              [mainlineGame, mainlineKeys],
            ] as const) {
              recordKeys.forEach((key, index) => {
                if (!jobs.has(key)) jobs.set(key, { game: record, turn: index });
              });
            }
            let filledMissing = false;
            let timedVisits = 0;
            let elapsedMs = 0;
            for (const [key, { game: recordGame, turn: index }] of jobs) {
              controller.signal.throwIfAborted();
              const cached =
                store.current.source === source ? store.current.points[key] : undefined;
              // Revisiting a position also refreshes its candidates; never reuse another turn's PV.
              if (
                cached?.key === key &&
                cached.final &&
                (key !== currentKey ||
                  (currentResult?.key === key && currentResult.source === source))
              )
                continue;
              setPendingTurn(index);
              setProgress(null);
              const position = { ...recordGame, moves: recordGame.moves.slice(0, index) };
              let finalAnalysis: Analysis | undefined;
              await streamApi(
                'analyze',
                { game: position, training: { ...training, visits, searchLimit: 'visits' } },
                (event) => {
                  if (controller.signal.aborted) return;
                  if (event.type === 'analysis') {
                    setProgress(event.analysis);
                    record(position, event.analysis, event.final);
                    if (event.final) finalAnalysis = event.analysis;
                  }
                  if (event.type === 'done' && event.analysis) {
                    record(position, event.analysis, true);
                    finalAnalysis = event.analysis;
                  }
                },
                controller.signal,
              );
              controller.signal.throwIfAborted();
              if (store.current.source !== source || !store.current.points[key]?.final)
                throw new Error(t('connectionInterruptedAnalysisIncomplete'));
              if (!cached?.final) filledMissing = true;
              const timing = finalAnalysis?.searchStats;
              if (timing && Number.isFinite(timing.elapsedMs) && timing.elapsedMs > 0) {
                timedVisits += finalAnalysis!.rootInfo.visits;
                elapsedMs += timing.elapsedMs;
              }
            }
            if (!controller.signal.aborted) {
              setFailure(undefined);
              // A cached-position PV refresh is not another completed curve.
              if (filledMissing)
                setCompletedQueue({
                  keys,
                  mainlineKeys,
                  source,
                  revision,
                  summary: {
                    positions: jobs.size,
                    // Aggregate actual engine visits/timing once per completed request.
                    // Untimed results contribute no invented rate.
                    visitsPerSecond: elapsedMs > 0 ? (timedVisits * 1000) / elapsedMs : undefined,
                  },
                });
            }
          } catch (error) {
            if (!controller.signal.aborted) {
              setFailure((previous) => ({
                request: requestKey,
                message: (error as Error).message,
                attempts: previous?.request === requestKey ? previous.attempts + 1 : 1,
              }));
            }
          } finally {
            if (active.current === controller) {
              active.current = null;
              setPendingTurn(null);
            }
          }
        })(),
      180,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (active.current === controller) {
        active.current = null;
        setPendingTurn(null);
      }
    };
    // Results do not restart the queue; each job consults the current cache before searching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    keys,
    mainlineKeys,
    turn,
    source,
    revision,
    engine?.ready,
    paused,
    retry,
    visits,
    training.rank,
  ]);

  // Retry transient failures automatically without flooding an unavailable engine.
  // Foreground work and engine startup suspend the retry timer as well as the queue.
  useEffect(() => {
    if (!failure || failure.request !== requestKey || !engine?.ready || paused) return;
    const timer = setTimeout(
      () => setRetry((value) => value + 1),
      Math.min(30_000, 1000 * 2 ** Math.min(failure.attempts - 1, 5)),
    );
    return () => clearTimeout(timer);
  }, [failure, requestKey, engine?.ready, paused]);

  return {
    points,
    mainlinePoints,
    positionCount,
    completion,
    analysis,
    record,
    reset,
    pendingTurn,
    progress,
    error,
    retry() {
      setFailure(undefined);
      setRetry((value) => value + 1);
    },
  };
}
