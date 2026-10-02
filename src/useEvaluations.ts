import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, EngineStatus, Game, Training } from '../shared/types';
import { streamApi } from './api';
import {
  positionKey,
  positionKeys,
  recordEvaluation,
  type EvaluationHistory,
  type EvaluationPoint,
} from './evaluation-history';

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
  const [completing, setCompleting] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<number | null>(null);
  const [progress, setProgress] = useState<Analysis | null>(null);
  const [failure, setFailure] = useState<{ request: string; message: string }>();
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
        live.current.keys[value.turnNumber] !== key
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
    setCompleting(false);
    setFailure(undefined);
  }
  useEffect(() => {
    if (!engine?.ready || paused || error) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(
      () =>
        void (async () => {
          try {
            const turns = [
              turn,
              ...(completing
                ? keys.map((_, index) => index).filter((index) => index !== turn)
                : []),
            ];
            for (const index of turns) {
              controller.signal.throwIfAborted();
              const cached =
                store.current.source === source ? store.current.points[keys[index]] : undefined;
              // Revisiting a position also refreshes its candidates; never reuse another turn's PV.
              if (
                cached?.key === keys[index] &&
                cached.final &&
                (index !== turn ||
                  (currentResult?.key === keys[index] && currentResult.source === source))
              )
                continue;
              setPendingTurn(index);
              setProgress(null);
              const position = { ...game, moves: game.moves.slice(0, index) };
              await streamApi(
                'analyze',
                { game: position, training: { ...training, visits, searchLimit: 'visits' } },
                (event) => {
                  if (controller.signal.aborted) return;
                  if (event.type === 'analysis') {
                    setProgress(event.analysis);
                    record(position, event.analysis, event.final);
                  }
                  if (event.type === 'done' && event.analysis)
                    record(position, event.analysis, true);
                },
                controller.signal,
              );
            }
            if (!controller.signal.aborted) setCompleting(false);
          } catch (error) {
            if (!controller.signal.aborted) {
              setFailure({
                request: requestKey,
                message: (error as Error).message,
              });
              setCompleting(false);
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
    turn,
    source,
    revision,
    engine?.ready,
    paused,
    completing,
    retry,
    error,
    visits,
    training.rank,
  ]);

  return {
    points,
    mainlinePoints,
    analysis,
    record,
    reset,
    completing,
    pendingTurn,
    progress,
    error,
    complete() {
      setFailure(undefined);
      setCompleting(true);
      setRetry((value) => value + 1);
    },
    stop() {
      active.current?.abort();
      setCompleting(false);
    },
    retry() {
      setFailure(undefined);
      setRetry((value) => value + 1);
    },
  };
}
