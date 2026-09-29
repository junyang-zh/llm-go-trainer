# User guide

[English](usage.md) · [简体中文](../usage.md) · [繁體中文](../zh-TW/usage.md) · [日本語](../ja/usage.md) · [한국어](../ko/usage.md)

[README](../../README.en.md) · [LLM configuration](llm.md) · [Engines and models](engines.md)

<a id="installation"></a>

## Installation and first launch

Download the installer for your platform from [GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases): `.exe` for Windows 10/11 x64, `.dmg` for macOS 15+ Apple Silicon. Run the Windows installer; on macOS, drag the app into Applications. The `.zip` / `.yml` files serve automatic updates. GitHub's Source code archives are not installers.

The standard edition bundles the engine, dependencies, main model and HumanSL for offline setup. `minimal` waits for you to open **Settings → Go models** at the top left and click **Download and enable KataGo**, as prompted at the top right; both editions have identical features. Windows standard includes OpenCL but still requires your GPU's OpenCL driver. macOS includes Metal and its libraries; Homebrew is unnecessary. macOS releases use Developer ID signing and Apple notarization when all release credentials are configured; otherwise they are unsigned and unnotarized. Windows installers do not yet have code signing.

Engine preparation, model loading and GPU initialization run in the background on standard startup, or after manual setup in minimal. View progress in **Settings → Go models**; you can place stones, import SGFs and review games meanwhile. Analysis and AI play become available when initialization completes. Later launches reuse verified caches. See [Engines and models](engines.md) for selection, download retries and backends.

Configure your coach in **Settings → Connect LLM**. Model and reasoning effort are saved for subsequent requests. See [LLM configuration](llm.md) or [Development](development.md) for running from source.

## Language

**Settings → General → Language** offers English, Simplified Chinese, Traditional Chinese, Japanese and Korean. The default follows the system language; unsupported languages fall back to English. An explicit selection is saved locally and applies immediately without resetting the board, draft or conversation. Known engine notifications, model statuses and errors follow the selection. User names, game records, model names you supply and unknown provider diagnostics retain their original content. This setting translates the interface; the runtime coach prompt remains in Chinese and does not automatically change the language of generated answers.

## Current features

| Feature    | Support                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Board      | 9×9 / 13×13 / 19×19; captures, suicide prohibition, ko; free review, pass and main-line navigation                     |
| AI play    | KataGo JSONL; either color; no handicap or 2–9 stones; custom komi                                                     |
| Difficulty | HumanSL rank sampling; limited-point-loss random selection without HumanSL; strongest mode                             |
| Style      | Randomness and loss limit; approximate aggression as contact preference, random mode only                              |
| Analysis   | Black win-rate / score curves by move, candidates, PV preview and ownership                                            |
| Scoring    | Chinese area preview after manual dead-stone marking, including handicap compensation                                  |
| Records    | Standard SGF exported by Fox / Golaxy; UTF-8 / GB18030; root setup and main line; SGF export                           |
| Coach      | Streaming Markdown, tool searches and activity records, move/position/variation explanations, stop and evidence export |
| LLM        | DeepSeek API, Codex CLI and Claude Code CLI adapters                                                                   |
| Desktop    | Electron; GitHub Release updates; optional macOS signing/notarization; Windows NSIS installer                          |

Only the first SGF main line is imported; original comments and branches are not saved in training records. Unsupported mid-game setup or player changes are explicitly rejected. Japanese rules support play and engine analysis, but formal final scoring is not implemented. HumanSL ranks are not certified Fox/Golaxy ranks. Direct platform accounts, automatic whole-game LLM review, clocks, resignation and persistent analysis caches are not available.

See [Engines and models](engines.md) for the catalog, Windows OpenCL/CUDA switching and visit/time search limits.

## Game history, trials and conversations

Games save automatically to a local library. **Game history** selects games and imports/exports SGF. Desktop uses Electron `userData/history`; Web mode uses `.local/history`. Override either with `GO_TRAINER_HISTORY_DIR`, pointing to a writable directory. Records are atomic JSON documents; no database installation is required and nothing is stored inside the app bundle. System temporary directories may be cleared by the OS.

**AI auto-play** selects **AI plays White / Black**. With it off, both colors can be played manually. Moves at the main-line end extend the actual game; moves at historical positions, including AI moves and passes, form trial branches without changing the main line. Trial stones carry move numbers. Trials can be cleared or saved as a new game. **Fork new game** at a historical position saves that position separately; subsequent moves extend the new main line. The timeline navigates both the main line and current trial. Leaving the current trial range or switching games clears the active trial; saved coach branches can be reopened from their conversation. Trial positions support analysis and coaching.

Conversations are independent of games: switching games or moves, importing and creating games preserve the active conversation and draft. **New conversation** creates a separate session; **Conversation history** restores saved sessions. Each turn records the game ID, original move number, time and trial sequence. Failed/stopped requests are retained. Unfinished requests are marked interrupted after restarting.

The coach can use `query_game_history` to list games or read a record/position by `gameId` and `turn`. Its current context includes the user's trial sequence. History queries do not depend on the active conversation and never modify records.

## Layout and streaming analysis

The board fits the available window space. The page itself does not scroll; chat and settings scroll independently. The upper-left logo opens four settings tabs: General, Go models, AI auto-play and Connect LLM. LLM and engine status appear together above the conversation.

The **Score / Win rate** panel is always available and starts collapsed. Expanding it shows two curves by move. With the engine ready, the current position is analyzed automatically using `min(training visits, 100)`; AI games reuse the opponent search. **Complete graph** fills missing moves in order and can be stopped. Foreground analysis and AI play take priority over background graph searches.

Both values use Black's perspective: a positive score means Black leads, negative means White leads. They are engine estimates. Missing moves remain gaps; incomplete searches use hollow points. Click a graph point to navigate. Reviewing earlier moves preserves current main-line data; changing records, rules, komi or engine isolates old results. Curves last for the current run only; shallow background results never replace deeper completed searches.

The current value sits beside the expanded panel title and hides when collapsed. Search visits and visits/s share the analyzed-progress area. Space for curves and candidate continuations is reserved while searching, preventing the panel and board from jumping when results arrive. The **Candidates** button toggles board A/B/C marks; the expanded panel has its own candidate list.

Chat supports Markdown headings, lists, emphasis, tables, quotes and code blocks. Wide tables/code scroll independently; web links open in the system browser. Engine search counts, Black win rate/score and PV appear before the LLM answer. DeepSeek and Claude Code stream incremental text; Codex update granularity depends on the CLI version and may arrive only after a whole message is generated.

The coach can inspect groups/liberties, try move sequences and search responses—for example, comparing attack, defense or tenuki when asked whether a group is safe. Expand tool activity to inspect sequences, scores and PVs. **Stop** cancels the corresponding KataGo query, LLM request and CLI subprocess. Received text remains marked incomplete; only completed explanations enter subsequent conversation context. Trial results remain in that explanation without changing the played game.

## App updates

**Settings → General** shows the version, checks GitHub Releases and controls automatic updates. Automatic updates are off by default; when enabled, they check stable releases at startup and every four hours. After download, **Restart and install** saves records and closes the engine before installing. The app never restarts automatically during play or analysis.

With verified cached models, updates use the minimal installer without models/engine archives, reusing models, backends and tuning caches. Standard installations without valid cached models retain the standard installer. See [Build and release](releases.md#updates) for channels and verification.

Automatic installation requires an installed desktop app and, on macOS, Developer ID signing. Source and browser runs do not install updates. Unsigned macOS builds show an explanation and a GitHub Release link for manual installation.
