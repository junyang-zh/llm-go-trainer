import type { Game, ProviderAvailability } from '../shared/types';
import type { CoachLimits } from '../shared/llm';
import artifacts from '../config/katago/artifacts.json';
import recommendations from '../config/katago/models.json';
import type { ModelEntry } from '../shared/models';
import { t, catalogs, type MessageKey } from './i18n';

const availabilityKeys: Record<ProviderAvailability['state'], MessageKey> = {
  ready: 'providerReady',
  unconfigured: 'notConfigured',
  missing: 'providerMissing',
  unauthenticated: 'providerUnauthenticated',
  unreachable: 'providerUnreachable',
  'model-unavailable': 'providerModelUnavailable',
};
export function availabilityLabel(value?: ProviderAvailability) {
  return t(value ? availabilityKeys[value.state] : 'checking');
}
const effortKeys: Record<string, MessageKey> = {
  default: 'effortDefault',
  none: 'effortNone',
  low: 'effortLow',
  medium: 'effortMedium',
  high: 'effortHigh',
  xhigh: 'effortXhigh',
  max: 'effortMax',
  ultra: 'effortUltra',
};
export const effortLabel = (value: string) => (effortKeys[value] ? t(effortKeys[value]) : value);
const limitKeys: Record<keyof CoachLimits, MessageKey> = {
  timeoutSeconds: 'limitTimeoutSeconds',
  toolCalls: 'limitToolCalls',
  searchVisits: 'limitSearchVisits',
};
export const limitLabel = (value: keyof CoachLimits) => t(limitKeys[value]);
// Only generated labels change language. User-supplied player and game names stay intact.
export function displayGameTitle(game: Game) {
  return (
    game.metadata.GN ||
    t('defaultGameTitle', {
      black: game.metadata.PB || t('blackPlayer'),
      white: game.metadata.PW || t('whitePlayer'),
      size: game.size,
    })
  ).slice(0, 200);
}

const modelNameKeys = new Map<string, MessageKey>([
  [artifacts.main.sha256, 'modelNameBalanced'],
  [artifacts.human.sha256, 'modelNameHuman'],
  ...recommendations.flatMap((model): [string, MessageKey][] =>
    model.tier === 'light'
      ? [[model.id, 'modelNameLight']]
      : model.tier === 'advanced'
        ? [[model.id, 'modelNameAdvanced']]
        : [],
  ),
]);
export function displayModelName(model: Pick<ModelEntry, 'id' | 'name'>) {
  const key = modelNameKeys.get(model.id);
  // An explicitly renamed/custom model retains the user's own name.
  return key && model.name === catalogs['zh-CN'][key] ? t(key) : model.name;
}
