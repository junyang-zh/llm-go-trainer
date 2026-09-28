# 引擎安装、生命周期与扩展

## 自动安装

源码启动使用 `<repo>/.local/katago/`；`GO_TRAINER_DATA_DIR` 可覆盖。Electron 打包后使用 `app.getPath('userData')/katago/`。这些文件不提交到 Git：

```text
katago/
  downloads/                  按 SHA-256 保存的下载缓存
  models/                     校验后的 .bin.gz 模型
  darwin-arm64-<revision>/     或 win32-x64-<revision>
    bin/                      可执行文件和 Windows DLL
    lib/                      macOS 动态库
    licenses/                 归档内上游声明
    installed.json            安装文件摘要
  connection.json             选择的引擎连接（无密钥）
```

服务先开始监听，再后台安装、下载、预热；页面不等待 GPU。源码启动和未内置所需资源的安装包首次启动需要网络和数百 MB 下载空间，解压和模型缓存额外占用空间。启动以一次分析成功作为 ready 条件。下载失败或平台不支持时显示错误，棋盘仍可用。

Windows OpenCL 首次启动会分别为主模型和 HumanSL 模型进行 GPU 调优，可能需要数分钟；缓存完成后启动会快很多。启动状态会显示调优、读取缓存和首次分析验证进度。初始化默认允许至少 10 分钟（不小于分析超时），可用 `KATAGO_STARTUP_TIMEOUT_MS` 单独覆盖；正常分析仍使用 `KATAGO_TIMEOUT_MS`（默认 3 分钟）。初始化可随时停止；超时错误附带引擎末尾诊断，便于区分调优耗时与驱动故障。

### Windows CUDA

在「围棋模型」顶部的「计算后端」选择 OpenCL 或 CUDA（NVIDIA）。现有安装默认继续使用 OpenCL；CUDA 需支持 CUDA 12.8 的 NVIDIA GPU 和驱动。首次选择 CUDA 时按需从 KataGo 和 NVIDIA 官方源下载 KataGo 1.18.2、CUDA Runtime 12.8.90、NVRTC 12.8.93、cuBLAS 12.8.4.1、cuDNN 9.8.0.87，压缩包合计约 1.45 GiB。无需全局安装 CUDA Toolkit；DLL 存在该后端的私有 bin 目录中，不修改系统 PATH。

清单和 SHA-256 固定在 `config/katago/windows-cuda.json`；NVIDIA 摘要来自 [CUDA 12.8.1 redistrib](https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.8.1.json) 和 [cuDNN 9.8.0 redistrib](https://developer.download.nvidia.com/compute/cudnn/redist/redistrib_9.8.0.json)。后端目录相互独立，模型目录共享。切换会停止旧进程并持久化选择；初始化失败可切回 OpenCL。标准安装包仍预置 OpenCL，CUDA 依赖仅首次选择时下载，之后复用缓存。

性能复测命令：`node --import tsx scripts/benchmark-backends.ts <缓存目录> [轮数]`。读取该目录选中的真实主模型和 HumanSL，交替测试两个后端，分别输出安装检查、进程初始化和 19 路两种局面在 400 / 4000 visits 下的耗时。使用应用的分析配置，结果输出到终端；保存测量记录时请放在仓库外。运行时避免其他 GPU 负载，启动测试和分析吞吐不可混为一个指标。

## 自定义引擎路径

可选：已有自定义安装时设置 `KATAGO_MODEL` 启用路径覆盖，支持 CUDA/TensorRT 版本。Windows 路径使用正斜杠：

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

主程序强制 `reportAnalysisWinratesAs=BLACK`，所有分析使用黑方视角。`.env` 文件位置见[环境配置](development.md#环境配置)。

## 模型库与选择

设置中的「围棋模型」替代原有的引擎连接面板；引擎启停、外部连接仍可用，AI 教练凭据独立放在「连接 LLM」页。模型库提供推荐、已下载、全部和名称 / 网络结构搜索；显示下载大小、适用棋盘、来源与 SHA-256，并支持后台排队下载、进度、取消、失败重试及删除未选用的模型。网络中断留下的 partial 可在重试时续传；主动取消会清理正在下载的 partial。

内置推荐由 [`config/katago/models.json`](../config/katago/models.json) 和现有 artifacts 清单固定：轻量 B10 是历史小网络，均衡 B18 是原默认网络，进阶 Transformer 是官方 tf3 网络。档位描述资源与使用场景，不代表本应用测得的段位、Elo 或速度；OpenCL 对 Transformer 可能较慢。B10 的摘要从官方 v1.3 Release 模型文件计算，Transformer 和 B18 的大小、摘要来自官方训练 API。HumanSL 作为独立伴随模型，可启用或关闭，不可误选为主分析模型。

「获取最新官方模型」读取 `katagotraining.org/api/networks/`，保留校验摘要、下载地址和模型基本信息，支持加载更早的目录。刷新失败时已保存的目录和本地模型仍可用。「添加其他模型」支持官方训练站、官方历史站及 KataGo GitHub Release 的 HTTPS `.bin.gz` / `.txt.gz` 链接，必须填写 SHA-256、用途与适用棋盘；不接受任意内网地址或可执行文件下载。

`katago/models.json` 保存模型目录与选择；`katago/models/<sha256>.bin.gz` 或 `<sha256>.txt.gz` 保存校验后的模型文件。后缀保留上游格式，KataGo 依此选择解析器。已有默认模型自动识别，应用升级不会重置选择。下载只入库，不自动切换；切换会停止当前引擎、以新模型运行真实初始化分析，成功后才持久化选择。失败或取消时保留原选择，可点击「启动引擎」恢复。当前选择和正在验证的模型不能删除。使用 `.env` 的 `KATAGO_MODEL` 自定义路径时，模型库仍可下载管理，但禁用托管选择，避免静默覆盖自定义配置。

模型 API：`GET /api/models` 返回目录、缓存状态、当前选择和待验证选择；`POST /api/models/download|cancel|delete` 接收 `{id}`；`select` 接收 `{main, human}`（`human` 可为 `null`）；`refresh` 接收 `{page}`；`add` 接收 `{name, url, sha256, role, boards}`。写操作使用与引擎管理相同的同源 JSON 请求保护。

下载采用 HTTPS、固定 SHA-256、临时文件、最终校验和重命名。网络错误自动重试最多 3 次，支持 HTTP Range 续传；服务端忽略 Range 时从头写入。中断后未通过验证的文件不会执行。手动停止删除未完成下载，意外断网留下的 partial 在下次启动尝试续传。文件损坏时优先从安装包中已校验的资源修复，否则重新下载。下载失败时显示资源名称、来源主机及可用的底层网络错误代码。安装锁防止多个本地实例同时展开资源，失效锁可恢复。

## 版本与来源

资源版本由清单固定；更新资源时应同步修改 revision，并运行启动测试。

- [`config/katago/artifacts.json`](../config/katago/artifacts.json)：主模型、HumanSL、Windows 发行包。
- [`config/katago/macos-bottles.json`](../config/katago/macos-bottles.json)：macOS Metal 1.18.2 及 libzip / xz / zstd / lz4 / abseil / protobuf 的固定 Homebrew ARM64 Sequoia bottle。至少 macOS 15；无需用户安装 Homebrew，动态库仅加入该子进程的 `DYLD_LIBRARY_PATH`。
- Windows 默认使用 [官方 1.18.1 OpenCL 包](https://github.com/lightvector/KataGo/releases/tag/v1.18.1)，CUDA 使用 [官方 1.18.2 包](https://github.com/lightvector/KataGo/releases/tag/v1.18.2)；保留可执行文件及随附 DLL。TensorRT 仍可通过 `.env` 自定义路径使用。
- 主模型 `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` 来自[官方训练网站](https://katagotraining.org/networks/)，摘要与 [Homebrew 公式](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb) 一致。
- HumanSL `b18c384nbt-humanv0.bin.gz` 来自 [KataGo 1.15.0 官方资产](https://github.com/lightvector/KataGo/releases/tag/v1.15.0)。清单摘要由该官方 HTTPS 资产计算；参考[人类模型说明](https://katagotraining.org/extra_networks/)。
- Homebrew 资源的完整 blob SHA-256 也在下载 URL 内；Windows 摘要对照 GitHub release asset digest。

KataGo 为 [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE)；依赖有各自许可。安装器保留归档内 LICENSE / COPYING / COPYRIGHT / NOTICE。不将第三方二进制或权重提交到仓库。普通版安装包携带两个官方模型及[模型许可](../config/katago/MODEL-LICENSE.txt)，启动时校验并复制到用户缓存；普通版安装包还携带对应平台的引擎及依赖归档（Windows OpenCL ZIP 或 macOS Metal Homebrew bottles），启动时优先使用已校验的缓存或 `GO_TRAINER_BUNDLED_RUNTIME` 指向的内置归档，缺失/损坏时才下载。minimal 安装包不预置引擎、DLL 或动态库依赖，首次启动时联网下载引擎、依赖和模型。两种平台的普通版均可离线安装引擎、依赖和模型；Windows 仍需显卡 OpenCL 驱动，macOS 无需安装 Homebrew。详见[发布说明](releases.md)。

## 搜索限制与统计

「AI 自动落子」提供按次数（50–1,000,000 visits）或按时间（0.1–120 秒）搜索，保存在本地设置中。`Training.searchLimit` 缺省为 `visits`，`maxTime` 缺省为 5 秒。时间模式通过 KataGo 的 `overrideSettings.maxTime` 限制每次搜索，并提高 visits 上限，正常返回当时的分析与落子；进程无响应时的传输超时仍是独立保护机制。后台曲线维持最多 100 visits，教练工具调用仍遵守各自的次数预算。

`Analysis.searchStats` 包含 `elapsedMs` 和 `visitsPerSecond`，后者为实际 `rootInfo.visits` 除以该请求发送后到本次结果的单调时钟耗时（含排队、传输开销），是平均速度，不是 GPU 理论吞吐。中间结果和最终结果均携带统计，Black 视角不变。通知栏显示实时统计，分析结果中保留最终统计；外部引擎未提供计时数据时只显示搜索次数。

`POST /api/bot-move` 继续支持 JSON，并在 `Accept: application/x-ndjson` 时发送中间 `analysis` 事件及含 `move`、`method`、`analysis` 的最终 `done` 事件。断开流会取消对应搜索。

## 控制与进程退出

在「设置 → 围棋模型」启动、停止、重启引擎或配置外部 HTTP 围棋 AI。手动停止后，引擎保持停止，直到再次启动引擎或重启应用；切换引擎会先释放旧进程。外部服务由用户独立管理启停，接入方式见[适配契约](#其他围棋-ai-适配契约)。

`GET /api/status` 的 `engine` 包含 `phase`、`ready`、`running`、`pid`、`backend`、下载 `progress` 和诊断 `error`。`phase` 有 idle / downloading / installing / starting / ready / stopping / stopped / error。

同源请求带 `Content-Type: application/json`、`X-Go-Trainer: 1`：

| 路由                         | 请求体       | 行为                                                 |
| ---------------------------- | ------------ | ---------------------------------------------------- |
| `POST /api/engine/start`     | `{}`         | 从停止/错误状态启动                                  |
| `POST /api/engine/stop`      | `{}`         | 取消下载/请求，等待已拥有子进程退出                  |
| `POST /api/engine/restart`   | `{}`         | 完全停止后重新安装检查、预热                         |
| `GET /api/engine/connection` | —            | 返回当前选择                                         |
| `POST /api/engine/connect`   | 下方连接对象 | 切换时持久化并释放旧进程，后台初始化；相同连接不重启 |

KataGo 直接使用 `spawn`，`shell:false`、`detached:false`，stdin 管道属于应用。正常关闭结束输入并发 SIGTERM，最多 2 秒后 SIGKILL，等待 close 事件；同步进程退出钩子也会终止拥有的子进程。KataGo 自身在 stdin EOF 后结束分析服务，这为父进程被强杀提供补充，不把它当成平台级 Job Object 保证。

桌面版关闭最后一个窗口即退出，包括 macOS。源码 Web 版 `Ctrl+C` 关闭整个服务；浏览器页面关闭不等于本地服务退出。对外部 HTTP 服务的“停止”只断开本软件连接，不管理外部进程。

## 其他围棋 AI 适配契约

内置连接为 `{"mode":"managed"}`。外部连接示例：

```json
{ "mode": "external", "name": "我的围棋 AI", "url": "http://127.0.0.1:9000/analyze" }
```

使用 HTTPS 或 loopback HTTP。当前不支持 URL 凭据、查询参数、重定向或 UI 内 API key。接入原生 GTP 引擎时需要自行提供 HTTP 桥接，并实现以下数据结构；不能直接填入 TCP/GTP 端口。

本软件向该完整 URL 发送 POST `{game, training}`，类型来自 [`shared/types.ts`](../shared/types.ts)；`game` 带棋盘大小、规则、贴目、初始摆子和完整落子历史。连接时会发送一次空 19 路、50 visits 分析以确认接口可用。支持 JSON 或 `application/x-ndjson`。

JSON 响应示例：

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

所有胜率、目差和归属数值必须是**黑方视角**，不能是当前行棋方视角。`turnNumber` 必须等于提交历史长度。可选 `ownership` 为 size² 个值，左上开始逐行，+1 黑 / −1 白；`policy` / `humanPolicy` 与 KataGo 行优先坐标一致，最后一项为 pass。字段范围由服务端 schema 校验。未提供 HumanSL 时训练策略回退到基于候选的采样；不把其他引擎输出声称为 KataGo 证据。

NDJSON 按行发送：

```json
{"type":"analysis","phase":"after","final":false,"analysis":{}}
{"type":"done","analysis":{}}
```

上例的 `{}` 必须替换为完整、合法的分析对象。最终必须有 `done`；断流和 `error` 事件视为失败。适配器应在客户端断开时取消上游计算。外部服务是否实际使用 GPU、其棋力及数值可比性由具体适配器决定。
