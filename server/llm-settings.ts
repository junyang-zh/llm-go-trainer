import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LlmSettingsView, LlmStatus, Provider, ProviderAvailability } from '../shared/types';
import type { ProviderConfig } from './providers';
import { coachLimitFields, defaultCoachLimits, effortOptions } from '../shared/llm';
import { modelCatalog } from './model-catalog';
import { resolveCliLaunch, expandCliPath } from './cli-path';

export function apiBaseUrl(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new Error('API 地址需要 HTTPS 或本机 HTTP，不能包含凭据或查询参数');
  return url.href.replace(/\/+$/, '');
}
const baseUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .transform((value, context) => {
    try {
      return apiBaseUrl(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'API 地址无效' });
      return z.NEVER;
    }
  });
const cliPath = z
  .string()
  .trim()
  .max(4096)
  .refine((value) => !/[\x00-\x1f\x7f]/.test(value), '路径不能包含控制字符')
  .refine(
    (value) => !value || isAbsolute(expandCliPath(value)) || /^[\w.-]+$/.test(value),
    '请填写绝对路径或命令名',
  )
  .refine((value) => !/\.(cmd|bat)$/i.test(value), '请使用原生 CLI 或 Node + JS 入口');
export const llmUpdateSchema = z
  .object({
    limits: z
      .object({
        timeoutSeconds: z
          .number()
          .int()
          .min(coachLimitFields.timeoutSeconds.min)
          .max(coachLimitFields.timeoutSeconds.max)
          .or(z.literal(0)),
        toolCalls: z
          .number()
          .int()
          .min(coachLimitFields.toolCalls.min)
          .max(coachLimitFields.toolCalls.max)
          .or(z.literal(0)),
        searchVisits: z
          .number()
          .int()
          .min(coachLimitFields.searchVisits.min)
          .max(coachLimitFields.searchVisits.max)
          .or(z.literal(0)),
      })
      .strict()
      .partial()
      .optional(),
    preference: z.enum(['auto', 'deepseek', 'codex', 'claude']).optional(),
    deepseek: z
      .object({
        apiKey: z
          .string()
          .trim()
          .min(1)
          .max(4096)
          .refine((value) => !/[\r\n]/.test(value))
          .nullable()
          .optional(),
        baseUrl: baseUrl.optional(),
        model: z.string().trim().min(1).max(200).optional(),
        effort: z.enum(effortOptions.deepseek).optional(),
      })
      .strict()
      .optional(),
    codex: z
      .object({
        path: cliPath.optional(),
        nodePath: cliPath.optional(),
        model: z.string().trim().max(200).optional(),
        effort: z.enum(effortOptions.codex).optional(),
      })
      .strict()
      .optional(),
    claude: z
      .object({
        path: cliPath.optional(),
        nodePath: cliPath.optional(),
        model: z.string().trim().max(200).optional(),
        effort: z.enum(effortOptions.claude).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
type Saved = z.infer<typeof llmUpdateSchema>;
type Availability = Record<Provider, ProviderAvailability>;
type Probe = (config: ProviderConfig, signal: AbortSignal) => Promise<Availability>;
const state = (value: ProviderAvailability['state']): ProviderAvailability => ({
  available: value === 'ready',
  state: value,
});
async function cliStatus(
  provider: 'codex' | 'claude',
  config: ProviderConfig,
  signal: AbortSignal,
) {
  let launch;
  try {
    launch = await resolveCliLaunch(provider, config);
  } catch {
    return state('missing');
  }
  const { executable, script, env } = launch;
  const args = [
    ...(script ? [script] : []),
    ...(provider === 'codex' ? ['login', 'status'] : ['auth', 'status']),
  ];
  // Capture no login output in responses or logs: it can contain account information.
  return new Promise<ProviderAvailability>((resolve) => {
    const child = execFile(
      executable,
      args,
      {
        env,
        shell: false,
        windowsHide: true,
        timeout: 4000,
        killSignal: 'SIGKILL',
        maxBuffer: 16384,
        signal,
      },
      (error) => resolve(state(error ? 'unauthenticated' : 'ready')),
    );
    child.stdin?.end();
  });
}
async function deepseekStatus(config: ProviderConfig, signal: AbortSignal) {
  if (!config.deepseekKey) return state('unconfigured');
  try {
    const response = await fetch(apiBaseUrl(config.deepseekUrl) + '/models', {
      headers: { Authorization: `Bearer ${config.deepseekKey}` },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return state([401, 403].includes(response.status) ? 'unauthenticated' : 'unreachable');
    }
    const body = (await response.json()) as { data?: { id?: string }[] };
    return state(
      Array.isArray(body.data) && body.data.some((model) => model.id === config.deepseekModel)
        ? 'ready'
        : 'model-unavailable',
    );
  } catch {
    return state('unreachable');
  }
}
export const probeProviders: Probe = async (config, signal) => {
  const [deepseek, codex, claude] = await Promise.all([
    deepseekStatus(config, signal),
    cliStatus('codex', config, signal),
    cliStatus('claude', config, signal),
  ]);
  return { deepseek, codex, claude };
};
export class LlmSettings {
  private saved: Saved = {};
  private error?: string;
  private version = 0;
  private cache?: { version: number; expires: number; value: Promise<Availability> };
  private transition: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  constructor(
    private defaults: ProviderConfig,
    private file?: string,
    private probe: Probe = probeProviders,
  ) {}
  async load() {
    if (!this.file) return;
    try {
      this.saved = llmUpdateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = '本地 LLM 配置读取失败';
    }
  }
  private config(saved = this.saved): ProviderConfig {
    return {
      ...this.defaults,
      limits: {
        ...defaultCoachLimits,
        ...this.defaults.limits,
        timeoutSeconds: this.defaults.timeout / 1000,
        ...saved.limits,
      },
      timeout:
        saved.limits?.timeoutSeconds !== undefined
          ? saved.limits.timeoutSeconds * 1000
          : this.defaults.timeout,
      deepseekKey: saved.deepseek?.apiKey ?? this.defaults.deepseekKey,
      deepseekUrl: saved.deepseek?.baseUrl ?? this.defaults.deepseekUrl,
      deepseekModel: saved.deepseek?.model ?? this.defaults.deepseekModel,
      deepseekEffort: saved.deepseek?.effort ?? this.defaults.deepseekEffort,
      codexModel: saved.codex?.model ?? this.defaults.codexModel,
      codexEffort: saved.codex?.effort ?? this.defaults.codexEffort,
      codexPath: saved.codex?.path || this.defaults.codexPath,
      codexNodePath:
        saved.codex?.nodePath ||
        this.defaults.codexNodePath ||
        (this.defaults.codexScript ? this.defaults.codexPath : undefined),
      codexScript: saved.codex?.path ? undefined : this.defaults.codexScript,
      claudeModel: saved.claude?.model ?? this.defaults.claudeModel,
      claudeEffort: saved.claude?.effort ?? this.defaults.claudeEffort,
      claudePath: saved.claude?.path || this.defaults.claudePath,
      claudeNodePath:
        saved.claude?.nodePath ||
        this.defaults.claudeNodePath ||
        (this.defaults.claudeScript ? this.defaults.claudePath : undefined),
      claudeScript: saved.claude?.path ? undefined : this.defaults.claudeScript,
    };
  }
  private async snapshot() {
    const saved = this.saved,
      config = this.config(saved);
    if (!this.cache || this.cache.version !== this.version || this.cache.expires < Date.now())
      this.cache = {
        version: this.version,
        expires: Date.now() + 30000,
        value: this.probe(config, this.abort.signal),
      };
    const providers = await this.cache.value;
    const preference = saved.preference ?? 'auto';
    const selected =
      preference === 'auto'
        ? ((['deepseek', 'codex', 'claude'] as const).find(
            (provider) => providers[provider].available,
          ) ?? null)
        : preference;
    const status: LlmStatus = {
      preference,
      selected,
      providers,
      ...(this.error ? { error: this.error } : {}),
    };
    return { saved, config, status };
  }
  async status(): Promise<LlmStatus> {
    return (await this.snapshot()).status;
  }
  async view(): Promise<LlmSettingsView> {
    const { saved, config, status } = await this.snapshot();
    return {
      ...status,
      limits: config.limits!,
      models: await modelCatalog(),
      codex: {
        model: config.codexModel || '',
        effort: config.codexEffort || 'default',
        path: saved.codex?.path || '',
        nodePath: saved.codex?.nodePath || '',
        defaultPath: this.defaults.codexScript || this.defaults.codexPath,
        defaultNodePath:
          this.defaults.codexNodePath ||
          (this.defaults.codexScript ? this.defaults.codexPath : 'node'),
      },
      claude: {
        model: config.claudeModel || '',
        effort: config.claudeEffort || 'default',
        path: saved.claude?.path || '',
        nodePath: saved.claude?.nodePath || '',
        defaultPath: this.defaults.claudeScript || this.defaults.claudePath,
        defaultNodePath:
          this.defaults.claudeNodePath ||
          (this.defaults.claudeScript ? this.defaults.claudePath : 'node'),
      },
      deepseek: {
        baseUrl: config.deepseekUrl,
        model: config.deepseekModel,
        effort: config.deepseekEffort || 'default',
        keyConfigured: !!config.deepseekKey,
        keySource: saved.deepseek?.apiKey ? 'app' : config.deepseekKey ? 'env' : 'none',
      },
    };
  }
  async resolve(requested?: Provider) {
    const { status, config } = await this.snapshot();
    const provider = requested ?? status.selected;
    if (!provider || !status.providers[provider].available)
      throw new Error('LLM 不可用，请检查连接设置');
    return { provider, config };
  }
  refresh() {
    this.cache = undefined;
    return this.view();
  }
  update(input: unknown) {
    const patch = llmUpdateSchema.parse(input);
    const operation = this.transition.then(async () => {
      const next: Saved = {
        ...this.saved,
        ...patch,
        limits: { ...this.saved.limits, ...patch.limits },
        deepseek: { ...this.saved.deepseek, ...patch.deepseek },
        codex: { ...this.saved.codex, ...patch.codex },
        claude: { ...this.saved.claude, ...patch.claude },
      };
      const previous = this.config(),
        candidate = this.config(next);
      const catalog = await modelCatalog();
      for (const provider of ['codex', 'claude'] as const) {
        const model = catalog[provider].find((model) => model.id === candidate[`${provider}Model`]);
        const effort = candidate[`${provider}Effort`];
        if (
          model?.efforts.length &&
          effort &&
          effort !== 'default' &&
          !model.efforts.includes(effort)
        )
          throw new Error('该模型不支持所选思考深度');
      }
      if (
        candidate.deepseekKey &&
        new URL(candidate.deepseekUrl).origin !== new URL(previous.deepseekUrl).origin &&
        !patch.deepseek?.apiKey
      )
        throw new Error('更换 API 服务地址时，请重新填写 API key');
      if (this.file) {
        const temp = this.file + '.' + randomUUID() + '.tmp';
        try {
          await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
          await writeFile(temp, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
          if (process.platform !== 'win32') await chmod(temp, 0o600);
          await rename(temp, this.file);
        } catch {
          throw new Error('无法保存本地 LLM 配置');
        } finally {
          await rm(temp, { force: true }).catch(() => {});
        }
      }
      this.saved = next;
      this.error = undefined;
      this.version++;
      this.cache = undefined;
    });
    this.transition = operation.catch(() => {});
    return operation.then(() => this.view());
  }
  close() {
    this.abort.abort();
  }
}
