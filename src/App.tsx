import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from './useLibrary';
import { gameTitle, type BoardContext } from '../shared/library';
import { extendTrial, trialStoneNumbers, trialVariation, type TrialBranch } from '../shared/trial';
import { MoveTimeline } from './MoveTimeline';
import { EngineSettings, engineLabel } from './EngineSettings';
import { LlmSettings } from './LlmSettings';
import { GeneralSettings } from './GeneralSettings';
import { availabilityLabel, providerNames } from '../shared/llm';
import { Dialog } from './Dialog';
import { type AnalysisMessage, updateMessage, finishMessage } from './messages';
import { AgentActivity } from './AgentActivity';
import { Board } from './Board';
import { MarkdownText } from './MarkdownText';
import { EvaluationPanel } from './EvaluationPanel';
import { useEvaluations } from './useEvaluations';
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

const labels: Record<CoachAction, string> = {
  move: '解释这一手',
  position: '当前局势',
  variation: '分析后续变化',
  chat: '提问',
};
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
  const [initialGame] = useState(restoredGame);
  const library = useLibrary(initialGame);
  const { game, setGame } = library;
  const [trial, setTrial] = useState<TrialBranch | null>(null);
  const trialMoves = useMemo(() => trial?.moves.slice(0, trial.cursor) ?? [], [trial]);
  const [showGames, setShowGames] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [turn, setTurn] = useState(game.moves.length);
  const [autoPlay, setAutoPlay] = useState(false);
  const [aiColor, setAiColor] = useState<Color>('W');
  const [training, setTraining] = useState<Training>(trainingForRank('5k'));
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
  useEffect(() => {
    setTurn(game.moves.length);
    setTrial(null);
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
    setNotice('');
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
    setNotice('');
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
  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy('');
      void refreshStatus();
    }
  }
  async function botMove() {
    await run(`${status?.engine.name || 'KataGo'} 搜索中`, async () => {
      try {
        const result = await api<{ move: string; method: string; analysis: Analysis }>('bot-move', {
          game: current,
          training,
        });
        evaluations.record(current, result.analysis, true);
        appendMove({ color: position.toPlay, point: result.move });
        setNotice(result.method);
      } catch (e) {
        setBotFailed(true);
        throw e;
      }
    });
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
    if (turn < game.moves.length || trial) {
      setTrial((previous) => extendTrial(previous, [move]));
      setError('');
      setDead([]);
    } else changeGame({ ...current, moves: [...current.moves, move] });
  }
  function forkGame() {
    const branch: Game = {
      ...current,
      metadata: { ...current.metadata, GN: `${gameTitle(game).slice(0, 150)} · 第${turn}手分支` },
    };
    delete branch.metadata.RE;
    invalidate();
    evaluations.reset();
    library.newGame(branch);
    setTurn(branch.moves.length);
    setNotice('已保存为新棋局，后续落子计入新局主线');
  }
  function playCandidate(candidate: Candidate) {
    if (lock.current || scoring) return;
    try {
      if (candidate.pv.length && candidate.pv[0] !== candidate.move)
        throw new Error('候选变化与首手不一致，请重新分析');
      const moves = trialVariation(current, candidate.pv.length ? candidate.pv : [candidate.move]);
      setTrial((previous) => extendTrial(previous, moves));
      setAutoPlay(false);
      setError('');
      setNotice('');
      setDead([]);
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
    if (position.passes >= 2) {
      setError('双方已停一手');
      return;
    }
    if (autoPlay && position.toPlay === aiColor) {
      setError('轮到 AI 行棋');
      return;
    }
    try {
      appendMove({ color: position.toPlay, point });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function requestAnalysis(title: string, endpoint: 'analyze' | 'coach', payload: unknown) {
    await run('分析中', async () => {
      const controller = new AbortController();
      activeStream.current = controller;
      followChat.current = true;
      const id = crypto.randomUUID();
      setMessages((previous) => [
        ...previous,
        {
          id,
          question: title,
          text: '',
          status: '连接中',
          state: 'running',
          evaluations: {},
          context: structuredClone(boardContext),
          createdAt: new Date().toISOString(),
        },
      ]);
      if (endpoint === 'coach') setQuestion('');
      try {
        await library.flush();
        await streamApi(
          endpoint,
          payload,
          (event) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === id ? updateMessage(message, event) : message,
              ),
            );
            if (event.type === 'analysis') {
              evaluations.record(current, event.analysis, event.final);
            }
            if (event.type === 'done') {
              if (event.analysis) evaluations.record(current, event.analysis, true);
              if (event.evidence) setEvidence(event.evidence);
              if (event.answer)
                setHistory((previous) => [
                  ...previous,
                  {
                    role: 'user',
                    content: `${title}\n[棋局上下文 ${JSON.stringify(boardContext)}]`,
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
                  stopped ? '已停止' : (error as Error).message,
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
      (['move', 'position', 'variation'] as const).find((action) => labels[action] === text) ??
      'chat';
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
    if (file.size > 2_000_000) {
      setError('棋谱超过 2 MB 限制');
      return;
    }
    try {
      const imported = importSgf(decodeSgf(await file.arrayBuffer()));
      invalidate();
      evaluations.reset();
      library.newGame(imported.game);
      setTurn(imported.game.moves.length);
      setShowGames(false);
      setNotice(
        [`已导入 ${file.name} · ${imported.game.moves.length} 手`, ...imported.warnings].join(' '),
      );
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
      ? 'LLM · 未连接'
      : 'LLM · 检测中';
  const engineStatus = engineLabel(status?.engine);
  const engineProgress =
    status?.engine.phase && !['ready', 'stopped'].includes(status.engine.phase) ? engineStatus : '';
  const workspaceError =
    error || library.error || (status?.engine.phase === 'error' ? engineProgress : '');
  const workspaceStatus = workspaceError || busy || engineProgress || notice;
  const timelineTurn = current.moves.length;
  const timelineTotal = Math.max(game.moves.length, turn + (trial?.moves.length ?? 0));
  const timelineLimit = trial ? turn + trial.moves.length : game.moves.length;
  return (
    <main className={`workspace${chatCollapsed ? ' chat-collapsed' : ''}`}>
      <section className="board-panel" aria-label="棋盘">
        <div className="board-toolbar">
          <button
            className="settings-trigger"
            aria-label="设置"
            title="设置"
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
              aria-label="AI 自动落子"
              checked={autoPlay}
              disabled={locked}
              onChange={(e) => {
                setAutoPlay(e.target.checked);
                setBotFailed(false);
              }}
            />
            AI 自动落子
          </label>
          <select
            className="ai-color-select"
            aria-label="AI 执子"
            value={aiColor}
            disabled={locked}
            onChange={(e) => {
              setAiColor(e.target.value as Color);
              setBotFailed(false);
            }}
          >
            <option value="W">AI 执白</option>
            <option value="B">AI 执黑</option>
          </select>
          <button disabled={locked} onClick={() => setSetup(true)}>
            新对局
          </button>
          <button disabled={locked} onClick={() => setShowGames(true)}>
            历史棋局
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
          <span title={game.metadata.PB || '黑方'}>
            <i className="stone-dot black" />
            {game.metadata.PB || '黑方'}
            <small>提 {position.captures.B}</small>
          </span>
          <span className="turn-badge">
            {position.passes >= 2 ? '双方停一手' : `${position.toPlay === 'B' ? '黑' : '白'}方行棋`}
          </span>
          <span title={game.metadata.PW || '白方'}>
            <small>提 {position.captures.W}</small>
            {game.metadata.PW || '白方'}
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
                  showCandidates && !showOwnership && !scoring
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
              aria-label="上一手"
              disabled={locked || !timelineTurn}
              onClick={() => navigate(timelineTurn - 1)}
            >
              ←
            </button>
            <span className="move-count">
              <b>{timelineTurn}</b> / {timelineTotal} 手
            </span>
            <button
              aria-label="下一手"
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
              停一手
            </button>
            <div className="board-tools-right">
              <button
                className={showCandidates ? 'selected' : ''}
                aria-pressed={showCandidates}
                onClick={() => setShowCandidates((value) => !value)}
              >
                候选点
              </button>
              <button
                className={showOwnership ? 'selected' : ''}
                disabled={locked || scoring || (!analysis && !status?.engine.ready)}
                aria-pressed={showOwnership}
                onClick={() => setShowOwnership((value) => !value)}
              >
                领地预测
              </button>
              <button
                className={scoring ? 'selected' : ''}
                disabled={locked || game.rules === 'japanese'}
                title={game.rules === 'japanese' ? '日本规则数目未实现' : '中国规则面积计分'}
                onClick={() => {
                  setScoring(!scoring);
                  setDead([]);
                }}
              >
                数目
              </button>
            </div>
          </div>
          <div className="board-secondary">
            <div className="board-meta">
              {game.size} 路 · {game.rules === 'chinese' ? '中国' : '日本'} · 贴 {game.komi}
            </div>
            <div className="trial-bar" aria-hidden={turn === game.moves.length && !trial}>
              <span>
                {trial
                  ? `试下 · 第 ${turn} 手起 ${trial.cursor} / ${trial.moves.length} 手`
                  : '复盘中'}
              </span>
              <button
                disabled={locked || !trial}
                onClick={() => {
                  setTrial(null);
                  setDead([]);
                  setScoring(false);
                }}
              >
                清空试下
              </button>
              <button disabled={locked} onClick={forkGame}>
                {trial ? '保存试下为新棋局' : '分支新棋局'}
              </button>
            </div>
          </div>
          {scoring && (
            <div className="score-line">
              面积计分：黑 {score.black} · 白 {score.white} + {game.komi + handicapBonus}　
              {score.lead >= 0 ? '黑' : '白'} +{Math.abs(score.lead).toFixed(1)}{' '}
              <span>标记死子 {dead.length}</span>
            </div>
          )}
        </div>
      </section>
      <div className="right-column">
        <button
          type="button"
          className="chat-collapse-toggle"
          aria-label={chatCollapsed ? '展开对话面板' : '收起对话面板'}
          title={chatCollapsed ? '展开对话面板' : '收起对话面板'}
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
          {library.error && <button onClick={library.retry}>重试</button>}
          {botFailed && (
            <button
              onClick={() => {
                setBotFailed(false);
                setError('');
              }}
            >
              重试
            </button>
          )}
          {!busy && (error || (!library.error && !engineProgress && notice)) && (
            <button
              aria-label="关闭通知"
              onClick={() => {
                setError('');
                setNotice('');
              }}
            >
              ×
            </button>
          )}
        </div>
        <aside id="chat-panel" className="chat-panel" aria-label="分析对话" hidden={chatCollapsed}>
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
            turn={current.moves.length}
            total={analysisGame.moves.length}
            disabled={locked || scoring || !!trial}
            ready={!!status?.engine.ready}
            completing={evaluations.completing}
            pendingTurn={evaluations.pendingTurn}
            error={evaluations.error}
            navigate={navigate}
            complete={evaluations.complete}
            stop={evaluations.stop}
            retry={evaluations.retry}
          >
            {!scoring && candidates.length > 0 && (
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
            )}
          </EvaluationPanel>
          <div className="conversation-toolbar">
            <span title={library.activeConversation.title}>{library.activeConversation.title}</span>
            <button disabled={locked} onClick={() => library.newConversation()}>
              新对话
            </button>
            <button disabled={locked} onClick={() => setShowConversations(true)}>
              历史对话
            </button>
          </div>
          <div
            className="chat-log"
            ref={chatLog}
            role="log"
            aria-label="分析结果"
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
                    {message.context.gameTitle} · 第 {message.context.turn} 手
                    {message.context.trialMoves.length > 0 &&
                      ` · 试下 +${message.context.trialMoves.length} 手`}
                    <small title={message.context.gameId}>
                      {' '}
                      · {message.context.gameId.slice(0, 8)}
                    </small>
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
                        {phase === 'before' ? '落子前' : '当前局面'} ·{' '}
                        {final ? '搜索完成' : message.state === 'running' ? '搜索中' : '搜索未完成'}{' '}
                        · {value.rootInfo.visits.toLocaleString()} visits
                      </span>
                      <div>
                        黑胜率 {(value.rootInfo.winrate * 100).toFixed(1)}% · 黑目差{' '}
                        {value.rootInfo.scoreLead > 0 ? '+' : ''}
                        {value.rootInfo.scoreLead.toFixed(1)}
                      </div>
                      {candidate && (
                        <div className="search-pv">{candidate.pv.slice(0, 8).join(' → ')}</div>
                      )}
                    </div>
                  );
                })}
                <AgentActivity tools={message.tools ?? []} />
                {message.text && <MarkdownText>{message.text}</MarkdownText>}
                {message.state !== 'done' && (
                  <div
                    className={`message-status ${message.state}`}
                    role={message.state === 'error' ? 'alert' : undefined}
                  >
                    {message.state === 'running' && <i />}
                    {message.status}
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
            <div className="quick-actions" aria-label="快捷提示">
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
              aria-label="问题"
              maxLength={4000}
              placeholder="输入问题"
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
                导出分析
              </button>
              {activeStream.current && locked ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => activeStream.current?.abort()}
                >
                  停止
                </button>
              ) : (
                <button className="primary" disabled={locked || !llmReady || !question.trim()}>
                  发送
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
      {settings && (
        <Dialog title="设置" wide onClose={() => setSettings(false)}>
          <div className="settings-tabs" role="tablist" aria-label="设置类别">
            <button
              role="tab"
              aria-selected={settingsTab === 'general'}
              className={settingsTab === 'general' ? 'selected' : ''}
              onClick={() => setSettingsTab('general')}
            >
              通用
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'models'}
              className={settingsTab === 'models' ? 'selected' : ''}
              onClick={() => setSettingsTab('models')}
            >
              围棋模型
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'training'}
              className={settingsTab === 'training' ? 'selected' : ''}
              onClick={() => setSettingsTab('training')}
            >
              AI 自动落子
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'connections'}
              className={settingsTab === 'connections' ? 'selected' : ''}
              onClick={() => setSettingsTab('connections')}
            >
              连接 LLM
            </button>
          </div>
          {settingsTab === 'general' ? (
            <GeneralSettings beforeInstall={library.flush} busy={locked} />
          ) : settingsTab === 'training' ? (
            <fieldset disabled={locked}>
              <label>
                对手级位 / 段位
                <select
                  value={training.rank}
                  onChange={(e) => setTraining(trainingForRank(e.target.value))}
                >
                  {RANKS.map((rank) => (
                    <option key={rank} value={rank}>
                      {rank.slice(0, -1)} {rank.endsWith('k') ? '级' : '段'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                选点方式
                <select
                  value={training.mode}
                  onChange={(e) =>
                    setTraining((t) => ({ ...t, mode: e.target.value as Training['mode'] }))
                  }
                >
                  <option value="human">
                    HumanSL{status?.engine.humanModel ? '' : '（未配置）'}
                  </option>
                  <option value="balanced">随机劣手</option>
                  <option value="strong">最强候选</option>
                </select>
              </label>
              <fieldset
                disabled={
                  (training.mode === 'human' && status?.engine.humanModel) ||
                  training.mode === 'strong'
                }
              >
                <label>
                  随机程度 <output>{Math.round(training.randomness * 100)}%</output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-label="随机程度"
                    value={training.randomness}
                    onChange={(e) => setTraining((t) => ({ ...t, randomness: +e.target.value }))}
                  />
                </label>
                <label>
                  激进度 <output>{Math.round(training.aggression * 100)}%</output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label="激进度"
                    value={training.aggression}
                    onChange={(e) => setTraining((t) => ({ ...t, aggression: +e.target.value }))}
                  />
                </label>
                <label>
                  候选目损上限
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
              <label>
                搜索量
                <select
                  value={training.visits}
                  onChange={(e) => setTraining((t) => ({ ...t, visits: +e.target.value }))}
                >
                  {[100, 400, 1000, 3000].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()} visits
                    </option>
                  ))}
                </select>
              </label>
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
        <Dialog title="历史棋局" onClose={() => setShowGames(false)}>
          <div className="history-actions">
            <button disabled={locked} onClick={() => fileInput.current?.click()}>
              导入 SGF
            </button>
            <span>棋局自动保存 · {library.games.length} 局</span>
          </div>
          <div className="history-list">
            {library.games.map((item) => (
              <article key={item.id}>
                <button
                  disabled={locked}
                  aria-pressed={item.id === library.gameId}
                  onClick={() => {
                    invalidate();
                    evaluations.reset();
                    library.selectGame(item);
                    setTurn(item.game.moves.length);
                    setShowGames(false);
                  }}
                >
                  <b>{item.title}</b>
                  <small>
                    {item.game.moves.length} 手 · {new Date(item.updatedAt).toLocaleString()} ·{' '}
                    {item.id.slice(0, 8)}
                  </small>
                </button>
                <button
                  onClick={() =>
                    download(`${item.id}.sgf`, exportSgf(item.game), 'application/x-go-sgf')
                  }
                >
                  导出 SGF
                </button>
              </article>
            ))}
          </div>
        </Dialog>
      )}
      {showConversations && (
        <Dialog title="历史对话" onClose={() => setShowConversations(false)}>
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
                  <b>{item.title}</b>
                  <small>
                    {item.messages.length} 轮 · {new Date(item.updatedAt).toLocaleString()}
                  </small>
                </button>
              </article>
            ))}
          </div>
        </Dialog>
      )}
      {setup && (
        <Dialog title="新对局" onClose={() => setSetup(false)}>
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
              棋盘
              <select value={size} onChange={(e) => setSize(+e.target.value)}>
                {[9, 13, 19].map((n) => (
                  <option key={n} value={n}>
                    {n} 路
                  </option>
                ))}
              </select>
            </label>
            <label>
              规则
              <select
                value={rules}
                onChange={(e) => {
                  setRules(e.target.value as Game['rules']);
                  if (!handicap) setKomi(e.target.value === 'chinese' ? 7.5 : 6.5);
                }}
              >
                <option value="chinese">中国规则</option>
                <option value="japanese">日本规则</option>
              </select>
            </label>
            <label>
              让子
              <select
                value={handicap}
                onChange={(e) => {
                  setHandicap(+e.target.value);
                  setKomi(+e.target.value ? 0.5 : rules === 'chinese' ? 7.5 : 6.5);
                }}
              >
                {[0, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n} 子，白先` : '分先'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              贴目
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
            <button className="primary full">开始</button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
