# LLM configuration

[English](llm.md) · [简体中文](../llm.md) · [繁體中文](../zh-TW/llm.md) · [日本語](../ja/llm.md) · [한국어](../ko/llm.md)

[README](../../README.en.md) · [User guide](usage.md)

Configure services in **Settings → Connect LLM**, or use `.env` defaults as described in [environment configuration](development.md#environment). Environment changes require a restart.

The main screen shows the current LLM and availability. Automatic selection tries DeepSeek, Codex, then Claude Code; manual selection fixes the provider. Availability is cached for 30 seconds; **Check connection** refreshes it immediately. DeepSeek checks authentication/model through `/models`; CLIs use `codex login status` and `claude auth status`.

Model and reasoning effort save separately per provider and apply to the next analysis. Codex reads the local CLI's public model cache and filters supported effort levels; without a cache, choose the CLI default or enter a model ID. Claude offers aliases/custom IDs; API models also accept custom IDs. Availability depends on the account/service.

## Agent workload limits

Expand **Agent workload limits** to set time (10–3600 seconds), tool calls (1–200) and total search visits (4,000–1,000,000) per round. All default to unlimited; blank fields remove limits, numbers enable them. Without a saved timeout, `LLM_TIMEOUT_MS` applies (default 0, unlimited).

Reaching any limit pauses execution, preserving text, tool results and trial branches, with a reason and **Continue** button. Continue adds a fresh round of budget using current settings while keeping the original question, board, provider and server-retained results. No LLM/search runs while paused. Continuing starts a new model request; interrupted private reasoning is not retained. Manual stop, disconnection and ordinary provider errors do not offer continuation.

Continuations live only in this app run's memory for 30 minutes, with at most eight recent tasks. Expiry/restart requires asking again. Completed text and trials remain in saved history.

## DeepSeek API

Enter/save an API key under DeepSeek. Environment defaults remain available:

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EFFORT=default
```

Reasoning effort maps off/low/high/maximum to `none/low/high/max`; model default omits `reasoning_effort`. The provider's default output budget applies; effort affects latency/usage. See [DeepSeek request parameters](https://api-docs.deepseek.com/api/create-chat-completion/).

In-app settings override environment values. **Remove local key** deletes the saved key and falls back to env. Source runs save `.local/settings/llm.json`; packages use `userData/settings/llm.json`. Keys are plaintext in this file, with `0600` permissions on macOS/Linux and user-directory ACLs on Windows. To replace a key, enter/save a new one. Changing the API host requires re-entering its key.

Asking a question sends the current board, relevant engine data and conversation context to the selected provider and incurs its usage.

## Codex / Claude Code CLI

Install/login in a terminal first. Confirm `codex exec --help` or `claude --help`, then choose the model in the UI. Set absolute paths when necessary:

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex uses noninteractive `exec`, `--model` and `-c model_reasoning_effort=…`. The app uses isolated configuration and requires CLI support for `--ignore-user-config` / `--ephemeral`. See [Codex configuration](https://developers.openai.com/codex/config-reference/).

Claude uses print mode with `--model` / `--effort`. Haiku offers default effort only; other levels depend on CLI/provider and unsupported values may be reduced by the CLI. See [Claude models and effort](https://code.claude.com/docs/en/model-config#adjust-effort-level).

Each CLI explanation gets temporary MCP Go tools; the CLI must support Streamable HTTP MCP. DeepSeek uses native API tool calling. All three share search tools and activity records.

CLI coaches may research Go material online and cite sources. Codex explicitly sets `web_search="live"`; Claude enables/preauthorizes `WebSearch` / `WebFetch`. No separate search key is needed. Position-specific tactics/numbers still require board/engine evidence. The DeepSeek adapter currently has no web search. See [Codex web search](https://learn.chatgpt.com/docs/config-file/config-basic#web-search) and [Claude tool permissions](https://code.claude.com/docs/en/cli-reference).

Environment defaults: `CODEX_MODEL` / `CODEX_EFFORT`, `CLAUDE_MODEL` / `CLAUDE_EFFORT`; empty values use CLI defaults. Saved in-app settings take precedence.

On Windows prefer native `.exe` CLIs. npm `.cmd` shims are not native executables. Find the package with `npm root -g`, then configure Node and the actual JS entry, for example:

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

For Claude npm installs use `CLAUDE_PATH` / `CLAUDE_SCRIPT` with its actual entry point. Native installs omit `*_SCRIPT`. GUI PATH may differ from the terminal; absolute paths are safest.

## Coaching prompt and skill

- [Runtime Chinese coaching prompt](../../prompts/coach.zh-CN.md): perspective, before/after comparison, PV references, group strength priorities and teaching depth.
- [Reusable go-coach skill](../../skills/go-coach/SKILL.md): loads the same contract when manually invoked.

For a move explanation, the LLM receives before/after boards and engine candidates/variations and may search further. The prompt encourages shape-appropriate Go terminology to explain intent and tradeoffs. Interface language does not change this Chinese prompt or automatically translate generated answers.

Agent text supports coordinate highlights, mutually exclusive selectors and saved trial branches. See [Interactive coaching](coach-links.md) for syntax and `edit_trial`.
