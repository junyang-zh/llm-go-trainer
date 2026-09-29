# Engine installation, lifecycle and adapters

[English](engines.md) · [简体中文](../engines.md) · [繁體中文](../zh-TW/engines.md) · [日本語](../ja/engines.md) · [한국어](../ko/engines.md)

<a id="installation"></a>

## Automatic installation

Source runs use `<repo>/.local/katago/`, overridable with `GO_TRAINER_DATA_DIR`. Packaged Electron uses `app.getPath('userData')/katago/`. These files stay out of Git:

```text
katago/
  downloads/                  SHA-256-addressed download cache
  models/                     Verified .bin.gz / .txt.gz models
  darwin-arm64-<revision>/     Or win32-x64-<revision>
    bin/                      Executable and Windows DLLs
    lib/                      macOS shared libraries
    licenses/                 Upstream notices from archives
    installed.json            Installed-file digests
  connection.json             Selected engine connection (no secrets)
  models.json                 Model catalog and selection
```

The server listens before downloading/installing/warming up in the background; the page never waits for the GPU. Source runs and packages missing required resources need network access and hundreds of MB of download space on first launch, plus extraction/model-cache space. A successful analysis marks the engine ready. Download/platform failures show errors while the board stays usable.

Windows OpenCL tunes the main and HumanSL models separately on first launch, potentially taking minutes; cached tuning makes later launches faster. Status distinguishes tuning, cache loading and first-analysis validation. Initialization allows at least ten minutes by default, never less than the analysis timeout; override it with `KATAGO_STARTUP_TIMEOUT_MS`. Regular analysis uses `KATAGO_TIMEOUT_MS` (three minutes by default). Initialization can be stopped. Timeout errors include trailing engine diagnostics to distinguish tuning delays from driver failures.

### Windows CUDA

Select OpenCL or CUDA (NVIDIA) in **Go models → Compute backend**. Existing installations stay on OpenCL by default. CUDA requires an NVIDIA GPU/driver supporting CUDA 12.8. First selection downloads KataGo 1.18.2, CUDA Runtime 12.8.90, NVRTC 12.8.93, cuBLAS 12.8.4.1 and cuDNN 9.8.0.87 from official KataGo/NVIDIA sources, about 1.45 GiB compressed. No global CUDA Toolkit is required: DLLs remain in the backend's private `bin`, without changing system PATH.

Versions/digests are pinned in `config/katago/windows-cuda.json`; NVIDIA digests come from [CUDA 12.8.1 redistrib](https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.8.1.json) and [cuDNN 9.8.0 redistrib](https://developer.download.nvidia.com/compute/cudnn/redist/redistrib_9.8.0.json). Backends have separate directories and share models. Switching stops the old process and saves the selection. Switch back to OpenCL if initialization fails. Standard installers still bundle OpenCL; CUDA downloads only when first selected and then reuses its cache.

Benchmark with `node --import tsx scripts/benchmark-backends.ts <cache-directory> [rounds]`. It reads the actual selected main/HumanSL models, alternates backends and reports installation checks, initialization and two 19×19 positions at 400/4000 visits using the app's analysis settings. Output stays in the terminal; save measurements outside the repository. Avoid competing GPU workloads and distinguish startup time from search throughput.

<a id="custom-paths"></a>

## Custom engine paths

Set `KATAGO_MODEL` to enable overrides for an existing installation, including CUDA/TensorRT. Use forward slashes on Windows:

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

The app forces `reportAnalysisWinratesAs=BLACK`; all analysis uses Black's perspective. See [environment configuration](development.md#environment) for `.env` locations.

## Model catalog and selection

**Go models** includes engine controls and external connections; coach credentials are separate under **Connect LLM**. Filter recommended/downloaded/all models, search names/architectures, inspect sizes, supported boards, sources and SHA-256, queue downloads, track progress, cancel/retry and delete unselected models. Network interruptions retain partial files for resuming; explicit cancellation removes the active partial file.

Recommendations are pinned in [`config/katago/models.json`](../../config/katago/models.json) and the artifacts manifest: lightweight B10 is a historical small network, balanced B18 the original default, advanced Transformer an official tf3 network. Tiers describe resources/use cases, not measured ranks, Elo or speed; Transformer may be slower on OpenCL. B10's digest was computed from the official v1.3 release asset; Transformer/B18 sizes and digests come from the training API. HumanSL is an optional companion, never a main analysis model.

**Fetch latest official models** reads `katagotraining.org/api/networks/`, retaining digests, URLs and metadata, with pagination for older entries. Failed refreshes leave saved catalogs/models usable. **Add other model** accepts HTTPS `.bin.gz` / `.txt.gz` URLs from the official training site, historical model site or KataGo GitHub Releases, with required SHA-256, role and supported boards. Arbitrary intranet addresses/executables are rejected.

`katago/models.json` stores the catalog/selection; `katago/models/<sha256>.bin.gz` or `.txt.gz` stores verified files. Suffixes preserve the upstream format for KataGo's parser. Existing default models are recognized and upgrades retain selection. Downloading does not select a model. Switching stops the engine, performs a real initialization analysis and saves the selection only on success. Failure/cancellation preserves the old selection; **Start engine** restores it. Selected/pending models cannot be deleted. With `.env` `KATAGO_MODEL`, catalog downloads/management remain available but managed selection is disabled to avoid overriding the custom configuration.

API: `GET /api/models` returns catalog, cache, selection and pending selection. `POST /api/models/download|cancel|delete` accepts `{id}`; `select` accepts `{main, human}` (`human` may be `null`); `refresh` accepts `{page}`; `add` accepts `{name, url, sha256, role, boards}`. Writes use the same same-origin JSON protection as engine controls.

Downloads use HTTPS, pinned SHA-256, temporary files and final verification/rename. Network errors retry up to three times with HTTP Range resume; ignored Range restarts the file. Unverified downloads are never executed. Manual stopping removes incomplete downloads; accidental disconnection leaves resumable partials. Corrupt files are repaired from verified bundled resources when possible, otherwise downloaded again. Errors display resource, source host and available underlying network code. An installation lock prevents concurrent extraction; stale locks are recoverable.

## Versions and sources

Versions are manifest-pinned; resource updates must also change the revision and pass startup tests.

- [`artifacts.json`](../../config/katago/artifacts.json): main model, HumanSL and Windows package.
- [`macos-bottles.json`](../../config/katago/macos-bottles.json): Metal 1.18.2 and pinned ARM64 Sequoia Homebrew bottles for libzip/xz/zstd/lz4/abseil/protobuf. Requires macOS 15+, without installing Homebrew. Libraries enter only the child's `DYLD_LIBRARY_PATH`.
- Windows uses [official OpenCL 1.18.1](https://github.com/lightvector/KataGo/releases/tag/v1.18.1) or [CUDA 1.18.2](https://github.com/lightvector/KataGo/releases/tag/v1.18.2), retaining executables/DLLs. TensorRT remains available through custom `.env` paths.
- Main model `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` comes from the [official training site](https://katagotraining.org/networks/); its digest matches the [Homebrew formula](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb).
- HumanSL `b18c384nbt-humanv0.bin.gz` comes from [KataGo 1.15.0 assets](https://github.com/lightvector/KataGo/releases/tag/v1.15.0); its digest was computed from that official HTTPS asset. See [human models](https://katagotraining.org/extra_networks/).
- Homebrew URLs also contain full blob SHA-256; Windows digests match GitHub release asset digests.

KataGo is [MIT licensed](https://github.com/lightvector/KataGo/blob/master/LICENSE); dependencies have separate licenses. The installer preserves LICENSE/COPYING/COPYRIGHT/NOTICE. Third-party binaries/weights are not committed. Standard packages include two official models and their [license](../../config/katago/MODEL-LICENSE.txt), verified/copied into the user cache at startup. They also include platform engine/dependency archives (Windows OpenCL ZIP or macOS Metal bottles). Verified caches or archives under `GO_TRAINER_BUNDLED_RUNTIME` take precedence; missing/corrupt resources download again. Both standard platforms support offline engine/dependency/model setup; Windows still requires an OpenCL driver. Minimal downloads all resources at first launch. See [releases](releases.md).

## Search limits and statistics

**AI auto-play** supports visits (50–1,000,000) or time (0.1–120 seconds), saved locally. `Training.searchLimit` defaults to `visits`, `maxTime` to 5 seconds. Time mode sets KataGo `overrideSettings.maxTime` and raises the visits ceiling, returning the available analysis/move normally. Transport timeout remains separate protection against unresponsive processes. Background curves use at most 100 visits; coach searches retain their own budgets.

`Analysis.searchStats` has `elapsedMs` and `visitsPerSecond`: actual `rootInfo.visits` divided by monotonic time from request send to result, including queue/transport overhead. This is average speed, not theoretical GPU throughput. Intermediate/final results retain Black's perspective and statistics. Notifications show live statistics; the expanded evaluation panel places them with analyzed progress and reserves candidate space during computation. External engines without timing show visits only.

`POST /api/bot-move` supports JSON; with `Accept: application/x-ndjson` it streams intermediate `analysis` and a final `done` containing `move`, `method`, `analysis`. Disconnecting cancels the search.

## Controls and process exit

**Settings → Go models** starts/stops/restarts engines or connects external HTTP Go AI. A manually stopped engine stays stopped until restarted explicitly or the app restarts. Switching releases the old process first. External services manage their own lifecycles; see the [adapter contract](#adapters).

`GET /api/status` exposes `engine.phase`, `ready`, `running`, `pid`, `backend`, download `progress` and diagnostic `error`. Phases: idle/downloading/installing/starting/ready/stopping/stopped/error.

Same-origin requests include `Content-Type: application/json` and `X-Go-Trainer: 1`:

| Route                        | Body             | Behavior                                                                                            |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/engine/start`     | `{}`             | Start from stopped/error                                                                            |
| `POST /api/engine/stop`      | `{}`             | Cancel downloads/requests and await owned process exit                                              |
| `POST /api/engine/restart`   | `{}`             | Stop fully, check installation and warm up                                                          |
| `GET /api/engine/connection` | —                | Read selected connection                                                                            |
| `POST /api/engine/connect`   | Connection below | Save selection, release old process, initialize in background; identical connections do not restart |

KataGo uses `spawn`, `shell:false`, `detached:false` and app-owned stdin. Normal shutdown closes input, sends SIGTERM, then SIGKILL after at most two seconds and awaits `close`. Synchronous exit hooks also kill owned children. KataGo exits its analysis service on stdin EOF, supplementing cleanup if the parent is killed; this is not a platform Job Object guarantee.

Closing the last desktop window exits the app, including macOS. Source Web mode needs `Ctrl+C`; closing a tab does not stop the service. Stopping an external HTTP connection only disconnects this app, never terminates the external process.

<a id="adapters"></a>

## External Go AI adapter contract

Managed connection: `{"mode":"managed"}`. Example external connection:

```json
{ "mode": "external", "name": "My Go AI", "url": "http://127.0.0.1:9000/analyze" }
```

Use HTTPS or loopback HTTP. URL credentials, query parameters, redirects and UI API keys are unsupported. Native GTP requires your own HTTP bridge implementing this contract; a TCP/GTP port cannot be used directly.

The app POSTs `{game, training}` to the complete URL, using [`shared/types.ts`](../../shared/types.ts). `game` includes size, rules, komi, setup stones and full history. Connection validation sends an empty 19×19 game with 50 visits. JSON and `application/x-ndjson` are supported.

```json
{
  "id": "your-request-id",
  "perspective": "B",
  "turnNumber": 0,
  "rootInfo": { "visits": 50, "winrate": 0.5, "scoreLead": 0 },
  "moveInfos": [
    {
      "move": "D4",
      "visits": 50,
      "winrate": 0.5,
      "scoreLead": 0,
      "prior": 0.1,
      "order": 0,
      "pv": ["D4", "Q16"]
    }
  ]
}
```

All win rates, scores and ownership values must use **Black's perspective**, never the current player's. `turnNumber` equals submitted history length. Optional `ownership` has size² row-major values from top left, +1 Black / −1 White. `policy` / `humanPolicy` use KataGo row-major coordinates with pass last. Server schemas validate ranges. Without HumanSL, training falls back to candidate sampling. Other engine outputs are not described as KataGo evidence.

NDJSON sends one object per line:

```json
{"type":"analysis","phase":"after","final":false,"analysis":{}}
{"type":"done","analysis":{}}
```

Replace `{}` with complete valid analysis objects. `done` is mandatory; disconnection/`error` means failure. Adapters should cancel upstream work on client disconnect. GPU usage, playing strength and comparability depend on the adapter.
