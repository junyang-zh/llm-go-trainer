import { t } from './i18n';
import { useState, type ReactNode } from 'react';
import { evaluationSegments, type EvaluationHistory } from './evaluation-history';

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
export function EvaluationChart({
  history,
  mainlineHistory = history,
  trialTurn,
  turn,
  total,
  disabled,
  navigate,
}: {
  history: EvaluationHistory;
  mainlineHistory?: EvaluationHistory;
  trialTurn?: number;
  turn: number;
  total: number;
  disabled: boolean;
  navigate: (turn: number) => void;
}) {
  const mainline = Object.values(mainlineHistory).sort((a, b) => a.turn - b.turn);
  const trial = Object.values(history).sort((a, b) => a.turn - b.turn);
  const series =
    trialTurn === undefined
      ? [{ kind: 'mainline', points: trial, dots: trial }]
      : [
          {
            kind: 'mainline',
            points: mainline.filter((point) => point.turn <= trialTurn),
            dots: mainline.filter((point) => point.turn <= trialTurn),
          },
          {
            kind: 'future',
            points: mainline.filter((point) => point.turn >= trialTurn),
            dots: mainline.filter((point) => point.turn > trialTurn),
          },
          {
            kind: 'trial',
            points: trial.filter((point) => point.turn >= trialTurn),
            dots: trial.filter((point) => point.turn > trialTurn),
          },
        ];
  const points = series.flatMap((line) => line.dots);
  const limit = Math.max(
    5,
    Math.ceil(Math.max(0, ...points.map((point) => Math.abs(point.scoreLead))) / 5) * 5,
  );
  const x = (value: number) => 38 + (value / Math.max(total, 1)) * 360;
  const plots = [
    {
      key: 'winrate' as const,
      label: t('blackWinRate'),
      top: 18,
      bottom: 74,
      max: '100',
      min: '0',
      y: (value: number) => 74 - value * 56,
    },
    {
      key: 'scoreLead' as const,
      label: t('blackLeadPoints'),
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
      aria-label={t('blackWinRateAndScoreHistory')}
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
          {series.map((line) => (
            <g key={line.kind} className={`plot-series ${line.kind}`}>
              {evaluationSegments(line.points).map((segment) => (
                <polyline
                  key={segment[0].turn}
                  points={segment
                    .map((point) => `${x(point.turn)},${plot.y(point[plot.key])}`)
                    .join(' ')}
                  className="plot-line"
                />
              ))}
              {line.dots.map((point) => (
                <g
                  key={point.turn}
                  role="button"
                  aria-disabled={disabled || line.kind === 'future'}
                  tabIndex={disabled || line.kind === 'future' ? -1 : 0}
                  aria-label={t('chartPointLabel', {
                    v0: point.turn,
                    v1: (point.winrate * 100).toFixed(1),
                    v2: signed(point.scoreLead),
                    v3:
                      (point.final ? '' : t('incompleteClause')) +
                      (line.kind === 'trial'
                        ? t('trialMoves', { v0: point.turn - trialTurn! })
                        : ''),
                  })}
                  onClick={() => !disabled && line.kind !== 'future' && navigate(point.turn)}
                  onKeyDown={(event) => {
                    if (!disabled && line.kind !== 'future' && ['Enter', ' '].includes(event.key)) {
                      event.preventDefault();
                      navigate(point.turn);
                    }
                  }}
                  className={`plot-point ${point.final ? '' : 'partial'}`}
                >
                  <title>
                    {t('chartPointTitle', {
                      v0: point.turn,
                      v1: (point.winrate * 100).toFixed(1),
                      v2: signed(point.scoreLead),
                      v3: point.visits,
                      v4:
                        (point.final ? '' : t('incompleteSuffix')) +
                        (line.kind === 'trial'
                          ? t('trialMoves', { v0: point.turn - trialTurn! })
                          : ''),
                    })}
                  </title>
                  <circle
                    cx={x(point.turn)}
                    cy={plot.y(point[plot.key])}
                    r="6"
                    fill="transparent"
                  />
                  <circle
                    cx={x(point.turn)}
                    cy={plot.y(point[plot.key])}
                    r={point.turn === turn && line.kind !== 'future' ? 3.5 : 2}
                    className="plot-dot"
                  />
                </g>
              ))}
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
          {t('moveCount', { v0: total })}
        </text>
      )}
    </svg>
  );
}

export function EvaluationPanel({
  history,
  mainlineHistory,
  mainlineTotal = 0,
  trialTurn,
  turn,
  total,
  disabled,
  ready,
  pendingTurn,
  error,
  navigate,
  retry,
  children,
}: {
  history: EvaluationHistory;
  mainlineHistory?: EvaluationHistory;
  mainlineTotal?: number;
  trialTurn?: number;
  turn: number;
  total: number;
  disabled: boolean;
  ready: boolean;
  pendingTurn: number | null;
  error: string;
  navigate: (turn: number) => void;
  retry: () => void;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = history[turn];
  return (
    <section className="evaluation" aria-label={t('scoreAndWinRate')}>
      <button
        className="evaluation-toggle"
        aria-expanded={expanded}
        aria-controls="evaluation-plot"
        title={error || undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{t('scoreWinRate', { v0: expanded ? '⌄' : '›' })}</span>
        {expanded && (
          <span className="evaluation-current">
            {current
              ? t('currentEvaluation', {
                  v0: signed(current.scoreLead),
                  v1: (current.winrate * 100).toFixed(1),
                  v2: current.final
                    ? ''
                    : pendingTurn === turn
                      ? t('searchingSuffix')
                      : t('incompleteSuffix'),
                })
              : error
                ? t('analysisFailed')
                : pendingTurn !== null
                  ? t('analyzing')
                  : ready
                    ? t('notAnalyzed')
                    : t('engineNotReady')}
          </span>
        )}
      </button>
      {expanded && (
        <div id="evaluation-plot" className="evaluation-body">
          <div className="evaluation-candidates">{children}</div>
          <EvaluationChart
            history={history}
            mainlineHistory={mainlineHistory}
            trialTurn={trialTurn}
            turn={turn}
            total={Math.max(total, mainlineTotal)}
            disabled={disabled || trialTurn !== undefined}
            navigate={navigate}
          />
          {error && (
            <div className="evaluation-actions">
              <button disabled={disabled || !ready} onClick={retry}>
                {t('retry')}
              </button>
            </div>
          )}
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
