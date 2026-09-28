// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchLimitSettings } from '../src/SearchLimitSettings';
import { restoreSearchSettings, searchSettingsKey, searchStatsLabel } from '../src/search-stats';
import { trainingForRank } from '../shared/training';
import { evaluation } from './fixtures/evaluation';

afterEach(() => localStorage.clear());
it('restores valid limits and discards corrupt or unsafe settings', () => {
  localStorage.setItem(
    searchSettingsKey,
    JSON.stringify({ visits: 12345, searchLimit: 'time', maxTime: 2.5 }),
  );
  expect(restoreSearchSettings()).toEqual({ visits: 12345, searchLimit: 'time', maxTime: 2.5 });
  localStorage.setItem(
    searchSettingsKey,
    JSON.stringify({ visits: -1, searchLimit: 'bad', maxTime: 10000 }),
  );
  expect(restoreSearchSettings()).toEqual({ visits: 400, searchLimit: 'visits', maxTime: 5 });
  localStorage.setItem(searchSettingsKey, 'null');
  expect(restoreSearchSettings().visits).toBe(400);
});
it('shows actual counts without inventing a speed when timing is unavailable', () => {
  const analysis = evaluation(0, 1234);
  expect(searchStatsLabel(analysis)).toBe('搜索 1,234 次');
  expect(
    searchStatsLabel({ ...analysis, searchStats: { elapsedMs: 2000, visitsPerSecond: 617 } }),
  ).toBe('搜索 1,234 次 · 617 次/秒');
  expect(searchStatsLabel()).toBe('');
});
it('switches between visits and seconds without discarding the saved values', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  const training = { ...trainingForRank('5k'), visits: 1234, maxTime: 2.5 };
  try {
    await act(async () =>
      root.render(<SearchLimitSettings training={training} onChange={onChange} />),
    );
    expect(host.querySelector('input')?.value).toBe('1234');
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'time';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ searchLimit: 'time' });
    await act(async () =>
      root.render(
        <SearchLimitSettings training={{ ...training, searchLimit: 'time' }} onChange={onChange} />,
      ),
    );
    expect(host.textContent).toContain('时间上限（秒）');
    expect(host.querySelector('input')?.value).toBe('2.5');
  } finally {
    await act(async () => root.unmount());
  }
});
