import { availabilityLabel, displayGameTitle as gameTitle } from './ui-labels';
import {
  t,
  localizeDiagnostic,
  useLanguage,
  formatDate,
  locales,
  translate,
  type MessageKey,
} from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RecordLibrary } from './RecordLibrary';
import { useLibrary } from './useLibrary';
import { type BoardContext } from '../shared/library';
import { extendTrial, trialStoneNumbers, trialVariation, type TrialBranch } from '../shared/trial';
import { MoveTimeline } from './MoveTimeline';
import { EngineSettings, engineLabel } from './EngineSettings';
import { LlmSettings } from './LlmSettings';
import { GeneralSettings } from './GeneralSettings';
import { providerNames } from '../shared/llm';
import { Dialog } from './Dialog';
import { type AnalysisMessage, updateMessage, finishMessage } from './messages';
import { AgentActivity } from './AgentActivity';
import { Board } from './Board';
import { MarkdownText } from './MarkdownText';
import { CoachOverlay } from './CoachOverlay';
import type { CoachLink } from '../shared/coach-links';
import { EvaluationPanel } from './EvaluationPanel';
import { useEvaluations } from './useEvaluations';
import { SearchLimitSettings } from './SearchLimitSettings';
import { restoreSearchSettings, searchSettingsKey, searchStatsLabel } from './search-stats';
import { api, streamApi } from './api';
import { areaScore, groupAt, newGame, play, replay, toIndex } from '../shared/go';
import { decodeSgf, exportSgf, importSgf } from '../shared/sgf';
import { RANKS, trainingForRank } from '../shared/training';
import type {
  Analysis,
  Candidate,
  CoachAction,
  Color,
  Game,
  Move,
  Status,
  Training,
} from '../shared/types';

const coachActionKeys = {
  move: 'explainThisMove',
  position: 'currentPosition',
  variation: 'analyzeContinuations',
  chat: 'ask',
} as const;
const storageKey = 'go-trainer-game-v1';
function restoredGame(): Game {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return importSgf(raw).game;
  } catch {
    /* invalid local record */
  }
  return newGame();
}
function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  useLanguage();
  const labels: Record<CoachAction, string> = {
    move: t(coachActionKeys.move),
    position: t(coachActionKeys.position),
    variation: t(coachActionKeys.variation),
    chat: t(coachActionKeys.chat),
  };
  const [initialGame] = useState(restoredGame);
  const library = useLibrary(initialGame);
  const displayedGameId = useRef(library.gameId);
  displayedGameId.current = library.gameId;
  const { game, setGame } = library;
  const [trial, setTrial] = useState<TrialBranch | null>(null);
  const trialMoves = useMemo(() => trial?.moves.slice(0, trial.cursor) ?? [], [trial]);
  const [showGames, setShowGames] = useState(false);
  const [importedTreeId, setImportedTreeId] = useState<string>();
  const [showConversations, setShowConversations] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const [coachSelection, setCoachSelection] = useState<{
    message: string;
    group: string;
    position: string;
  }>();
  const pendingCoach = useRef<{ turn: number; trial: TrialBranch | null } | null>(null);
  const [turn, setTurn] = useState(game.moves.length);
  const [autoPlay, setAutoPlay] = useState(false);
  const [aiColor, setAiColor] = useState<Color>('W');
  const [training, setTraining] = useState<Training>(() => ({
    ...trainingForRank('5k'),
    ...restoreSearchSettings(),
  }));
  const [searchProgress, setSearchProgress] = useState<Analysis | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(
        searchSettingsKey,
        JSON.stringify({
          visits: training.visits,
          searchLimit: training.searchLimit,
          maxTime: training.maxTime,
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [training.visits, training.searchLimit, training.maxTime]);
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState<{
    key: MessageKey;
    values?: Record<string, string | number>;
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<
    | { kind: 'move'; method: string; analysis: Analysis }
    | { kind: 'import'; name: string; moves: number; warnings: string[] }
    | { kind: 'fork' }
    | null
  >(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [dead, setDead] = useState<number[]>([]);
  const { messages, history, draft: question, evidence } = library.activeConversation;
  const setMessages = (value: React.SetStateAction<AnalysisMessage[]>) =>
    library.update('messages', value);
  const setHistory = (value: React.SetStateAction<typeof history>) =>
    library.update('history', value);
  const setQuestion = (value: string) => library.update('draft', value);
  const setEvidence = (value: unknown) => library.update('evidence', value);
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'training' | 'models' | 'connections'>(
    'general',
  );
  const [setup, setSetup] = useState(false);
  const [size, setSize] = useState(19),
    [handicap, setHandicap] = useState(0),
    [komi, setKomi] = useState(7.5);
  const [rules, setRules] = useState<Game['rules']>('chinese');
  const [botFailed, setBotFailed] = useState(false);
  const lock = useRef(false),
    statusRequest = useRef(0),
    fileInput = useRef<HTMLInputElement>(null),
    chatLog = useRef<HTMLDivElement>(null),
    questionInput = useRef<HTMLTextAreaElement>(null),
    followChat = useRef(true),
    activeStream = useRef<AbortController | null>(null);
  const current = useMemo(
    () => ({ ...game, moves: [...game.moves.slice(0, turn), ...trialMoves] }),
    [game, turn, trialMoves],
  );
  const trialStones = useMemo(
    () => trialStoneNumbers(game, turn, trialMoves),
    [game, turn, trialMoves],
  );
  const boardContext: BoardContext = {
    gameId: library.gameId,
    gameTitle: gameTitle(game),
    turn,
    trialMoves,
  };
  const contextKey = (context: BoardContext) =>
    JSON.stringify([context.gameId, context.turn, context.trialMoves]);
  const boardKey = contextKey(boardContext);
  const activeCoach = coachSelection?.position === boardKey ? coachSelection : undefined;
  useEffect(() => {
    setTurn(pendingCoach.current?.turn ?? game.moves.length);
    setTrial(pendingCoach.current?.trial ?? null);
    pendingCoach.current = null;
  }, [library.gameId]);
  useEffect(() => {
    if (library.ready) setTurn(game.moves.length);
  }, [library.ready]);
  const position = useMemo(() => replay(current), [current]);
  const handicapBonus =
    game.rules === 'chinese' &&
    game.initialStones.length >= 2 &&
    game.initialStones.every((s) => s.color === 'B')
      ? game.initialStones.length
      : 0;
  const score = useMemo(
    () => areaScore(position, game.size, game.komi + handicapBonus, dead),
    [position, game.size, game.komi, handicapBonus, dead],
  );
  const analysisGame = useMemo(
    () => (trial ? { ...game, moves: [...game.moves.slice(0, turn), ...trial.moves] } : game),
    [game, turn, trial],
  );
  const evaluations = useEvaluations(
    analysisGame,
    current.moves.length,
    training,
    status?.engine,
    !library.ready ||
      !!busy ||
      setup ||
      scoring ||
      (autoPlay && position.toPlay === aiColor && position.passes < 2),
    game,
  );
  const analysis = evaluations.analysis;
  const candidates =
    analysis?.moveInfos
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, 3) ?? [];

  async function refreshStatus() {
    const request = ++statusRequest.current;
    try {
      const value = await api<Status>('status');
      if (request === statusRequest.current) setStatus(value);
    } catch (e) {
      if (request === statusRequest.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 1500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, exportSgf(game));
    } catch {
      /* browser storage unavailable */
    }
  }, [game]);
  useEffect(() => {
    const log = chatLog.current;
    if (log && followChat.current) log.scrollTop = log.scrollHeight;
  }, [messages, chatCollapsed]);
  useEffect(() => () => activeStream.current?.abort(), []);
  function invalidate() {
    setNotice(null);
    setTrial(null);
    setDead([]);
    setScoring(false);
    setError('');
    setBotFailed(false);
  }
  function navigate(value: number) {
    if (lock.current) return;
    if (trial && value > turn + trial.moves.length) return;
    if (trial) setAutoPlay(false);
    setNotice(null);
    setDead([]);
    setScoring(false);
    setError('');
    setBotFailed(false);
    if (trial && value >= turn) {
      setTrial({ ...trial, cursor: value - turn });
    } else {
      setTrial(null);
      setTurn(Math.max(0, Math.min(game.moves.length, value)));
    }
  }
  function changeGame(next: Game, resetEvaluations = false) {
    if (resetEvaluations) evaluations.reset();
    invalidate();
    setGame(next);
    setTurn(next.moves.length);
  }
  async function run(label: NonNullable<typeof busy>, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setSearchProgress(null);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(null);
      void refreshStatus();
    }
  }
  async function botMove() {
    await run(
      { key: 'engineSearching', values: { v0: status?.engine.name || 'KataGo' } },
      async () => {
        try {
          let result: { move: string; method: string; analysis: Analysis } | undefined;
          const controller = new AbortController();
          activeStream.current = controller;
          try {
            await streamApi(
              'bot-move',
              { game: current, training },
              (event) => {
                if (event.type === 'analysis') setSearchProgress(event.analysis);
                if (event.type === 'done' && event.analysis && event.move && event.method) {
                  result = { move: event.move, method: event.method, analysis: event.analysis };
                  setSearchProgress(event.analysis);
                }
              },
              controller.signal,
            );
          } finally {
            if (activeStream.current === controller) activeStream.current = null;
          }
          if (!result) throw new Error(t('engineNoMove'));
          evaluations.record(current, result.analysis, true);
          appendMove({ color: position.toPlay, point: result.move });
          setNotice({ kind: 'move', method: result.method, analysis: result.analysis });
        } catch (e) {
          setBotFailed(true);
          throw e;
        }
      },
    );
  }
  useEffect(() => {
    if (
      library.ready &&
      autoPlay &&
      !scoring &&
      !setup &&
      !showGames &&
      !showConversations &&
      position.toPlay === aiColor &&
      position.passes < 2 &&
      !busy &&
      !botFailed &&
      status?.engine.ready
    )
      void botMove();
    // A turn transition, not a background status refresh, schedules the opponent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoPlay,
    turn,
    trialMoves,
    game,
    aiColor,
    showGames,
    showConversations,
    busy,
    botFailed,
    scoring,
    setup,
    status?.engine.ready,
    library.ready,
  ]);
  function appendMove(move: Move) {
    play(position, move, game.size, game.rules);
    if (library.review || turn < game.moves.length || trial) {
      setTrial((previous) => extendTrial(previous, [move]));
      setError('');
      setDead([]);
    } else changeGame({ ...current, moves: [...current.moves, move] });
  }
  function forkGame() {
    const branch: Game = {
      ...current,
      metadata: {
        ...current.metadata,
        GN: t('branchAtMove', { v0: gameTitle(game).slice(0, 150), v1: turn }),
      },
    };
    delete branch.metadata.RE;
    invalidate();
    evaluations.reset();
    library.newGame(
      branch,
      library.games.find((item) => item.id === library.gameId),
      turn,
    );
    setTurn(branch.moves.length);
    setNotice({ kind: 'fork' });
  }
  function playCandidate(candidate: Candidate) {
    if (lock.current || scoring) return;
    try {
      if (candidate.pv.length && candidate.pv[0] !== candidate.move)
        throw new Error(t('candidateMismatch'));
      const moves = trialVariation(current, candidate.pv.length ? candidate.pv : [candidate.move]);
      setTrial((previous) => extendTrial(previous, moves));
      setAutoPlay(false);
      setError('');
      setNotice(null);
      setDead([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function selectCoach(
    message: AnalysisMessage,
    link: Extract<CoachLink, { kind: 'selector' }>,
  ) {
    if (lock.current) return;
    if (activeCoach?.message === message.id && activeCoach.group === link.group) {
      setCoachSelection(undefined);
      return;
    }
    try {
      const linkContext = message.resultContext ?? message.context;
      const branch =
        link.branch && message.trials && Object.hasOwn(message.trials, link.branch)
          ? message.trials[link.branch]
          : undefined;
      if (link.branch && !branch) throw new Error(t('trialMissing'));
      const gameId = branch?.gameId ?? linkContext?.gameId;
      const saved = await library.findGame(gameId ?? '');
      if (!saved) throw new Error(t('coachGameMissing'));
      const source = saved.id === library.gameId ? game : saved.game;
      const baseTurn = branch?.baseTurn ?? link.turn ?? linkContext!.turn;
      if (baseTurn < 0 || baseTurn > source.moves.length) throw new Error(t('invalidStartTurn'));
      const base = { ...source, moves: source.moves.slice(0, baseTurn) };
      let moves: Move[];
      let cursor: number;
      if (branch) {
        const expected = { ...branch.base, moves: branch.base.moves.slice(0, baseTurn) };
        // A display-name change does not invalidate an existing coach variation.
        expected.metadata = { ...expected.metadata, GN: base.metadata.GN };
        if (JSON.stringify(expected) !== JSON.stringify(base))
          throw new Error(t('trialGameChanged'));
        const prefix = branch.base.moves.slice(baseTurn);
        moves = [...prefix, ...branch.moves];
        const ply = link.ply ?? 0;
        if (ply > branch.moves.length) throw new Error(t('invalidTrialTurn'));
        cursor = prefix.length + ply;
      } else {
        moves = link.turn === undefined ? linkContext!.trialMoves : [];
        cursor = moves.length;
      }
      replay({ ...base, moves: [...base.moves, ...moves] });
      const nextTrial = branch || moves.length ? { moves, cursor } : null;
      setAutoPlay(false);
      setScoring(false);
      setDead([]);
      setError('');
      setNotice(null);
      // Apply board and cursor in the same render when crossing games; an old trial
      // can be illegal on the newly selected board before the game-change effect.
      setTurn(baseTurn);
      setTrial(nextTrial);
      if (saved.id !== library.gameId) {
        pendingCoach.current = { turn: baseTurn, trial: nextTrial };
        library.selectGame(saved);
      }
      setCoachSelection({
        message: message.id,
        group: link.group,
        position: contextKey({
          gameId: saved.id,
          gameTitle: saved.title,
          turn: baseTurn,
          trialMoves: moves.slice(0, cursor),
        }),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function place(point: string) {
    if (lock.current) return;
    if (scoring) {
      const index = toIndex(point, game.size);
      if (!position.board[index]) return;
      const group = [...groupAt(position.board, index, game.size).stones];
      setDead((previous) =>
        previous.includes(index)
          ? previous.filter((i) => !group.includes(i))
          : [...previous, ...group],
      );
      return;
    }
    if (position.passes >= 2 && !library.review) {
      setError(t('bothPlayersHavePassed'));
      return;
    }
    if (autoPlay && position.toPlay === aiColor) {
      setError(t('aiTurn'));
      return;
    }
    try {
      appendMove({ color: position.toPlay, point });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function requestAnalysis(
    title: string,
    endpoint: 'analyze' | 'coach',
    payload: unknown,
    resumed?: AnalysisMessage,
  ) {
    await run({ key: 'analyzing' }, async () => {
      const controller = new AbortController();
      activeStream.current = controller;
      followChat.current = true;
      const id = resumed?.id ?? crypto.randomUUID();
      const requestContext = resumed?.context ?? boardContext;
      if (resumed)
        setMessages((previous) =>
          previous.map((message) =>
            message.id === id
              ? { ...message, state: 'running', continuationId: undefined, status: t('resuming') }
              : message,
          ),
        );
      else
        setMessages((previous) => [
          ...previous,
          {
            id,
            question: title,
            text: '',
            status: t('connecting'),
            state: 'running',
            evaluations: {},
            context: structuredClone(boardContext),
            createdAt: new Date().toISOString(),
          },
        ]);
      if (endpoint === 'coach' && !resumed) setQuestion('');
      try {
        await library.flush();
        let boardChanged = !!resumed?.resultContext;
        const appliedChanges = new Set<string>();
        await streamApi(
          endpoint,
          payload,
          (event) => {
            if (controller.signal.aborted) return;
            if (
              event.type === 'tool' &&
              event.activity.state === 'done' &&
              event.activity.gameChange &&
              !appliedChanges.has(event.activity.id)
            ) {
              appliedChanges.add(event.activity.id);
              const change = event.activity.gameChange;
              if (change.context) {
                const { turn, trialMoves } = change.context;
                const nextTrial = trialMoves.length
                  ? { moves: trialMoves, cursor: trialMoves.length }
                  : null;
                pendingCoach.current =
                  change.record.id !== displayedGameId.current ? { turn, trial: nextTrial } : null;
                setTurn(turn);
                setTrial(nextTrial);
                setAutoPlay(false);
                setScoring(false);
                setDead([]);
                setNotice(null);
                setCoachSelection(undefined);
                setSearchProgress(null);
                evaluations.reset();
                boardChanged = true;
              }
              library.applyGameChange(change);
            }
            setMessages((previous) =>
              previous.map((message) =>
                message.id === id ? updateMessage(message, event) : message,
              ),
            );
            if (event.type === 'analysis' && !boardChanged) {
              setSearchProgress(event.analysis);
              if (!resumed) evaluations.record(current, event.analysis, event.final);
            }
            if (event.type === 'done') {
              if (event.analysis && !boardChanged) {
                if (!resumed) evaluations.record(current, event.analysis, true);
                setSearchProgress(event.analysis);
              }
              if (event.evidence) setEvidence(event.evidence);
              if (event.answer)
                setHistory((previous) => [
                  ...previous,
                  {
                    role: 'user',
                    content: `${title}\n[棋局上下文 ${JSON.stringify(requestContext)}]`,
                  },
                  { role: 'assistant', content: event.answer! },
                ]);
            }
          },
          controller.signal,
        );
      } catch (error) {
        const stopped = controller.signal.aborted;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === id
              ? finishMessage(
                  message,
                  stopped ? 'stopped' : 'error',
                  stopped ? t('stopped') : localizeDiagnostic((error as Error).message),
                )
              : message,
          ),
        );
      } finally {
        activeStream.current = null;
      }
    });
  }
  async function ask() {
    if (!llmReady) {
      setSettingsTab('connections');
      setSettings(true);
      return;
    }
    const text = question.trim();
    if (!text) return;
    const action: CoachAction =
      (['move', 'position', 'variation'] as const).find((action) =>
        locales.some((locale) => translate(locale, coachActionKeys[action]) === text),
      ) ?? 'chat';
    await requestAnalysis(text, 'coach', {
      game: current,
      context: boardContext,
      training,
      action,
      question: action === 'chat' ? text : '',
      history: history
        .slice(-10)
        .map((message) => ({ ...message, content: message.content.slice(0, 8000) })),
    });
  }
  async function importFile(file: File) {
    try {
      const record = await library.importSgf(file.name, decodeSgf(await file.arrayBuffer()));
      setAutoPlay(false);
      setImportedTreeId(record.id);
      setShowGames(true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const locked = !!busy || !library.ready;
  const selectedLlm = status?.llm?.selected;
  const llmReady = !!selectedLlm && !!status?.llm?.providers[selectedLlm].available;
  const llmLabel = selectedLlm
    ? `${providerNames[selectedLlm]} · ${availabilityLabel(status?.llm?.providers[selectedLlm])}`
    : status?.llm
      ? t('llmOffline')
      : t('llmChecking');
  const engineStatus = engineLabel(status?.engine);
  const engineProgress =
    status?.engine.phase && !['ready', 'stopped'].includes(status.engine.phase) ? engineStatus : '';
  const workspaceError = localizeDiagnostic(
    error ||
      library.error ||
      (status?.engine.phase === 'error' ? status.engine.error || engineProgress : ''),
  );
  const liveSearch = searchStatsLabel(searchProgress);
  const backgroundSearch =
    evaluations.pendingTurn !== null
      ? [
          t('analyzingMove', { v0: evaluations.pendingTurn }),
          searchStatsLabel(evaluations.progress),
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const noticeLabel =
    notice?.kind === 'move'
      ? [localizeDiagnostic(notice.method), searchStatsLabel(notice.analysis)]
          .filter(Boolean)
          .join(' · ')
      : notice?.kind === 'import'
        ? [
            t('importedMoves', { v0: notice.name, v1: notice.moves }),
            ...notice.warnings.map((warning) => localizeDiagnostic(warning)),
          ].join(' ')
        : notice?.kind === 'fork'
          ? t('forkSaved')
          : '';
  const workspaceStatus =
    workspaceError ||
    (busy ? [t(busy.key, busy.values), liveSearch].filter(Boolean).join(' · ') : '') ||
    engineProgress ||
    noticeLabel ||
    backgroundSearch;
  const timelineTurn = current.moves.length;
  const timelineTotal = Math.max(game.moves.length, turn + (trial?.moves.length ?? 0));
  const timelineLimit = trial ? turn + trial.moves.length : game.moves.length;
  return (
    <main ref={workspace} className={`workspace${chatCollapsed ? ' chat-collapsed' : ''}`}>
      <CoachOverlay
        root={workspace}
        enabled={!chatCollapsed && !settings && !setup && !showGames && !showConversations}
        revision={`${boardKey}:${activeCoach?.message}:${activeCoach?.group}:${library.conversationId}`}
      />
      <section className="board-panel" aria-label={t('board')}>
        <div className="board-toolbar">
          <button
            className="settings-trigger"
            aria-label={t('settings')}
            title={t('settings')}
            aria-haspopup="dialog"
            aria-expanded={settings}
            onClick={() => setSettings(true)}
          >
            <img className="board-logo" src="/logo.svg" alt="" aria-hidden="true" />
          </button>
          <label className="auto-play-toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={t('aiAutoPlay')}
              checked={autoPlay}
              disabled={locked}
              onChange={(e) => {
                setAutoPlay(e.target.checked);
                setBotFailed(false);
              }}
            />
            {t('aiAutoPlay')}
          </label>
          <select
            className="ai-color-select"
            aria-label={t('aiColor')}
            value={aiColor}
            disabled={locked}
            onChange={(e) => {
              setAiColor(e.target.value as Color);
              setBotFailed(false);
            }}
          >
            <option value="W">{t('aiPlaysWhite')}</option>
            <option value="B">{t('aiPlaysBlack')}</option>
          </select>
          <button disabled={locked} onClick={() => setSetup(true)}>
            {t('newGame')}
          </button>
          <button disabled={locked} onClick={() => setShowGames(true)}>
            {t('gameHistory')}
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".sgf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
        <div className="players">
          <span title={game.metadata.PB || t('blackPlayer')}>
            <i className="stone-dot black" />
            {game.metadata.PB || t('blackPlayer')}
            <small>{t('captures', { v0: position.captures.B })}</small>
          </span>
          <span className="turn-badge">
            {position.passes >= 2
              ? t('bothPassed')
              : t('toPlay', { v0: position.toPlay === 'B' ? t('black') : t('white') })}
          </span>
          <span title={game.metadata.PW || t('whitePlayer')}>
            <small>{t('captures', { v0: position.captures.W })}</small>
            {game.metadata.PW || t('whitePlayer')}
            <i className="stone-dot white" />
          </span>
        </div>
        <div className="board-stage">
          <div className="board-frame">
            <Board
              size={game.size}
              position={position}
              lastPoint={current.moves.at(-1)?.point}
              ownership={
                scoring ? score.ownership : showOwnership ? analysis?.ownership : undefined
              }
              candidates={scoring || !showCandidates ? [] : candidates}
              trialStones={trialStones}
              dead={dead}
              disabled={locked}
              scoring={scoring}
              onPlay={(point) => {
                const candidate =
                  showCandidates && !scoring
                    ? candidates.find((candidate) => candidate.move === point)
                    : undefined;
                if (candidate) playCandidate(candidate);
                else place(point);
              }}
            />
          </div>
        </div>
        <div className="board-bottom">
          <div className="move-controls">
            <button
              aria-label={t('previousMove')}
              disabled={locked || !timelineTurn}
              onClick={() => navigate(timelineTurn - 1)}
            >
              ←
            </button>
            <span className="move-count">
              <b>{timelineTurn}</b>
              {t('moveTotal', { v0: timelineTotal })}
            </span>
            <button
              aria-label={t('nextMove')}
              disabled={locked || timelineTurn >= timelineLimit}
              onClick={() => navigate(timelineTurn + 1)}
            >
              →
            </button>
            <MoveTimeline
              turn={timelineTurn}
              historyTurn={turn}
              historyLength={game.moves.length}
              trialLength={trial?.moves.length}
              disabled={locked}
              navigate={navigate}
            />
          </div>
          <div className="board-tools">
            <button disabled={locked || scoring} onClick={() => place('pass')}>
              {t('pass')}
            </button>
            <div className="board-tools-right">
              <button
                className={showCandidates ? 'selected' : ''}
                aria-pressed={showCandidates}
                onClick={() => setShowCandidates((value) => !value)}
              >
                {t('candidates')}
              </button>
              <button
                className={showOwnership ? 'selected' : ''}
                disabled={locked || scoring || (!analysis && !status?.engine.ready)}
                aria-pressed={showOwnership}
                onClick={() => setShowOwnership((value) => !value)}
              >
                {t('ownership')}
              </button>
              <button
                className={scoring ? 'selected' : ''}
                disabled={locked || game.rules === 'japanese'}
                title={
                  game.rules === 'japanese'
                    ? t('japaneseFinalScoringIsNotImplemented')
                    : t('chineseAreaScoring')
                }
                onClick={() => {
                  setScoring(!scoring);
                  setDead([]);
                }}
              >
                {t('score')}
              </button>
            </div>
          </div>
          <div className="board-secondary">
            <div className="board-meta">
              {t('boardSummary', {
                v0: game.size,
                v1: game.rules === 'chinese' ? t('chinese') : t('japanese'),
                v2: game.komi,
              })}
            </div>
            <div
              className="trial-bar"
              aria-hidden={!library.review && turn === game.moves.length && !trial}
            >
              <span>
                {trial
                  ? t('trialProgress', { v0: turn, v1: trial.cursor, v2: trial.moves.length })
                  : t('reviewing')}
              </span>
              <button
                disabled={locked || !trial}
                onClick={() => {
                  setTrial(null);
                  setDead([]);
                  setScoring(false);
                }}
              >
                {t('clearTrial')}
              </button>
              <button disabled={locked} onClick={forkGame}>
                {trial ? t('saveTrialAsNewGame') : t('newGameFromHere')}
              </button>
            </div>
          </div>
          {scoring && (
            <div className="score-line">
              {t('areaBlackWhite', {
                v0: score.black,
                v1: score.white,
                v2: game.komi + handicapBonus,
                v3: score.lead >= 0 ? t('black') : t('white'),
                v4: Math.abs(score.lead).toFixed(1),
              })}
              <span>{t('deadStonesMarked', { v0: dead.length })}</span>
            </div>
          )}
        </div>
      </section>
      <div className="right-column">
        <button
          type="button"
          className="chat-collapse-toggle"
          aria-label={chatCollapsed ? t('expandChatPanel') : t('collapseChatPanel')}
          title={chatCollapsed ? t('expandChatPanel') : t('collapseChatPanel')}
          aria-expanded={!chatCollapsed}
          aria-controls="chat-panel"
          onClick={() => setChatCollapsed((collapsed) => !collapsed)}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d={chatCollapsed ? 'M12 5 7 10l5 5' : 'M8 5l5 5-5 5'} />
          </svg>
        </button>
        <div
          className={`workspace-status ${workspaceError ? 'error' : ''}`}
          role={workspaceError ? 'alert' : 'status'}
          aria-hidden={!workspaceStatus}
          title={workspaceStatus}
        >
          <span>{workspaceStatus}</span>
          {library.error && <button onClick={library.retry}>{t('retry')}</button>}
          {botFailed && (
            <button
              onClick={() => {
                setBotFailed(false);
                setError('');
              }}
            >
              {t('retry')}
            </button>
          )}
          {!busy && (error || (!library.error && !engineProgress && notice)) && (
            <button
              aria-label={t('dismissNotification')}
              onClick={() => {
                setError('');
                setNotice(null);
              }}
            >
              ×
            </button>
          )}
        </div>
        <aside
          id="chat-panel"
          className="chat-panel"
          aria-label={t('analysisChat')}
          hidden={chatCollapsed}
        >
          <div className="chat-toolbar">
            <span
              className={`engine-status llm-status ${llmReady ? 'online' : ''}`}
              aria-label={llmLabel}
              title={llmLabel}
            >
              <i />
              {llmLabel}
            </span>
            <span
              className={`engine-status ${status?.engine.ready ? 'online' : ''}`}
              title={engineStatus}
              aria-label={engineStatus}
            >
              <i />
              {status?.engine.name || 'KataGo'}
            </span>
          </div>
          <EvaluationPanel
            history={evaluations.points}
            mainlineHistory={evaluations.mainlinePoints}
            mainlineTotal={game.moves.length}
            trialTurn={trial ? turn : undefined}
            turn={current.moves.length}
            total={analysisGame.moves.length}
            disabled={locked || scoring || !!trial}
            ready={!!status?.engine.ready}
            completing={evaluations.completing}
            pendingTurn={evaluations.pendingTurn}
            error={localizeDiagnostic(evaluations.error)}
            navigate={navigate}
            complete={evaluations.complete}
            stop={evaluations.stop}
            retry={evaluations.retry}
            searchStats={searchStatsLabel(evaluations.progress ?? analysis)}
          >
            {!scoring && candidates.length > 0 ? (
              <div className="candidates">
                {candidates.map((candidate, i) => (
                  <button
                    key={candidate.move}
                    disabled={locked || scoring}
                    onClick={() => playCandidate(candidate)}
                    title={candidate.pv.join(' → ')}
                  >
                    <b>{String.fromCharCode(65 + i)}</b> {candidate.move}{' '}
                    <small>
                      {candidate.scoreLead > 0 ? '+' : ''}
                      {candidate.scoreLead.toFixed(1)}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <span className="evaluation-empty">{t('noCandidates')}</span>
            )}
          </EvaluationPanel>
          <div className="conversation-toolbar">
            <span
              title={
                library.activeConversation.messages.length
                  ? library.activeConversation.title
                  : t('newChat')
              }
            >
              {library.activeConversation.messages.length
                ? library.activeConversation.title
                : t('newChat')}
            </span>
            <button disabled={locked} onClick={() => library.newConversation()}>
              {t('newChat')}
            </button>
            <button disabled={locked} onClick={() => setShowConversations(true)}>
              {t('chatHistory')}
            </button>
          </div>
          <div
            className="chat-log"
            ref={chatLog}
            role="log"
            aria-label={t('analysisResults')}
            aria-live="polite"
            onScroll={(e) => {
              const log = e.currentTarget;
              followChat.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
            }}
          >
            {messages.map((message) => (
              <article className="chat-message" key={message.id}>
                {message.context && (
                  <div className="message-context">
                    {t('messageContext', {
                      v0: message.context.gameTitle,
                      v1: message.context.turn,
                      v2:
                        message.context.trialMoves.length > 0
                          ? t('trialMoves', { v0: message.context.trialMoves.length })
                          : '',
                    })}
                  </div>
                )}
                <div className="chat-question">
                  <MarkdownText>{message.question}</MarkdownText>
                </div>
                {(['after', 'before'] as const).map((phase) => {
                  const evaluation = message.evaluations[phase];
                  if (!evaluation) return null;
                  const { analysis: value, final } = evaluation;
                  const candidate = value.moveInfos.find((move) => move.order === 0);
                  return (
                    <div className="search-result" key={phase}>
                      <span>
                        {phase === 'before' ? t('beforeMove') : t('currentBoardPosition')} ·{' '}
                        {final
                          ? t('searchComplete')
                          : message.state === 'running'
                            ? t('searching')
                            : t('searchIncomplete')}{' '}
                        · {searchStatsLabel(value)}
                      </span>
                      <div>
                        {t('analysisEvaluation', {
                          v0: (value.rootInfo.winrate * 100).toFixed(1),
                          v1: value.rootInfo.scoreLead > 0 ? '+' : '',
                          v2: value.rootInfo.scoreLead.toFixed(1),
                        })}
                      </div>
                      {candidate && (
                        <div className="search-pv">{candidate.pv.slice(0, 8).join(' → ')}</div>
                      )}
                    </div>
                  );
                })}
                <AgentActivity tools={message.tools ?? []} />
                {message.text && (
                  <MarkdownText
                    coach={{
                      size: game.size,
                      enabled:
                        !chatCollapsed &&
                        ((!!(message.resultContext ?? message.context) &&
                          contextKey((message.resultContext ?? message.context)!) === boardKey) ||
                          activeCoach?.message === message.id),
                      activeGroup:
                        activeCoach?.message === message.id ? activeCoach.group : undefined,
                      disabled: locked || chatCollapsed,
                      select: (link) => selectCoach(message, link),
                    }}
                  >
                    {message.text}
                  </MarkdownText>
                )}
                {message.state !== 'done' && (
                  <div
                    className={`message-status ${message.state}`}
                    role={message.state === 'error' ? 'alert' : undefined}
                  >
                    {message.state === 'running' && <i />}
                    {localizeDiagnostic(message.status || '')}
                    {message.state === 'paused' && message.continuationId && (
                      <button
                        type="button"
                        className="continue-coach"
                        disabled={locked}
                        title={t('keepResultsAndAddAnotherAllowanceToContinue')}
                        onClick={() =>
                          void requestAnalysis(
                            message.question,
                            'coach',
                            { continuationId: message.continuationId },
                            message,
                          )
                        }
                      >
                        {t('continue')}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <div className="quick-actions" aria-label={t('quickPrompts')}>
              {(['move', 'position', 'variation'] as const).map((action) => (
                <button
                  type="button"
                  key={action}
                  disabled={locked || (action === 'move' && !current.moves.length)}
                  onClick={() => {
                    setQuestion(labels[action]);
                    questionInput.current?.focus();
                  }}
                >
                  {labels[action]}
                </button>
              ))}
            </div>
            <textarea
              ref={questionInput}
              aria-label={t('question')}
              maxLength={4000}
              placeholder={t('enterAQuestion')}
              value={question}
              disabled={locked}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void ask();
                }
              }}
            />
            <div className="chat-submit">
              <button
                type="button"
                disabled={!evidence || locked}
                onClick={() =>
                  download(
                    'analysis-evidence.json',
                    JSON.stringify(evidence, null, 2),
                    'application/json',
                  )
                }
              >
                {t('exportAnalysis')}
              </button>
              {activeStream.current && locked ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => activeStream.current?.abort()}
                >
                  {t('stop')}
                </button>
              ) : (
                <button className="primary" disabled={locked || !llmReady || !question.trim()}>
                  {t('send')}
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
      {settings && (
        <Dialog title={t('settings')} wide onClose={() => setSettings(false)}>
          <div className="settings-tabs" role="tablist" aria-label={t('settingsCategory')}>
            <button
              role="tab"
              aria-selected={settingsTab === 'general'}
              className={settingsTab === 'general' ? 'selected' : ''}
              onClick={() => setSettingsTab('general')}
            >
              {t('general')}
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'models'}
              className={settingsTab === 'models' ? 'selected' : ''}
              onClick={() => setSettingsTab('models')}
            >
              {t('goModels')}
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'training'}
              className={settingsTab === 'training' ? 'selected' : ''}
              onClick={() => setSettingsTab('training')}
            >
              {t('aiAutoPlay')}
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'connections'}
              className={settingsTab === 'connections' ? 'selected' : ''}
              onClick={() => setSettingsTab('connections')}
            >
              {t('connectLlm')}
            </button>
          </div>
          {settingsTab === 'general' ? (
            <GeneralSettings beforeInstall={library.flush} busy={locked} />
          ) : settingsTab === 'training' ? (
            <fieldset disabled={locked}>
              <label>
                {t('opponentRank')}
                <select
                  value={training.rank}
                  onChange={(e) =>
                    setTraining((t) => ({
                      ...trainingForRank(e.target.value),
                      visits: t.visits,
                      searchLimit: t.searchLimit,
                      maxTime: t.maxTime,
                    }))
                  }
                >
                  {RANKS.map((rank) => (
                    <option key={rank} value={rank}>
                      {rank.slice(0, -1)} {rank.endsWith('k') ? t('kyu') : t('dan')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('moveSelection')}
                <select
                  value={training.mode}
                  onChange={(e) =>
                    setTraining((t) => ({ ...t, mode: e.target.value as Training['mode'] }))
                  }
                >
                  <option value="human">
                    HumanSL{status?.engine.humanModel ? '' : t('notConfiguredSuffix')}
                  </option>
                  <option value="balanced">{t('randomWeakerMoves')}</option>
                  <option value="strong">{t('strongestCandidate')}</option>
                </select>
              </label>
              <fieldset
                disabled={
                  (training.mode === 'human' && status?.engine.humanModel) ||
                  training.mode === 'strong'
                }
              >
                <label>
                  {t('randomness')}
                  <output>{Math.round(training.randomness * 100)}%</output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-label={t('randomness')}
                    value={training.randomness}
                    onChange={(e) => setTraining((t) => ({ ...t, randomness: +e.target.value }))}
                  />
                </label>
                <label>
                  {t('aggression')}
                  <output>{Math.round(training.aggression * 100)}%</output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label={t('aggression')}
                    value={training.aggression}
                    onChange={(e) => setTraining((t) => ({ ...t, aggression: +e.target.value }))}
                  />
                </label>
                <label>
                  {t('maximumCandidatePointLoss')}
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={training.maxLoss}
                    onChange={(e) =>
                      setTraining((t) => ({
                        ...t,
                        maxLoss: Math.max(0, Math.min(30, +e.target.value)),
                      }))
                    }
                  />
                </label>
              </fieldset>
              <SearchLimitSettings
                training={training}
                onChange={(value) => setTraining((t) => ({ ...t, ...value }))}
              />
            </fieldset>
          ) : settingsTab === 'models' ? (
            <div className="connections">
              <EngineSettings
                busy={locked}
                status={status?.engine}
                onChange={(engine) => {
                  statusRequest.current++;
                  setStatus((value) => (value ? { ...value, engine } : value));
                  activeStream.current?.abort();
                  evaluations.reset();
                  setBotFailed(false);
                  void refreshStatus();
                }}
              />
            </div>
          ) : (
            <div className="connections">
              <LlmSettings
                status={status?.llm}
                onChange={(llm) => {
                  statusRequest.current++;
                  setStatus((value) => (value ? { ...value, llm } : value));
                  void refreshStatus();
                }}
              />
            </div>
          )}
        </Dialog>
      )}
      {showGames && (
        <Dialog
          title={t('gameHistory')}
          wide
          onClose={() => {
            setShowGames(false);
            setImportedTreeId(undefined);
          }}
        >
          <RecordLibrary
            games={library.games}
            selectedId={library.gameId}
            disabled={locked}
            onImport={() => fileInput.current?.click()}
            onRename={library.renameGame}
            initialTreeId={importedTreeId}
            onExport={(item) =>
              download(
                `${item.title.replace(/[\\/:*?"<>|]/g, '_')}.sgf`,
                exportSgf(item.game),
                'application/x-go-sgf',
              )
            }
            onSelect={(item, warnings, selectedTurn) => {
              invalidate();
              evaluations.reset();
              setAutoPlay(false);
              library.selectGame(item);
              if (warnings)
                setNotice({
                  kind: 'import',
                  name: item.title,
                  moves: item.game.moves.length,
                  warnings,
                });
              const startTurn = selectedTurn ?? (item.preset ? 0 : item.game.moves.length);
              setTurn(startTurn);
              // The game-ID effect also handles first-time preset selection.
              pendingCoach.current =
                item.id !== library.gameId ? { turn: startTurn, trial: null } : null;
              setShowGames(false);
              setImportedTreeId(undefined);
            }}
          />
        </Dialog>
      )}
      {showConversations && (
        <Dialog title={t('chatHistory')} onClose={() => setShowConversations(false)}>
          <div className="history-list">
            {library.conversations.map((item) => (
              <article key={item.id}>
                <button
                  disabled={locked}
                  aria-pressed={item.id === library.conversationId}
                  onClick={() => {
                    library.selectConversation(item.id);
                    setShowConversations(false);
                  }}
                >
                  <b>{item.messages.length ? item.title : t('newChat')}</b>
                  <small>
                    {t('exchanges', { v0: item.messages.length, v1: formatDate(item.updatedAt) })}
                  </small>
                </button>
              </article>
            ))}
          </div>
        </Dialog>
      )}
      {setup && (
        <Dialog title={t('newGame')} onClose={() => setSetup(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!Number.isFinite(komi) || Math.abs(komi) > 100) return;
              invalidate();
              evaluations.reset();
              library.newGame(newGame(size, handicap, komi, rules));
              setTurn(0);
              setSetup(false);
            }}
          >
            <label>
              {t('board')}
              <select value={size} onChange={(e) => setSize(+e.target.value)}>
                {[9, 13, 19].map((n) => (
                  <option key={n} value={n}>
                    {t('boardSize', { v0: n })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('rules')}
              <select
                value={rules}
                onChange={(e) => {
                  setRules(e.target.value as Game['rules']);
                  if (!handicap) setKomi(e.target.value === 'chinese' ? 7.5 : 6.5);
                }}
              >
                <option value="chinese">{t('chineseRules')}</option>
                <option value="japanese">{t('japaneseRules')}</option>
              </select>
            </label>
            <label>
              {t('handicap')}
              <select
                value={handicap}
                onChange={(e) => {
                  setHandicap(+e.target.value);
                  setKomi(+e.target.value ? 0.5 : rules === 'chinese' ? 7.5 : 6.5);
                }}
              >
                {[0, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n ? t('stonesWhiteFirst', { v0: n }) : t('evenGame')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('komi')}
              <input
                type="number"
                min="-100"
                max="100"
                step="0.5"
                required
                value={komi}
                onChange={(e) => setKomi(+e.target.value)}
              />
            </label>
            <button className="primary full">{t('start')}</button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
