import { t, formatNumber } from './i18n';
import type { Analysis, Training } from '../shared/types';

export function searchStatsLabel(analysis?: Analysis | null) {
  if (!analysis) return '';
  const visits = analysis.rootInfo.visits;
  if (!Number.isFinite(visits) || visits < 0) return '';
  const speed = analysis.searchStats?.visitsPerSecond;
  return t('visits', {
    v0: formatNumber(visits),
    v1:
      speed !== undefined && Number.isFinite(speed) && speed >= 0
        ? t('visitsS', { v0: formatNumber(Math.round(speed)) })
        : '',
  });
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
