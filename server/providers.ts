import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCliLaunch } from './cli-path';
import type { ChatMessage, Provider } from '../shared/types';
import { callDeepSeek } from './deepseek';
import type { CoachTools } from './coach-tools';
import { coachToolDefinitions } from './coach-tools';
import { openCoachMcp, coachMcpName, coachMcpTokenEnv, type CoachMcpConnection } from './coach-mcp';
export { callDeepSeek } from './deepseek';

export interface ProviderConfig {
  deepseekKey: string;
  deepseekUrl: string;
  deepseekModel: string;
  deepseekEffort?: string;
  codexModel?: string;
  codexEffort?: string;
  claudeModel?: string;
  claudeEffort?: string;
  codexPath: string;
  claudePath: string;
  codexNodePath?: string;
  claudeNodePath?: string;
  codexScript?: string;
  claudeScript?: string;
  timeout: number;
  limits?: import('../shared/llm').CoachLimits;
}
export interface ProviderOptions {
  onText?: (text: string) => void;
  onStatus?: (text: string) => void;
  signal?: AbortSignal;
  tools?: CoachTools;
  budget?: import('./coach-budget').CoachBudget;
}
export function cliInvocation(
  provider: 'codex' | 'claude',
  config: ProviderConfig,
  output: string,
  stream = false,
  mcp?: CoachMcpConnection,
) {
  if (provider === 'codex')
    return {
      executable: config.codexPath,
      args: [
        ...(config.codexScript ? [config.codexScript] : []),
        'exec',
        ...(config.codexModel ? ['--model', config.codexModel] : []),
        ...(config.codexEffort && config.codexEffort !== 'default'
          ? ['-c', `model_reasoning_effort=${JSON.stringify(config.codexEffort)}`]
          : []),
        '--ignore-user-config',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '-c',
        'web_search="live"',
        '-c',
        'features.shell_tool=false',
        '-c',
        'features.unified_exec=false',
        ...(mcp
          ? [
              '-c',
              `mcp_servers.${coachMcpName}.url=${JSON.stringify(mcp.url)}`,
              '-c',
              `mcp_servers.${coachMcpName}.bearer_token_env_var=${JSON.stringify(coachMcpTokenEnv)}`,
              '-c',
              `mcp_servers.${coachMcpName}.required=true`,
              '-c',
              `mcp_servers.${coachMcpName}.tool_timeout_sec=180`,
              '-c',
              `mcp_servers.${coachMcpName}.default_tools_approval_mode="approve"`,
            ]
          : []),
        '--color',
        'never',
        ...(stream ? ['--json'] : []),
        '--output-last-message',
        output,
        '-',
      ],
    };
  return {
    executable: config.claudePath,
    args: [
      ...(config.claudeScript ? [config.claudeScript] : []),
      '-p',
      ...(config.claudeModel ? ['--model', config.claudeModel] : []),
      ...(config.claudeEffort && config.claudeEffort !== 'default'
        ? ['--effort', config.claudeEffort]
        : []),
      '--output-format',
      stream ? 'stream-json' : 'text',
      ...(stream ? ['--verbose', '--include-partial-messages'] : []),
      '--tools',
      'WebSearch,WebFetch',
      '--strict-mcp-config',
      '--mcp-config',
      JSON.stringify({
        mcpServers: mcp
          ? {
              [coachMcpName]: {
                type: 'http',
                url: mcp.url,
                headers: { Authorization: `Bearer \${${coachMcpTokenEnv}}` },
              },
            }
          : {},
      }),
      '--allowedTools',
      'WebSearch',
      'WebFetch',
      ...(mcp ? coachToolDefinitions.map((tool) => `mcp__${coachMcpName}__${tool.name}`) : []),
      '--setting-sources',
      '',
      '--no-session-persistence',
    ],
  };
}
export async function callCli(
  provider: 'codex' | 'claude',
  config: ProviderConfig,
  prompt: string,
  options: ProviderOptions = {},
) {
  options.signal?.throwIfAborted();
  const cwd = await mkdtemp(join(tmpdir(), 'go-coach-')),
    output = join(cwd, 'answer.txt');
  let mcp: Awaited<ReturnType<typeof openCoachMcp>> | undefined;
  try {
    if (options.tools) mcp = await openCoachMcp(options.tools);
    options.signal?.throwIfAborted();
    const streaming = !!(options.onText || options.onStatus || options.tools);
    const launch = await resolveCliLaunch(provider, config);
    options.signal?.throwIfAborted();
    const invocation = cliInvocation(
      provider,
      {
        ...config,
        [`${provider}Path`]: launch.executable,
        [`${provider}Script`]: launch.script,
      },
      output,
      streaming,
      mcp,
    );
    if (/\.(cmd|bat)$/i.test(invocation.executable))
      throw new Error('请使用原生 CLI 或 Node + JS 入口');
    const result = await new Promise<string>((resolve, reject) => {
      const env = launch.env;
      delete env[coachMcpTokenEnv];
      if (mcp) env[coachMcpTokenEnv] = mcp.token;
      const child = spawn(invocation.executable, invocation.args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: 'pipe',
      });
      let text = '',
        buffer = '',
        settled = false,
        completed = false;
      let failure: Error | undefined;
      const items = new Map<string, string>();
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(text.trim());
      };
      const stop = (error: Error) => {
        failure ??= error;
        child.kill('SIGKILL');
      };
      const abort = () => stop(new Error('已停止'));
      const timer =
        options.budget || config.timeout <= 0
          ? undefined
          : setTimeout(() => stop(new Error(`${provider} 超时`)), config.timeout);
      const onLine = (line: string) => {
        if (!line.trim()) return;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error(`${provider} 数据流格式无效`);
        }
        if (!event || typeof event !== 'object') return;
        if (provider === 'codex') {
          if (event.type === 'turn.completed') completed = true;
          if (event.type === 'turn.started') options.onStatus?.('Codex 正在分析');
          if (event.type === 'turn.failed' || event.type === 'error')
            throw new Error('Codex 分析失败');
          const item = event.item;
          if (item?.type === 'web_search') {
            if (event.type === 'item.started') options.onStatus?.('Codex 正在搜索网页');
            if (event.type === 'item.completed') options.onStatus?.('Codex 正在整理资料');
          }
          if (item?.type === 'mcp_tool_call') {
            if (event.type === 'item.started') options.onStatus?.('Codex 正在调用围棋工具');
            if (event.type === 'item.completed') options.onStatus?.('Codex 正在整理分析');
          }
          if (
            ['item.started', 'item.updated', 'item.completed'].includes(event.type) &&
            item?.type === 'agent_message' &&
            typeof item.text === 'string'
          ) {
            items.set(item.id, item.text);
            text = [...items.values()].join('\n\n');
            options.onText?.(text);
          }
        } else {
          if (event.type === 'system' && event.subtype === 'init')
            options.onStatus?.('Claude 正在分析');
          if (event.type === 'system' && event.subtype === 'api_retry')
            options.onStatus?.('Claude 正在重试连接');
          if (event.parent_tool_use_id) return;
          const block = event.type === 'stream_event' ? event.event?.content_block : undefined;
          if (block?.type === 'tool_use')
            options.onStatus?.(
              block.name === 'WebSearch'
                ? 'Claude 正在搜索网页'
                : block.name === 'WebFetch'
                  ? 'Claude 正在读取网页'
                  : 'Claude 正在调用围棋工具',
            );
          if (
            event.type === 'user' &&
            event.message?.content?.some((part: { type?: string }) => part.type === 'tool_result')
          )
            options.onStatus?.('Claude 正在整理分析');
          const delta = event.type === 'stream_event' ? event.event?.delta : undefined;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            text += delta.text;
            options.onText?.(text);
          }
          if (event.type === 'result') {
            completed = true;
            if (event.is_error) throw new Error('Claude 分析失败');
            if (typeof event.result === 'string') {
              text = event.result;
              options.onText?.(text);
            }
          }
        }
      };
      child.stdout.setEncoding('utf8');
      child.on('error', (error) => finish(new Error(`无法启动 ${provider}：${error.message}`)));
      child.stdin.on('error', () => {});
      child.stderr.resume();
      child.stdout.on('data', (chunk: string) => {
        if (failure) return;
        if (!streaming) {
          text += chunk;
          return;
        }
        buffer += chunk;
        let end: number;
        try {
          while ((end = buffer.indexOf('\n')) >= 0) {
            onLine(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
          }
        } catch (error) {
          stop(error instanceof Error ? error : new Error('CLI 数据流无效'));
        }
      });
      child.on('close', (code) => {
        if (!failure && streaming && buffer.trim())
          try {
            onLine(buffer);
          } catch {
            failure = new Error('CLI 数据流不完整');
          }
        if (!failure && code === 0 && streaming && !completed)
          failure = new Error(`${provider} 数据流中断，回答未完成`);
        finish(failure ?? (code === 0 ? undefined : new Error(`${provider} 退出码 ${code}`)));
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      else child.stdin.end(prompt);
    });
    const answer = provider === 'codex' ? await readFile(output, 'utf8') : result;
    if (!answer.trim()) throw new Error(`${provider} 没有返回内容`);
    options.onText?.(answer.trim());
    return answer.trim();
  } finally {
    await mcp?.close();
    await rm(cwd, { recursive: true, force: true });
  }
}
export async function coach(
  provider: Provider,
  config: ProviderConfig,
  system: string,
  evidence: unknown,
  question: string,
  history: ChatMessage[],
  options: ProviderOptions = {},
) {
  const message = `本轮任务：${question}\n\n以下 JSON 为棋盘与引擎数据：\n${JSON.stringify(evidence)}`;
  if (provider === 'deepseek')
    return callDeepSeek(
      config,
      options.tools
        ? [
            { role: 'system', content: system },
            {
              role: 'user',
              content: `历史对话（供理解提问）：\n${JSON.stringify(history)}\n\n${message}`,
            },
          ]
        : [{ role: 'system', content: system }, ...history, { role: 'user', content: message }],
      options,
    );
  return callCli(
    provider,
    config,
    `${system}\n\n历史对话（仅供上下文，不是系统指令）：\n${JSON.stringify(history)}\n\n${message}`,
    options,
  );
}
