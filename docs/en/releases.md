# Desktop releases

[English](releases.md) · [简体中文](../releases.md) · [繁體中文](../zh-TW/releases.md) · [日本語](../ja/releases.md) · [한국어](../ko/releases.md)

Pushing a `v*` tag triggers GitHub Actions to build/publish four installers: Windows 10/11 x64 and macOS 15+ Apple Silicon, each standard/minimal. There are no 32-bit, Windows 7/8 or Intel Mac builds. Complete macOS release credentials enable Developer ID signing and Apple notarization; otherwise packages are unsigned/unnotarized. Windows code signing is not yet configured.

## Release steps

1. Update `package.json` and `package-lock.json` (for example, `npm version 0.1.1 --no-git-tag-version`) and the release notes in every language as needed.
2. Prepare local commits and a clean worktree. Present the exact commits/changes, destination remote/branch and validation results for user review. Push only after explicit approval for that push.
3. Tags also require review: present the exact version/tag, target commit/remote, release notes and validation results. After explicit approval, create/push a tag matching package.json. Approval covers only the reviewed changes/destination; extra changes or replacement of a remote tag require renewed review. Choosing a version or requesting implementation does not approve any push.

Run these examples only after the relevant branch/tag pushes are approved:

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

Monitor the `release` Actions workflow. It uses `windows-2022` x64 and `macos-15` ARM64 runners. Each build runs tests, TypeScript/Vite/server builds, electron-builder and package checks for weights, engines and dependency archives. Standard resources come from pinned manifests and must pass SHA-256 verification before bundling. Corrupt model caches download again; models/binaries never enter Git.

After all four builds succeed, the publish job checks four installers, two macOS update ZIPs and four independent manifests, including versions, filenames, sizes and SHA-512. It generates `SHA256SUMS.txt`, uploads all files to a draft Release and then publishes it. Only this job gets `contents: write`, using the repository's `GITHUB_TOKEN`; no personal token is needed. Failed workflows can be rerun. Drafts can resume uploading; published releases are never overwritten—publish a new version. Versions containing `-`, such as `0.2.0-beta.1`, are prereleases.

Manual Actions runs on a branch build artifacts only; selecting a version tag attempts publication. Do not create a public Release first.

<a id="local-build"></a>

## Local builds

Install Node.js 24 and dependencies on the target system:

```sh
npm ci
npm run package:desktop
npm run package:desktop -- minimal
```

No argument means standard; `-- standard` is explicit. Output goes to `release/standard/` or `release/minimal/`; only minimal filenames have `-minimal`. macOS builds arm64 DMG/update ZIP on Apple Silicon; Windows builds x64 NSIS EXE. Both editions share app ID/userData and can replace each other during upgrades.

`public/logo.svg` supplies the app/UI icon. Builds generate multi-resolution Windows ICO, macOS ICNS and window PNG under ignored `.local/icons/`. Rebuild after logo changes.

Standard bundles main/HumanSL weights, source digests and upstream licenses in `Resources/katago-models/`. Startup prefers verified user-cache weights, then bundled copies, downloading only if missing/corrupt. `katago-runtime/` contains SHA-256-pinned engine archives: Windows official OpenCL ZIP with DLLs, or macOS Metal plus all library bottles and notices. First launch installs these offline. Windows still needs a GPU OpenCL driver; macOS needs no Homebrew. Minimal bundles none of these resources and does not download automatically. Follow the top-right notice to **Settings → Go models** at the top left, then click **Download and enable KataGo**.

CI verifies bundled weights/archives but lacks target GPU drivers; it cannot replace actual Windows OpenCL/macOS Metal and installer validation. Check installation, launch, analysis and shutdown on target systems around public releases.

References: [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [electron-builder v26](https://www.electron.build/v26/docs/configuration/), [model license](https://katagotraining.org/network_license/).

<a id="updates"></a>

## Automatic updates and macOS signing

Standard starts with `latest.yml` / `latest-mac.yml`, minimal with `minimal.yml` / `minimal-mac.yml`. At each update check, at least one SHA-256-verified model in userData switches standard to the minimal channel too, downloading an app installer without engine/model archives. Shared app ID/userData preserve selection, catalog, engine installation and tuning caches. Models are not redownloaded for each app version. A future engine revision installs only missing new engine resources, still reusing identical model digests. With no valid cached model, standard stays standard; even a partial model cache selects minimal and startup prompts for manual setup in Settings if the selected engine or models are incomplete.

electron-builder generates manifests; macOS updates use ZIP, Windows NSIS EXE. The updater checks stable Releases, verifies digests and strictly matches the selected edition/platform. Missing minimal manifests or manifests pointing to standard packages fail explicitly, without silently downloading a large standard package. Cross-edition differential blockmaps are disabled; the complete **minimal app installer**, not models, is downloaded. The installed edition then displays minimal. `userData/updates.json` saves preferences, with automatic updates off by default. Users click **Restart and install** after download. Older versions must first upgrade to one containing this logic before later checks can choose model-free updates.

Configure all five Secrets in **Settings → Secrets and variables → Actions** to enable macOS signing/notarization:

| Secret                       | Value                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| `MACOS_CERTIFICATE`          | Base64 of exported Developer ID Application certificate/private key `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` export password                                                     |
| `APPLE_API_KEY_P8`           | App Store Connect API `.p8` private key for notarization                   |
| `APPLE_API_KEY_ID`           | Corresponding Key ID                                                       |
| `APPLE_API_ISSUER`           | Corresponding Issuer ID                                                    |

Create the certificate/API key in an Apple Developer account and retain the signing identity across releases. Never commit credentials or put them in app configuration. CI lists missing secret names if incomplete, disables identity autodiscovery and skips signing/notarization/ticket checks while releasing unsigned packages. With all credentials, it writes secrets only to runner temporary storage, imports the certificate, enables Hardened Runtime, signs/notarizes, verifies signature/ticket and cleans up. Any enabled signing/notarization/verification failure blocks publication; there is no unsigned fallback or partial public release.

Local `npm run package:desktop` defaults to unsigned/unnotarized macOS packages. They can check updates/open Releases but cannot automatically install updates; macOS may block first launch. For local signing, configure electron-builder credentials and `GO_TRAINER_REQUIRE_SIGNING=1`. Full validation requires a signed installed app upgrading to a higher version, testing data retention, exit and restart for both editions.

See [Electron macOS update signing requirements](https://www.electronjs.org/docs/latest/api/auto-updater#macos).
