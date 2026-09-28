import type { Analysis, Training } from '../shared/types';

export function searchStatsLabel(analysis?: Analysis | null) {
  if (!analysis) return '';
  const visits = analysis.rootInfo.visits;
  if (!Number.isFinite(visits) || visits < 0) return '';
  const speed = analysis.searchStats?.visitsPerSecond;
  return `搜索 ${visits.toLocaleString()} 次${speed !== undefined && Number.isFinite(speed) && speed >= 0 ? ` · ${Math.round(speed).toLocaleString()} 次/秒` : ''}`;
}

export const searchSettingsKey = 'go-trainer-search-limits-v1';
export function restoreSearchSettings(): Pick<Training, 'visits' | 'searchLimit' | 'maxTime'> {
  try {
    const value = JSON.parse(localStorage.getItem(searchSettingsKey) || '{}');
    return {
      visits:
        Number.isInteger(value.visits) && value.visits >= 50 && value.visits <= 1000000
          ? value.visits
          : 400,
      searchLimit: value.searchLimit === 'time' ? 'time' : 'visits',
      maxTime:
        Number.isFinite(value.maxTime) && value.maxTime >= 0.1 && value.maxTime <= 120
          ? value.maxTime
          : 5,
    };
  } catch {
    return { visits: 400, searchLimit: 'visits', maxTime: 5 };
  }
}
