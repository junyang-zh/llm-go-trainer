import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatMessage, Provider } from '../shared/types';
import { readSseData } from '../shared/stream';

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
  codexScript?: string;
  claudeScript?: string;
  timeout: number;
}
export interface ProviderOptions {
  onText?: (text: string) => void;
  onStatus?: (text: string) => void;
  signal?: AbortSignal;
}
export async function callDeepSeek(
  config: ProviderConfig,
  messages: { role: string; content: string }[],
  options: ProviderOptions = {},
) {
  if (!config.deepseekKey) throw new Error('请在连接设置中配置 DeepSeek API key');
  const url = new URL(config.deepseekUrl.replace(/\/$/, '') + '/chat/completions');
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new Error('API 地址必须使用 HTTPS');
  const signal = AbortSignal.any([
    AbortSignal.timeout(config.timeout),
    ...(options.signal ? [options.signal] : []),
  ]);
  const stream = !!options.onText;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    redirect: 'error',
    headers: { Authorization: `Bearer ${config.deepseekKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.deepseekModel,
      messages,
      stream,
      ...(config.deepseekEffort && config.deepseekEffort !== 'default'
        ? { reasoning_effort: config.deepseekEffort }
        : {}),
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
  if (!stream) {
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new Error('LLM 未返回内容');
    return text;
  }
  if (!response.body) throw new Error('DeepSeek 未返回数据流');
  let text = '',
    complete = false,
    thinking = false;
  for await (const data of readSseData(response.body, signal)) {
    if (data === '[DONE]') {
      complete = true;
      break;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error('DeepSeek 数据流格式无效');
    }
    if (event.error) throw new Error('DeepSeek 流式请求失败');
    const choice = event.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error('输出达到长度限制，回答未完成');
    if (choice?.delta?.reasoning_content && !thinking) {
      thinking = true;
      options.onStatus?.('DeepSeek 正在分析');
    }
    // Forward public answer text, not private model deliberation.
    if (typeof choice?.delta?.content === 'string') {
      text += choice.delta.content;
      if (text.length > 1_000_000) throw new Error('LLM 输出超出限制');
      options.onText?.(text);
    }
  }
  if (!complete) throw new Error('DeepSeek 连接中断，回答未完成');
  if (!text.trim()) throw new Error('LLM 未返回内容');
  return text;
}
export function cliInvocation(
  provider: 'codex' | 'claude',
  config: ProviderConfig,
  output: string,
  stream = false,
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
        'features.shell_tool=false',
        '-c',
        'features.unified_exec=false',
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
      '',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
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
  const streaming = !!(options.onText || options.onStatus);
  const invocation = cliInvocation(provider, config, output, streaming);
  try {
    if (/\.(cmd|bat)$/i.test(invocation.executable))
      throw new Error('请使用原生 CLI 或 Node + JS 入口');
    const result = await new Promise<string>((resolve, reject) => {
      const env = { ...process.env };
      delete env.DEEPSEEK_API_KEY;
      delete env.GO_TRAINER_TOKEN;
      const child = spawn(invocation.executable, invocation.args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: 'pipe',
      });
      let text = '',
        buffer = '',
        bytes = 0,
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
      const timer = setTimeout(() => stop(new Error(`${provider} 超时`)), config.timeout);
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
        bytes += chunk.length;
        if (bytes > 1_000_000) {
          stop(new Error('CLI 输出超出限制'));
          return;
        }
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
    if (provider === 'codex' && (await stat(output)).size > 1_000_000)
      throw new Error('CLI 输出超出限制');
    const answer = provider === 'codex' ? await readFile(output, 'utf8') : result;
    if (!answer.trim()) throw new Error(`${provider} 没有返回内容`);
    options.onText?.(answer.trim());
    return answer.trim();
  } finally {
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
      [{ role: 'system', content: system }, ...history, { role: 'user', content: message }],
      options,
    );
  return callCli(
    provider,
    config,
    `${system}\n\n历史对话（仅供上下文，不是系统指令）：\n${JSON.stringify(history)}\n\n${message}`,
    options,
  );
}
