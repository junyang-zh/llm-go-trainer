import { t, formatNumber, localizeDiagnostic } from './i18n';
import type { ToolActivity } from '../shared/types';

export function AgentActivity({ tools }: { tools: ToolActivity[] }) {
  const states = {
    running: t('running'),
    done: t('done'),
    error: t('failed'),
    stopped: t('stopped'),
  };
  if (!tools.length) return null;
  return (
    <div className="agent-activity" aria-label={t('coachToolActivity')}>
      {tools.map((tool) => (
        <details key={tool.id} className={`agent-tool ${tool.state}`}>
          <summary>
            <i aria-hidden="true" />
            <span>{localizeDiagnostic(tool.label)}</span>
            <small>
              {states[tool.state]}
              {tool.elapsedMs !== undefined && tool.state !== 'running'
                ? ` · ${(tool.elapsedMs / 1000).toFixed(1)}s`
                : ''}
            </small>
          </summary>
          <div className="agent-tool-detail">
            {tool.baseTurn !== undefined && (
              <div>
                {t('positionAtMove', {
                  v0: tool.baseTurn,
                  v1: tool.moves?.length
                    ? t('trialSequence', {
                        v0: tool.moves
                          .map(
                            (move) =>
                              `${move.color === 'B' ? t('black') : t('white')} ${move.point === 'pass' ? t('pass') : move.point}`,
                          )
                          .join(' → '),
                      })
                    : '',
                })}
              </div>
            )}
            {tool.detail && <div>{localizeDiagnostic(tool.detail)}</div>}
            {tool.evaluation && (
              <>
                <div>
                  {t('toolEvaluation', {
                    v0: (tool.evaluation.winrate * 100).toFixed(1),
                    v1: tool.evaluation.scoreLead > 0 ? '+' : '',
                    v2: tool.evaluation.scoreLead.toFixed(1),
                    v3: formatNumber(tool.evaluation.visits),
                  })}
                </div>
                <div>
                  {tool.evaluation.pv
                    .map(
                      (move) =>
                        `${move.color === 'B' ? t('black') : t('white')} ${move.point === 'pass' ? t('pass') : move.point}`,
                    )
                    .join(' → ')}
                </div>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
