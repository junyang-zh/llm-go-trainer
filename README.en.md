# LLM Go Trainer

[English](README.en.md) · [简体中文](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

A Go training app for local [KataGo](https://github.com/lightvector/katago) play, game review and explanations from an LLM agent. Supports macOS and Windows.

![LLM Go Trainer desktop: game review and trial variations, KataGo win-rate and score graphs, and LLM coaching](assets/UI-Example.png)

_Review games, explore variations and understand positions with KataGo analysis and LLM explanations in one workspace._

## Features

- **Play against AI:** 9×9, 13×13 and 19×19 boards, handicap and komi, with KataGo and HumanSL move selection.
- **Review games:** import/export SGF, save game history, try variations at any past position and save them as new games.
- **Analyze positions:** win-rate and score graphs, candidate moves, principal variations and ownership estimates.
- **AI coaching:** DeepSeek API, Codex CLI or Claude Code CLI explains moves, positions and variations using engine evidence.
- **Languages:** English, Simplified Chinese, Traditional Chinese, Japanese and Korean; follows the system language by default.

See the [user guide](docs/en/usage.md) for instructions and current limitations.

## Download and get started

Download from [GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases):

| Platform                  | Installer |
| ------------------------- | --------- |
| Windows 10/11 x64         | `.exe`    |
| macOS 15+ / Apple Silicon | `.dmg`    |

The standard edition bundles the engine, dependencies and models; `minimal` downloads them on first launch. Both have the same features. See the [user guide](docs/en/usage.md#installation) and [release notes](docs/en/release-notes.md).

## Documentation

| Document                                            | Contents                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| [User guide](docs/en/usage.md)                      | Installation, play, review, trials, coaching and updates                   |
| [Engines and models](docs/en/engines.md)            | KataGo installation, model catalog, backends, custom paths and external AI |
| [LLM configuration](docs/en/llm.md)                 | DeepSeek / Codex / Claude Code, credentials and coaching prompt            |
| [Interactive coaching](docs/en/coach-links.md)      | Coordinate links, selectors and trial branches                             |
| [Development](docs/en/development.md)               | Electron, browser debugging, tests, localization and source layout         |
| [Build and release](docs/en/releases.md)            | Packaging, GitHub Release, signing, notarization and updates               |
| [Architecture and roadmap](docs/en/architecture.md) | Modules, streaming, storage and future work                                |
