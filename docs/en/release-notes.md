# Release notes

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ko/release-notes.md)

## v0.1.6

- SGF imports preserve the complete variation tree, comments and board marks, including collections containing multiple games. Each file appears as one local game entry, suitable for browsing your own joseki collections.
- Browse move paths, return to parent nodes, switch variations and open a selected position on the main board. Setup stones, stone removals and player-to-move nodes are supported. Save trials as related games while retaining and exporting the complete source SGF.
- Removed SGF import limits on file size, node count and nesting depth. Unspecified or unsupported rules continue to use Chinese rules through the existing fallback, without the import warning.
- Move-path and variation buttons now have a thin border and subtle background to distinguish them from navigation and board-placement controls.
- Codex / Claude settings now offer CLI paths and optional Node paths, supporting native executables and Node script entry points and improving CLI discovery and detection when launched from the desktop.

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
