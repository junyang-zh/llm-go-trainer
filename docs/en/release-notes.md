# Release notes

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ko/release-notes.md)

## v0.1.7

- Win-rate and score curves retain the complete game mainline during trials: trial moves appear in red and later mainline moves in gray. Clearing a trial immediately restores the cached mainline curve. All values remain in Black's perspective.
- Background analysis automatically fills missing game and trial evaluations, prioritizing the viewed position. Search, completion and error notifications have been adjusted; completion reports the number of moves analyzed and search speed supplied by the engine.
- Ownership predictions show only points with an absolute ownership value of at least 0.8, using clear black/white marks. They can appear alongside candidates and trial move numbers, with marks offset to avoid overlap.
- Coach answers support multi-coordinate stone-group references with soft fog highlights, grouping and keyboard focus. Highlights hide when references leave the visible area or the board changes position. Single-point guides now start at the lower-right edge of the mark; coach instructions and documentation in all languages have been updated.
- Updated the UI example screenshot in the README.

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
