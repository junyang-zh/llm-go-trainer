import type { Provider, ProviderAvailability } from './types';
export const providerNames: Record<Provider, string> = {
  deepseek: 'DeepSeek',
  codex: 'Codex CLI',
  claude: 'Claude Code',
};
export const effortOptions = {
  deepseek: ['default', 'none', 'low', 'high', 'max'],
  codex: ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
} as const;
export const effortLabels: Record<string, string> = {
  default: '模型默认',
  none: '关闭',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '更高',
  max: '最高',
  ultra: '超高',
};
export function availabilityLabel(value?: ProviderAvailability) {
  if (!value) return '检测中';
  return {
    ready: '可用',
    unconfigured: '未配置',
    missing: '未安装',
    unauthenticated: '认证失败',
    unreachable: '无法连接',
    'model-unavailable': '模型不可用',
  }[value.state];
}

// One allowance per request or explicit continuation; 0 means unlimited.
export const coachLimitFields = {
  timeoutSeconds: { label: '最长用时（秒）', min: 10, max: 3600 },
  toolCalls: { label: '工具调用次数', min: 1, max: 200 },
  searchVisits: { label: '累计搜索量（visits）', min: 4000, max: 1000000 },
} as const;
export type CoachLimits = { [K in keyof typeof coachLimitFields]: number };
export const defaultCoachLimits: CoachLimits = {
  timeoutSeconds: 0,
  toolCalls: 0,
  searchVisits: 0,
};
