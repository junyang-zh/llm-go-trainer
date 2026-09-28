import { useEffect, useMemo, useRef, useState } from 'react';
import { EngineSettings, engineLabel } from './EngineSettings';
import { LlmSettings } from './LlmSettings';
import { availabilityLabel, providerNames } from '../shared/llm';
import { Dialog } from './Dialog';
import { type AnalysisMessage, updateMessage } from './messages';
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
  ChatMessage,
  CoachAction,
  Color,
  Game,
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
  const [game, setGame] = useState(restoredGame);
  const [turn, setTurn] = useState(game.moves.length);
  const [mode, setMode] = useState<'review' | 'play'>('review');
  const [human, setHuman] = useState<Color>('B');
  const [training, setTraining] = useState<Training>(trainingForRank('5k'));
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showOwnership, setShowOwnership] = useState(false);
  const [showCandidates, setShowCandidates] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [dead, setDead] = useState<number[]>([]);
  const [messages, setMessages] = useState<AnalysisMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [evidence, setEvidence] = useState<unknown>();
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'training' | 'connections'>('training');
  const [boardSize, setBoardSize] = useState(0);
  const [setup, setSetup] = useState(false);
  const [size, setSize] = useState(19),
    [handicap, setHandicap] = useState(0),
    [komi, setKomi] = useState(7.5);
  const [rules, setRules] = useState<Game['rules']>('chinese');
  const [pv, setPv] = useState<{ moves: string[]; step: number } | null>(null);
  const [botFailed, setBotFailed] = useState(false);
  const lock = useRef(false),
    statusRequest = useRef(0),
    fileInput = useRef<HTMLInputElement>(null),
    chatLog = useRef<HTMLDivElement>(null),
    boardStage = useRef<HTMLDivElement>(null),
    followChat = useRef(true),
    activeStream = useRef<AbortController | null>(null);
  const current = useMemo(() => ({ ...game, moves: game.moves.slice(0, turn) }), [game, turn]);
  const position = useMemo(() => replay(current), [current]);
  const preview = useMemo(() => {
    if (!pv) return { position, last: current.moves.at(-1)?.point };
    let result = position,
      last = current.moves.at(-1)?.point;
    for (const point of pv.moves.slice(0, pv.step)) {
      try {
        result = play(result, { color: result.toPlay, point }, game.size, game.rules);
        last = point;
      } catch {
        break;
      }
    }
    return { position: result, last };
  }, [pv, position, current, game.size, game.rules]);
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
  const evaluations = useEvaluations(
    game,
    turn,
    training,
    status?.engine,
    !!busy ||
      !!pv ||
      setup ||
      scoring ||
      (mode === 'play' &&
        turn === game.moves.length &&
        position.toPlay !== human &&
        position.passes < 2),
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
  }, [messages]);
  useEffect(() => {
    const stage = boardStage.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoardSize(
        Math.max(0, Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height))),
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => activeStream.current?.abort(), []);
  function invalidate() {
    setMessages([]);
    setHistory([]);
    setNotice('');
    setEvidence(undefined);
    setPv(null);
    setDead([]);
    setScoring(false);
    setError('');
    setBotFailed(false);
  }
  function navigate(value: number) {
    if (lock.current) return;
    invalidate();
    setTurn(Math.max(0, Math.min(game.moves.length, value)));
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
        play(position, { color: position.toPlay, point: result.move }, game.size, game.rules);
        changeGame({
          ...current,
          moves: [...current.moves, { color: position.toPlay, point: result.move }],
        });
        setNotice(result.method);
      } catch (e) {
        setBotFailed(true);
        throw e;
      }
    });
  }
  useEffect(() => {
    if (
      mode === 'play' &&
      !scoring &&
      !pv &&
      !setup &&
      turn === game.moves.length &&
      position.toPlay !== human &&
      position.passes < 2 &&
      !busy &&
      !botFailed &&
      status?.engine.ready
    )
      void botMove();
    // A turn transition, not a background status refresh, schedules the opponent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, turn, game, human, busy, botFailed, scoring, pv, setup, status?.engine.ready]);
  function place(point: string) {
    if (lock.current || pv) return;
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
    if (mode === 'play' && position.toPlay !== human) {
      setError('轮到 AI 行棋');
      return;
    }
    if (turn !== game.moves.length) {
      setError('当前为历史局面');
      return;
    }
    try {
      play(position, { color: position.toPlay, point }, game.size, game.rules);
      changeGame({ ...current, moves: [...current.moves, { color: position.toPlay, point }] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function requestAnalysis(
    title: string,
    endpoint: 'analyze' | 'coach',
    payload: unknown,
    territory = false,
  ) {
    await run('分析中', async () => {
      const controller = new AbortController();
      activeStream.current = controller;
      followChat.current = true;
      const id = crypto.randomUUID();
      setMessages((previous) => [
        ...previous,
        { id, question: title, text: '', status: '连接中', state: 'running', evaluations: {} },
      ]);
      if (endpoint === 'coach') setQuestion('');
      try {
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
              if (territory && event.phase === 'after') setShowOwnership(true);
            }
            if (event.type === 'done') {
              if (event.analysis) evaluations.record(current, event.analysis, true);
              if (event.evidence) setEvidence(event.evidence);
              if (event.answer)
                setHistory((previous) => [
                  ...previous,
                  { role: 'user', content: title },
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
              ? {
                  ...message,
                  state: stopped ? 'stopped' : 'error',
                  status: stopped ? '已停止' : (error as Error).message,
                }
              : message,
          ),
        );
      } finally {
        activeStream.current = null;
      }
    });
  }
  async function analyze(territory = false) {
    await requestAnalysis(
      territory ? '领地预测' : '分析局面',
      'analyze',
      { game: current, training },
      territory,
    );
  }
  async function ask(action: CoachAction) {
    if (!llmReady) {
      setSettingsTab('connections');
      setSettings(true);
      return;
    }
    if (action === 'chat' && !question.trim()) return;
    const text = action === 'chat' ? question.trim() : labels[action];
    await requestAnalysis(text, 'coach', {
      game: current,
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
      setMode('review');
      changeGame(imported.game, true);
      setNotice(
        [`已导入 ${file.name} · ${imported.game.moves.length} 手`, ...imported.warnings].join(' '),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const locked = !!busy;
  const selectedLlm = status?.llm?.selected;
  const llmReady = !!selectedLlm && !!status?.llm?.providers[selectedLlm].available;
  const llmLabel = selectedLlm
    ? `${providerNames[selectedLlm]} · ${availabilityLabel(status?.llm?.providers[selectedLlm])}`
    : status?.llm
      ? 'LLM · 未连接'
      : 'LLM · 检测中';
  const engineStatus = engineLabel(status?.engine);
  return (
    <main className="workspace">
      <section className="board-panel" aria-label="棋盘">
        <div className="board-toolbar">
          <svg className="board-logo" viewBox="0 0 32 32" role="img" aria-label="棋盘图标">
            <rect x="1" y="1" width="30" height="30" rx="7" fill="#294d40" />
            <path
              d="M8 6v20M16 6v20M24 6v20M6 8h20M6 16h20M6 24h20"
              stroke="#b4c8b6"
              strokeWidth=".8"
            />
            <circle cx="16" cy="16" r="4" fill="#f0e9d8" />
            <circle cx="24" cy="8" r="3.3" fill="#294d40" stroke="#b4c8b6" />
          </svg>
          <button
            className="settings-trigger"
            aria-label="设置"
            title="设置"
            aria-haspopup="dialog"
            aria-expanded={settings}
            onClick={() => setSettings(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 2h4l.7 3 2 1.2 3-.9 2 3.4-2.3 2.1v2.4l2.3 2.1-2 3.4-3-.9-2 1.2-.7 3h-4l-.7-3-2-1.2-3 .9-2-3.4 2.3-2.1v-2.4L2.3 8.7l2-3.4 3 .9 2-1.2z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </button>
          <select
            className="mode-select"
            aria-label="对局模式"
            disabled={locked}
            value={mode}
            onChange={(e) => {
              setBotFailed(false);
              setMode(e.target.value as typeof mode);
            }}
          >
            <option value="review">自由复盘</option>
            <option value="play">人机对战</option>
          </select>
          <button disabled={locked} onClick={() => setSetup(true)}>
            新对局
          </button>
          <button disabled={locked} onClick={() => fileInput.current?.click()}>
            导入
          </button>
          <button
            disabled={locked}
            onClick={() => download('training.sgf', exportSgf(game), 'application/x-go-sgf')}
          >
            导出
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
        <div className="board-stage" ref={boardStage}>
          <div className="board-frame" style={{ width: boardSize, height: boardSize }}>
            <Board
              size={game.size}
              position={preview.position}
              lastPoint={preview.last}
              ownership={
                scoring ? score.ownership : showOwnership && !pv ? analysis?.ownership : undefined
              }
              candidates={pv || scoring || !showCandidates ? [] : candidates}
              dead={dead}
              disabled={locked || !!pv}
              scoring={scoring}
              onPlay={place}
            />
          </div>
        </div>
        <div className="board-bottom">
          {pv ? (
            <div className="move-controls variation-bar">
              <span>
                变化 {pv.step} / {pv.moves.length}
              </span>
              <button
                aria-label="变化上一手"
                disabled={!pv.step}
                onClick={() => setPv({ ...pv, step: pv.step - 1 })}
              >
                ←
              </button>
              <button
                aria-label="变化下一手"
                disabled={pv.step === pv.moves.length}
                onClick={() => setPv({ ...pv, step: pv.step + 1 })}
              >
                →
              </button>
              <button onClick={() => setPv(null)}>返回实战</button>
            </div>
          ) : (
            <div className="move-controls">
              <button aria-label="回到开局" disabled={locked || !turn} onClick={() => navigate(0)}>
                ⇤
              </button>
              <button
                aria-label="上一手"
                disabled={locked || !turn}
                onClick={() => navigate(turn - 1)}
              >
                ←
              </button>
              <span>
                <b>{turn}</b> / {game.moves.length} 手
              </span>
              <button
                aria-label="下一手"
                disabled={locked || turn === game.moves.length}
                onClick={() => navigate(turn + 1)}
              >
                →
              </button>
              <button
                aria-label="最后一手"
                disabled={locked || turn === game.moves.length}
                onClick={() => navigate(game.moves.length)}
              >
                ⇥
              </button>
              <input
                className="timeline"
                aria-label="复盘手数"
                type="range"
                min="0"
                max={Math.max(game.moves.length, 1)}
                value={turn}
                disabled={locked}
                onChange={(e) => navigate(+e.target.value)}
              />
            </div>
          )}
          <div className="board-tools">
            <button disabled={locked || !!pv || scoring} onClick={() => place('pass')}>
              停一手
            </button>
            <button
              disabled={locked || !!pv || !status?.engine.ready}
              onClick={() => void analyze()}
            >
              分析局面
            </button>
            <button
              className={showCandidates ? 'selected' : ''}
              aria-pressed={showCandidates}
              onClick={() => setShowCandidates((value) => !value)}
            >
              候选点
            </button>
            <button
              className={showOwnership ? 'selected' : ''}
              disabled={locked || !!pv || scoring || (!analysis && !status?.engine.ready)}
              onClick={() => (analysis ? setShowOwnership(!showOwnership) : void analyze(true))}
            >
              领地预测
            </button>
            <button
              className={scoring ? 'selected' : ''}
              disabled={locked || !!pv || game.rules === 'japanese'}
              title={game.rules === 'japanese' ? '日本规则数目未实现' : '中国规则面积计分'}
              onClick={() => {
                setScoring(!scoring);
                setDead([]);
              }}
            >
              数目
            </button>
            {turn < game.moves.length && !pv && (
              <button
                disabled={locked}
                onClick={() => {
                  download('before-variation.sgf', exportSgf(game), 'application/x-go-sgf');
                  changeGame(current);
                }}
              >
                从这里继续
              </button>
            )}
            <span className="board-meta">
              {game.size} 路 · {game.rules === 'chinese' ? '中国' : '日本'} · 贴 {game.komi}
            </span>
          </div>
          {scoring && (
            <div className="score-line">
              面积计分：黑 {score.black} · 白 {score.white} + {game.komi + handicapBonus}　
              {score.lead >= 0 ? '黑' : '白'} +{Math.abs(score.lead).toFixed(1)}{' '}
              <span>标记死子 {dead.length}</span>
            </div>
          )}
          {(busy || error || notice) && (
            <div
              className={`board-status ${error ? 'error' : ''}`}
              role={error ? 'alert' : 'status'}
              title={error || busy || notice}
            >
              <span>{error || busy || notice}</span>
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
              {!busy && (
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
          )}
        </div>
      </section>
      <aside className="chat-panel" aria-label="分析对话">
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
        {status?.engine.phase && !['ready', 'stopped'].includes(status.engine.phase) && (
          <div
            className={`engine-progress ${status.engine.phase === 'error' ? 'error' : ''}`}
            role="status"
          >
            {engineStatus}
          </div>
        )}
        <EvaluationPanel
          history={evaluations.points}
          turn={turn}
          total={game.moves.length}
          disabled={locked || !!pv || scoring}
          ready={!!status?.engine.ready}
          completing={evaluations.completing}
          pendingTurn={evaluations.pendingTurn}
          error={evaluations.error}
          navigate={navigate}
          complete={evaluations.complete}
          stop={evaluations.stop}
          retry={evaluations.retry}
        />
        {showCandidates && !pv && !scoring && candidates.length > 0 && (
          <div className="candidates">
            {candidates.map((candidate, i) => (
              <button
                key={candidate.move}
                disabled={locked || scoring}
                onClick={() => setPv({ moves: candidate.pv, step: 0 })}
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
        <div className="quick-actions">
          {(['move', 'position', 'variation'] as const).map((action) => (
            <button
              key={action}
              disabled={locked || !llmReady || !!pv || (action === 'move' && !turn)}
              onClick={() => void ask(action)}
            >
              {labels[action]}
            </button>
          ))}
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
                      {final ? '搜索完成' : message.state === 'running' ? '搜索中' : '搜索未完成'} ·{' '}
                      {value.rootInfo.visits.toLocaleString()} visits
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
            void ask('chat');
          }}
        >
          <textarea
            aria-label="问题"
            placeholder="输入问题"
            value={question}
            disabled={locked || !!pv}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask('chat');
              }
            }}
          />
          <div>
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
              <button
                className="primary"
                disabled={locked || !llmReady || !!pv || !question.trim()}
              >
                发送
              </button>
            )}
          </div>
        </form>
      </aside>
      {settings && (
        <Dialog title="设置" onClose={() => setSettings(false)}>
          <div className="settings-tabs" role="tablist" aria-label="设置类别">
            <button
              role="tab"
              aria-selected={settingsTab === 'training'}
              className={settingsTab === 'training' ? 'selected' : ''}
              onClick={() => setSettingsTab('training')}
            >
              对局训练
            </button>
            <button
              role="tab"
              aria-selected={settingsTab === 'connections'}
              className={settingsTab === 'connections' ? 'selected' : ''}
              onClick={() => setSettingsTab('connections')}
            >
              连接
            </button>
          </div>
          {settingsTab === 'training' ? (
            <fieldset disabled={locked}>
              <label>
                执子
                <select
                  value={human}
                  onChange={(e) => {
                    setHuman(e.target.value as Color);
                    setBotFailed(false);
                  }}
                >
                  <option value="B">黑</option>
                  <option value="W">白</option>
                </select>
              </label>
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
          ) : (
            <div className="connections">
              <EngineSettings
                status={status?.engine}
                onChange={(engine) => {
                  statusRequest.current++;
                  setStatus((value) => (value ? { ...value, engine } : value));
                  activeStream.current?.abort();
                  evaluations.reset();
                  setPv(null);
                  setBotFailed(false);
                  void refreshStatus();
                }}
              />
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
      {setup && (
        <Dialog title="新对局" onClose={() => setSetup(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!Number.isFinite(komi) || Math.abs(komi) > 100) return;
              if (game.moves.length)
                download('previous-game.sgf', exportSgf(game), 'application/x-go-sgf');
              changeGame(newGame(size, handicap, komi, rules), true);
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
