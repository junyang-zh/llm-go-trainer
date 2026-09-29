# Release notes

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ko/release-notes.md)

## v0.1.4

- Added English, Simplified Chinese, Traditional Chinese, Japanese and Korean interfaces. The default follows the system language; General settings saves an explicit selection. Notifications, model panels and existing statuses update with the language.
- Fixed layout jumps in the Score / Win rate panel during and after searches. Candidate space is reserved, the current win rate shares the title row and hides when collapsed, and visits/visits per second appear beside analysis progress.
- Added interactive coaching: coordinate highlights and board links, grouped variation selectors, and coach-created/edited trial branches saved with conversations without changing the played game.
- Added per-round agent limits for time, tool calls and total search visits. Reaching a limit preserves results and offers continuation; all limits default to unlimited.
- Codex / Claude Code coaches can research online and cite sources. Position-specific tactics and numbers still require board/engine evidence. DeepSeek does not currently offer web search.
- Added five-language READMEs and user, engine, LLM, development, release and architecture documentation, plus CI and latest Release badges.

Choose one installer matching your system:

| Filename suffix           | System                    | Bundled weights          |
| ------------------------- | ------------------------- | ------------------------ |
| `windows-x64.exe`         | Windows 10/11 x64         | Main + HumanSL           |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | Download on first launch |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | Main + HumanSL           |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | Download on first launch |

Both editions have identical features. Windows standard bundles KataGo OpenCL and DLLs, needing no engine/model download but still requiring the GPU's OpenCL driver. macOS standard includes Metal and libraries, without engine/model downloads or Homebrew. Minimal on both platforms downloads engines, dependencies and models at first launch. Download errors identify resource, source host and available network error code. LLM credentials are never bundled; configure them in settings.

On macOS drag the app into Applications. With complete release credentials it is Developer ID signed and Apple notarized; otherwise it is unsigned/unnotarized and macOS may block first launch. Run `.exe` on Windows; installers are not code signed and may trigger an unknown-publisher prompt.

**Settings → General** offers GitHub Release checks and automatic updates. Verified cached models select minimal updates; standard installations without cached models keep standard updates. Windows and Developer ID-signed macOS installations offer **Restart and install** after download. Unsigned macOS builds open the Release page for manual installation.

Release `.zip` / `.yml` files are for automatic updates; choose `.dmg` / `.exe` for first installation. `SHA256SUMS.txt` contains installer/update-file SHA-256 digests. GitHub Source code archives are not installers.
