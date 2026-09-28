import { readSseData } from '../shared/stream';
import { coachToolDefinitions } from './coach-tools';
import type { ProviderConfig, ProviderOptions } from './providers';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export async function callDeepSeek(
  config: ProviderConfig,
  initial: Message[],
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
  const messages = [...initial];
  let prefix = '';
  for (let round = 0; round <= 8; round++) {
    signal.throwIfAborted();
    options.onStatus?.(round ? 'DeepSeek 正在整理工具结果' : 'DeepSeek 正在分析');
    const stream = !!options.onText;
    const useTools = !!options.tools?.available && round < 8;
    const response = await fetch(url, {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${config.deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages,
        stream,
        ...(useTools
          ? {
              tools: coachToolDefinitions.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              })),
            }
          : {}),
        ...(config.deepseekEffort && config.deepseekEffort !== 'default'
          ? { reasoning_effort: config.deepseekEffort }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
    let content = '',
      reasoning = '',
      finish: string | undefined;
    let calls: ToolCall[] = [];
    if (!stream) {
      const data = await response.json();
      const choice = data.choices?.[0];
      content = choice?.message?.content ?? '';
      reasoning = choice?.message?.reasoning_content ?? '';
      calls = choice?.message?.tool_calls ?? [];
      finish = choice?.finish_reason;
    } else {
      if (!response.body) throw new Error('DeepSeek 未返回数据流');
      let complete = false,
        outputCharacters = 0;
      const append = (current: string, fragment: string) => {
        // Tiny token chunks repeat a large JSON envelope. Only generated content
        // counts toward this limit; otherwise ordinary long thinking is rejected.
        outputCharacters += fragment.length;
        if (outputCharacters > 2_000_000) throw new Error('DeepSeek 输出超出限制');
        return current + fragment;
      };
      const pending = new Map<number, ToolCall>();
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
        if (choice?.finish_reason) finish = choice.finish_reason;
        const delta = choice?.delta;
        if (typeof delta?.reasoning_content === 'string')
          reasoning = append(reasoning, delta.reasoning_content);
        if (typeof delta?.content === 'string') {
          content = append(content, delta.content);
          options.onText?.(prefix + content);
        }
        for (const part of delta?.tool_calls ?? []) {
          if (!Number.isInteger(part.index) || part.index < 0 || part.index >= 12)
            throw new Error('DeepSeek 工具调用格式无效');
          const call = pending.get(part.index) ?? {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
          if (part.id) call.id = part.id;
          if (typeof part.function?.name === 'string')
            call.function.name = append(call.function.name, part.function.name);
          if (typeof part.function?.arguments === 'string')
            call.function.arguments = append(call.function.arguments, part.function.arguments);
          pending.set(part.index, call);
        }
      }
      if (!complete) throw new Error('DeepSeek 连接中断，回答未完成');
      calls = [...pending.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    }
    if (finish === 'length') throw new Error('输出达到长度限制，回答未完成');
    if (finish && !['stop', 'tool_calls'].includes(finish)) throw new Error('DeepSeek 回答未完成');
    if (typeof content !== 'string' || typeof reasoning !== 'string' || !Array.isArray(calls))
      throw new Error('DeepSeek 响应格式无效');
    if (!calls.length) {
      if (finish === 'tool_calls' || !content.trim()) throw new Error('LLM 未返回内容');
      return content.trim();
    }
    if (
      !useTools ||
      !options.tools ||
      calls.length > 12 ||
      new Set(calls.map((call) => call.id)).size !== calls.length
    )
      throw new Error('DeepSeek 工具调用超出本次范围');
    for (const call of calls) {
      if (
        call.type !== 'function' ||
        !call.id ||
        typeof call.function?.name !== 'string' ||
        typeof call.function?.arguments !== 'string' ||
        call.function.arguments.length > 24000
      )
        throw new Error('DeepSeek 工具调用格式无效');
    }
    // DeepSeek needs the reasoning field replayed between tool rounds; it stays server-side.
    messages.push({ role: 'assistant', content, reasoning_content: reasoning, tool_calls: calls });
    if (content) prefix += content + '\n\n';
    for (const call of calls) {
      signal.throwIfAborted();
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = call.function.arguments;
      }
      const result = await options.tools.run(call.function.name, args, call.id, signal);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.data) });
    }
  }
  throw new Error('讲解未完成');
}
