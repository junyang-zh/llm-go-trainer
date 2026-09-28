import { useState } from 'react';
import { evaluationSegments, type EvaluationHistory } from './evaluation-history';

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
export function EvaluationChart({
  history,
  turn,
  total,
  disabled,
  navigate,
}: {
  history: EvaluationHistory;
  turn: number;
  total: number;
  disabled: boolean;
  navigate: (turn: number) => void;
}) {
  const points = Object.values(history).sort((a, b) => a.turn - b.turn);
  const segments = evaluationSegments(points);
  const limit = Math.max(
    5,
    Math.ceil(Math.max(0, ...points.map((point) => Math.abs(point.scoreLead))) / 5) * 5,
  );
  const x = (value: number) => 38 + (value / Math.max(total, 1)) * 360;
  const plots = [
    {
      key: 'winrate' as const,
      label: '黑胜率 (%)',
      top: 18,
      bottom: 74,
      max: '100',
      min: '0',
      y: (value: number) => 74 - value * 56,
    },
    {
      key: 'scoreLead' as const,
      label: '黑目差 (目)',
      top: 112,
      bottom: 168,
      max: `+${limit}`,
      min: `−${limit}`,
      y: (value: number) => 140 - (value / limit) * 28,
    },
  ];
  return (
    <svg
      className="evaluation-chart"
      viewBox="0 0 416 188"
      role="group"
      aria-label="黑方胜率与目差历史曲线"
    >
      {plots.map((plot) => (
        <g key={plot.key} className={`plot-${plot.key}`}>
          <text x="38" y={plot.top - 6} className="plot-title">
            {plot.label}
          </text>
          {[plot.top, (plot.top + plot.bottom) / 2, plot.bottom].map((y) => (
            <line key={y} x1="38" x2="398" y1={y} y2={y} className="plot-grid" />
          ))}
          <text x="31" y={plot.top + 4} textAnchor="end">
            {plot.max}
          </text>
          <text x="31" y={(plot.top + plot.bottom) / 2 + 4} textAnchor="end">
            {plot.key === 'winrate' ? '50' : '0'}
          </text>
          <text x="31" y={plot.bottom + 4} textAnchor="end">
            {plot.min}
          </text>
          <line x1={x(turn)} x2={x(turn)} y1={plot.top} y2={plot.bottom} className="plot-cursor" />
          {segments.map((segment) => (
            <polyline
              key={segment[0].turn}
              points={segment
                .map((point) => `${x(point.turn)},${plot.y(point[plot.key])}`)
                .join(' ')}
              className="plot-line"
            />
          ))}
          {points.map((point) => (
            <g
              key={point.turn}
              role="button"
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              aria-label={`第 ${point.turn} 手，黑胜率 ${(point.winrate * 100).toFixed(1)}%，黑目差 ${signed(point.scoreLead)}${point.final ? '' : '，未完成'}`}
              onClick={() => !disabled && navigate(point.turn)}
              onKeyDown={(event) => {
                if (!disabled && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  navigate(point.turn);
                }
              }}
              className={`plot-point ${point.final ? '' : 'partial'}`}
            >
              <title>{`第 ${point.turn} 手 · 黑胜率 ${(point.winrate * 100).toFixed(1)}% · 黑目差 ${signed(point.scoreLead)} · ${point.visits} visits${point.final ? '' : ' · 未完成'}`}</title>
              <circle cx={x(point.turn)} cy={plot.y(point[plot.key])} r="6" fill="transparent" />
              <circle
                cx={x(point.turn)}
                cy={plot.y(point[plot.key])}
                r={point.turn === turn ? 3.5 : 2}
                className="plot-dot"
              />
            </g>
          ))}
        </g>
      ))}
      <text x="38" y="184">
        0
      </text>
      {total > 1 && (
        <text x={x(Math.floor(total / 2))} y="184" textAnchor="middle">
          {Math.floor(total / 2)}
        </text>
      )}
      {total > 0 && (
        <text x="398" y="184" textAnchor="end">
          {total} 手
        </text>
      )}
    </svg>
  );
}

export function EvaluationPanel({
  history,
  turn,
  total,
  disabled,
  ready,
  completing,
  pendingTurn,
  error,
  navigate,
  complete,
  stop,
  retry,
}: {
  history: EvaluationHistory;
  turn: number;
  total: number;
  disabled: boolean;
  ready: boolean;
  completing: boolean;
  pendingTurn: number | null;
  error: string;
  navigate: (turn: number) => void;
  complete: () => void;
  stop: () => void;
  retry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = history[turn];
  const completed = Object.values(history).filter((point) => point.final).length;
  return (
    <section className="evaluation" aria-label="目差与胜率">
      <button
        className="evaluation-toggle"
        aria-expanded={expanded}
        aria-controls="evaluation-plot"
        title={error || undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{expanded ? '⌄' : '›'} 目差 / 胜率</span>
        <span className="evaluation-current">
          {current
            ? `黑 ${signed(current.scoreLead)} · ${(current.winrate * 100).toFixed(1)}%${current.final ? '' : pendingTurn === turn ? ' · 搜索中' : ' · 未完成'}`
            : error
              ? '分析失败'
              : pendingTurn !== null
                ? '分析中'
                : ready
                  ? '未分析'
                  : '引擎未就绪'}
        </span>
      </button>
      {expanded && (
        <div id="evaluation-plot" className="evaluation-body">
          <EvaluationChart
            history={history}
            turn={turn}
            total={total}
            disabled={disabled}
            navigate={navigate}
          />
          <div className="evaluation-actions">
            <span>
              {pendingTurn !== null
                ? `分析第 ${pendingTurn} 手`
                : `已分析 ${completed} / ${total + 1}`}
            </span>
            {completing ? (
              <button onClick={stop}>停止补全</button>
            ) : (
              <button disabled={disabled || !ready || completed === total + 1} onClick={complete}>
                补全曲线
              </button>
            )}
            {error && (
              <button disabled={disabled || !ready} onClick={retry}>
                重试
              </button>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
