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
