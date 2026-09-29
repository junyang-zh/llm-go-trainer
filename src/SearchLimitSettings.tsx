import { t } from './i18n';
import type { Training } from '../shared/types';

export function SearchLimitSettings({
  training,
  onChange,
}: {
  training: Training;
  onChange: (value: Partial<Training>) => void;
}) {
  const timed = training.searchLimit === 'time';
  const min = timed ? 0.1 : 50,
    max = timed ? 120 : 1000000;
  const value = timed ? (training.maxTime ?? 5) : training.visits;
  const update = (number: number) => onChange(timed ? { maxTime: number } : { visits: number });
  return (
    <>
      <label>
        {t('searchLimit')}
        <select
          value={training.searchLimit ?? 'visits'}
          onChange={(event) => onChange({ searchLimit: event.target.value as 'time' | 'visits' })}
        >
          <option value="visits">{t('byVisits')}</option>
          <option value="time">{t('byTime')}</option>
        </select>
      </label>
      <label>
        {timed ? t('timeLimitSeconds') : t('searchVisits')}
        <input
          key={timed ? 'time' : 'visits'}
          type="number"
          min={min}
          max={max}
          step={timed ? 0.1 : 1}
          defaultValue={value}
          onChange={(event) => {
            const n = event.target.valueAsNumber;
            if (Number.isFinite(n) && n >= min && n <= max && (timed || Number.isInteger(n)))
              update(n);
          }}
          onBlur={(event) => {
            let n = event.target.valueAsNumber;
            n = Number.isFinite(n)
              ? Math.max(min, Math.min(max, timed ? n : Math.round(n)))
              : value;
            event.target.value = String(n);
            update(n);
          }}
        />
      </label>
    </>
  );
}
