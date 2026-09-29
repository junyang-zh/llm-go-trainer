import { t } from './i18n';
import { useState, type CSSProperties } from 'react';

interface Props {
  turn: number;
  historyTurn: number;
  historyLength: number;
  trialLength?: number;
  disabled: boolean;
  navigate: (turn: number) => void;
}

export function MoveTimeline({
  turn,
  historyTurn,
  historyLength,
  trialLength,
  disabled,
  navigate,
}: Props) {
  const trial = trialLength !== undefined;
  const end = trial ? historyTurn + trialLength : turn;
  const total = Math.max(historyLength, end, 1);
  const limit = trial ? end : Math.max(historyLength, 1);
  // Even when a gesture crosses back into history, keep its coordinate scale until release.
  const [gesture, setGesture] = useState<{ total: number; limit: number } | null>(null);
  const scale = gesture ?? { total, limit };
  return (
    <div
      className={`timeline-control${trial ? ' trial' : ''}`}
      style={
        {
          '--history-progress': `${(historyTurn / scale.total) * 100}%`,
          '--trial-progress': `${(turn / scale.total) * 100}%`,
          '--trial-end': `${(end / scale.total) * 100}%`,
          '--timeline-reachable': scale.limit / scale.total,
        } as CSSProperties
      }
    >
      <input
        className="timeline"
        aria-label={t('reviewMove')}
        aria-valuetext={
          trial
            ? t('moveTrialStartingAtMove', {
                v0: turn,
                v1: turn - historyTurn,
                v2: trialLength,
                v3: historyTurn,
              })
            : t('moveOf', { v0: turn, v1: historyLength })
        }
        type="range"
        min="0"
        max={scale.limit}
        value={turn}
        disabled={disabled}
        onPointerDown={() => setGesture({ total, limit })}
        onPointerUp={() => setGesture(null)}
        onPointerCancel={() => setGesture(null)}
        onBlur={() => setGesture(null)}
        onChange={(e) => navigate(+e.target.value)}
      />
    </div>
  );
}
