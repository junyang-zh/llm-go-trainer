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
        搜索限制
        <select
          value={training.searchLimit ?? 'visits'}
          onChange={(event) => onChange({ searchLimit: event.target.value as 'time' | 'visits' })}
        >
          <option value="visits">按次数</option>
          <option value="time">按时间</option>
        </select>
      </label>
      <label>
        {timed ? '时间上限（秒）' : '搜索次数'}
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
