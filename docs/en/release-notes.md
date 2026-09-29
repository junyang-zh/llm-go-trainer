# Release notes

[English](release-notes.md) · [简体中文](../release-notes.md) · [繁體中文](../zh-TW/release-notes.md) · [日本語](../ja/release-notes.md) · [한국어](../ko/release-notes.md)

## v0.1.3

- Go model management: recommendation tiers, official catalog, custom models, download progress/cancel, selection and deletion.
- Windows CUDA backend with persistent OpenCL/CUDA switching. CUDA is not bundled; first selection downloads about 1.45 GiB of verified dependencies and reuses existing models.
- Notifications show live visits and average visits/s. Search limits support visits or time and save automatically.
- With cached models, updates use the minimal installer without models, reusing models, backends and tuning caches. Older apps must first update to this version before subsequent updates can use this policy.
- Fixed startup status/timeouts during initial Windows OpenCL tuning and hid the Windows menu bar.
- Simplified settings into General, Go models, AI auto-play and Connect LLM.

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
