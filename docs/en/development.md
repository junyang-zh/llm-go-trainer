# Development

[English](development.md) · [简体中文](../development.md) · [繁體中文](../zh-TW/development.md) · [日本語](../ja/development.md) · [한국어](../ko/development.md)

[README](../../README.en.md) · [Architecture](architecture.md) · [Build and release](releases.md)

## Run Electron

Requires Node.js 22.12+ (24 LTS recommended) and npm. The following works on macOS and Windows PowerShell:

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
npm run desktop
```

This is the default entry point for daily use and UI testing. It builds the app, opens Electron and starts the local server and KataGo. Closing the window shuts down both the server and its engine. After source changes, close the previous window and run `npm run desktop` again; this command has no hot reload.

See [first launch](usage.md#installation), [engines](engines.md) and [LLM setup](llm.md).

## Browser debugging

Use Web mode for frontend hot reload or supplementary browser debugging:

| Purpose                  | Command                           | Address                 |
| ------------------------ | --------------------------------- | ----------------------- |
| Development / hot reload | `npm run dev`                     | <http://127.0.0.1:5173> |
| Built Web app            | `npm run build`, then `npm start` | <http://127.0.0.1:3001> |

Stop Web mode with `Ctrl+C` in the terminal. Closing a browser tab does not stop the server or KataGo.

<a id="environment"></a>

## Environment configuration

For source runs, copy [`.env.example`](../../.env.example) to `.env` at the repository root. Restart after changes; `npm run doctor` helps diagnose the environment. Saved in-app LLM settings override environment defaults; see [LLM configuration](llm.md).

Installed apps read `.env` from Electron userData, typically `~/Library/Application Support/llm-go-trainer/.env` on macOS or `%APPDATA%/llm-go-trainer/.env` on Windows. If app naming changes, `app.getPath('userData')` is authoritative. Use absolute custom engine/model paths; see [custom engines](engines.md#custom-paths), [engine cache](engines.md#installation) and [history storage](architecture.md#history).

Never commit `.env`, credentials, engine binaries, models, private SGFs or local runtime logs.

## Tests and validation

Run rule, service and protocol tests and the build before delivering logic changes:

```sh
npm test
npm run build
```

**Prefer Electron for UI and end-to-end validation:**

```sh
npm run desktop
npm run test:coach-layout
npm run test:i18n-layout
```

In the desktop window, verify board resizing, settings, SGF import, streaming, engine controls and process cleanup after closing. Browser testing supplements this and does not replace desktop validation.

`test:coach-layout` uses isolated temporary storage to test highlights, proximity brightness, bidirectional hover/keyboard links, scroll clipping, groups, branch navigation and collapse/restore at multiple window sizes. `test:i18n-layout` checks five languages and multiple sizes, settings/models, reserved evaluation space, search/error/retry transitions, title alignment and overflow.

Automated tests cover Go rules, SGF, opponent sampling, Black/White perspective, engine lifecycle, LLM protocols and UI interactions. Fixtures require loopback networking but no real LLM API key. Simulated evaluations belong only in `tests/fixtures/`, never in runtime fallback behavior. CI tests/builds on Ubuntu, macOS and Windows. Report hardware, providers and remaining validation gaps in the conversation; keep session reports and logs outside the repository.

## Localization

`src/i18n.ts` resolves the system language, persists explicit preferences and interpolates messages. `src/locales/{en,zh-CN,zh-TW,ja,ko}.json` must have matching keys and placeholders. Replace UI literals with `t(...)`; keep service diagnostics raw until rendering with `localizeDiagnostic(...)`, so stored notices update when the language changes. Preserve custom names and unknown provider output. Language selection does not change the runtime coach prompt or automatically translate answers.

The Simplified Chinese README/docs remain at their original paths. Other READMEs use `README.<locale>.md`, with documents under `docs/<locale>/`. Each page links to its corresponding five-language versions. Update all versions together, preserve commands/configuration names and check relative links. `tests/i18n.test.tsx` checks locale resolution, catalog parity, interpolation and live switching without resetting UI state.

<a id="local-build"></a>

## Desktop packaging

Commands, platform requirements, output directories and installer checks are maintained in [Build and release](releases.md#local-build).

## Source layout

```text
src/          Web UI, SVG board and locale catalogs
shared/       Pure TypeScript rules, SGF and training policies
server/       Local API, KataGo, LLM and evidence
desktop/      Electron shell
config/       KataGo analysis configuration
prompts/      Runtime coaching prompt
skills/       Reusable coaching skill
docs/         User, configuration, development and release documentation
tests/        Rule and integration tests (no real model required)
```

See [Architecture](architecture.md) for module responsibilities and data flow.
