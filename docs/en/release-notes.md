# Release notes

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ko/release-notes.md)

## v0.1.5

- Agents can now load games, save the current position or trial branches, and rename games, keeping the board and library in sync. Trials are saved as new related games without overwriting their sources; continuation retains the updated game context.
- Fixed “CLI output exceeds limit” during long coaching sessions. Removed fixed limits on cumulative Codex / Claude CLI output, the Codex answer file and local frontend messages, so tool results no longer exhaust a hidden total-output allowance.
- Added library search, pagination, renaming, source details and groups of related branches. Standard bundles the full CWI game archive; minimal can install it from the record downloader. No joseki or life-and-death collection is bundled.
- Added Fox Go record lookup and import by username or UID. Downloaded games are saved locally, and repeated imports reuse the same record.
- Minimal no longer downloads engines or models automatically at first launch. To use a local engine, choose “Download and enable KataGo” in Settings → Go models. Existing models, records and conversations are preserved.
- Adopted the MIT license, added an in-app license notice and expanded third-party component and record-source notices. Third-party resources retain their own licenses.

Choose one installer matching your system:

| Filename suffix           | System                    | Bundled weights          |
| ------------------------- | ------------------------- | ------------------------ |
| `windows-x64.exe`         | Windows 10/11 x64         | Main + HumanSL           |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | Manual setup in Settings |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | Main + HumanSL           |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | Manual setup in Settings |

Both editions have identical features. Windows standard bundles KataGo OpenCL and DLLs, needing no engine/model download but still requiring the GPU's OpenCL driver. macOS standard includes Metal and libraries, without engine/model downloads or Homebrew. Minimal on both platforms requires manual engine, dependency and model setup in Settings → Go models. Download errors identify resource, source host and available network error code. LLM credentials are never bundled; configure them in settings.

On macOS drag the app into Applications. With complete release credentials it is Developer ID signed and Apple notarized; otherwise it is unsigned/unnotarized and macOS may block first launch. Run `.exe` on Windows; installers are not code signed and may trigger an unknown-publisher prompt.

**Settings → General** offers GitHub Release checks and automatic updates. Verified cached models select minimal updates; standard installations without cached models keep standard updates. Windows and Developer ID-signed macOS installations offer **Restart and install** after download. Unsigned macOS builds open the Release page for manual installation.

Release `.zip` / `.yml` files are for automatic updates; choose `.dmg` / `.exe` for first installation. `SHA256SUMS.txt` contains installer/update-file SHA-256 digests. GitHub Source code archives are not installers.
