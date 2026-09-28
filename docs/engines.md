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

服务先开始监听，再后台安装、下载、预热；页面不等待 GPU。首次启动需要网络和数百 MB 下载空间，解压和模型缓存额外占用空间。启动以一次分析成功作为 ready 条件。下载失败或平台不支持时显示错误，棋盘仍可用。

下载采用 HTTPS、固定 SHA-256、临时文件、最终校验和重命名。网络错误自动重试最多 3 次，支持 HTTP Range 续传；服务端忽略 Range 时从头写入。中断后未通过验证的文件不会执行。手动停止删除未完成下载，意外断网留下的 partial 在下次启动尝试续传。文件损坏会重新下载。安装锁防止多个本地实例同时展开资源，失效锁可恢复。

## 版本与来源

资源版本由清单固定；更新资源时应同步修改 revision，并运行启动测试。

- [`config/katago/artifacts.json`](../config/katago/artifacts.json)：主模型、HumanSL、Windows 发行包。
- [`config/katago/macos-bottles.json`](../config/katago/macos-bottles.json)：macOS Metal 1.18.2 及 libzip / xz / zstd / lz4 / abseil / protobuf 的固定 Homebrew ARM64 Sequoia bottle。至少 macOS 15；无需用户安装 Homebrew，动态库仅加入该子进程的 `DYLD_LIBRARY_PATH`。
- Windows 使用 [官方 1.18.1 OpenCL 包](https://github.com/lightvector/KataGo/releases/tag/v1.18.1)；保留可执行文件及随附 DLL。NVIDIA 驱动提供 OpenCL。CUDA / TensorRT 仍可通过 `.env` 自定义路径使用。
- 主模型 `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` 来自[官方训练网站](https://katagotraining.org/networks/)，摘要与 [Homebrew 公式](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb) 一致。
- HumanSL `b18c384nbt-humanv0.bin.gz` 来自 [KataGo 1.15.0 官方资产](https://github.com/lightvector/KataGo/releases/tag/v1.15.0)。清单摘要由该官方 HTTPS 资产计算；参考[人类模型说明](https://katagotraining.org/extra_networks/)。
- Homebrew 资源的完整 blob SHA-256 也在下载 URL 内；Windows 摘要对照 GitHub release asset digest。

KataGo 为 [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE)；依赖有各自许可。安装器保留归档内 LICENSE / COPYING / COPYRIGHT / NOTICE。不将第三方二进制或权重提交到仓库。含权重安装包携带两个官方模型及[模型许可](../config/katago/MODEL-LICENSE.txt)，启动时校验并复制到用户缓存；引擎及依赖仍首次联网安装。详见[发布说明](releases.md)。

## 控制与进程退出

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
