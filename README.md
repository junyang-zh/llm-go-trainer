# LLM Go Trainer

围棋训练工具，支持 KataGo 对战、棋谱复盘和 LLM 讲解。默认以 Electron 桌面应用运行，可打包为 macOS / Windows 应用。

## 下载安装包

前往 [GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases)，选择 Windows 10/11 x64 的 `.exe` 或 macOS 15+ Apple Silicon 的 `.dmg`。每个平台提供 `with-models`（含主模型与 HumanSL 权重）和 `no-models`（首次运行下载权重）两种版本，功能相同。两种版本首次运行都需要联网安装 KataGo 引擎及依赖。安装包目前未使用开发者证书签名或 Apple 公证。

## 启动 Electron 桌面应用

需要 Node.js 22.12+（建议 24 LTS）、npm。macOS、Windows PowerShell 均可使用：

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
```

安装依赖后，在项目目录运行：

```sh
npm run desktop
```

这是日常运行和界面测试的默认入口。命令会先构建，再打开 Electron 窗口，自动启动本地服务与 KataGo。关闭窗口时，本地服务和应用启动的 KataGo 一起退出。

修改源码后，关闭旧窗口并重新执行 `npm run desktop`，即可构建并运行最新版本；此命令不提供源码热更新。

首次启动会在源码的 `.local/katago/` 下载引擎、主模型和 HumanSL 模型，并在后台初始化 GPU。进度可在“设置 → 连接”查看；期间可以落子、导入 SGF 和复盘。完成后自动启用分析和对战，后续启动复用已校验的缓存。

LLM 在应用的「设置 → 连接」中配置，与围棋 AI 放在一起。默认自动选择可用服务；DeepSeek API key、模型和思考深度均可在这里保存。也可以复制 `.env.example` 为 `.env` 提供默认配置（更改环境变量后需重启）。环境排查可运行 `npm run doctor`。

### 可选：浏览器调试

需要前端热更新或定位浏览器问题时，可启动 Web 服务：

| 用途                  | 命令                              | 浏览器地址              |
| --------------------- | --------------------------------- | ----------------------- |
| 开发与热更新          | `npm run dev`                     | <http://127.0.0.1:5173> |
| 检查构建后的 Web 版本 | `npm run build`，然后 `npm start` | <http://127.0.0.1:3001> |

Web 模式需在终端按 `Ctrl+C` 关闭服务；关闭浏览器标签页不会结束服务或 KataGo。

## 当前功能

| 功能     | v0.1 状态                                                                       |
| -------- | ------------------------------------------------------------------------------- |
| 棋盘     | 9 / 13 / 19 路；提子、自杀禁着、劫；自由复盘、停一手、主线导航                  |
| 人机对战 | KataGo JSONL；可执黑/白；0 或 2–9 子让子；自定义贴目                            |
| 难度     | HumanSL 等级采样；无模型时回退到限制目损的随机选点；最强模式                    |
| 棋风     | 随机度、目损上限；近似激进度 = 接触战偏好，限随机模式                           |
| 分析     | 按手数显示黑方胜率/目差曲线、候选开关、PV 试读、归属预测                        |
| 数目     | 中国规则手动标记死子后的面积预览，含让子还点                                    |
| 棋谱     | 野狐/星阵导出的标准 SGF；UTF-8 / GB18030；根摆子与主线；SGF 导出                |
| 教练     | Markdown 流式对话、工具搜索与执行记录；解释选点、局势和变化；停止分析、导出证据 |
| LLM      | DeepSeek API、Codex CLI、Claude Code CLI 适配器                                 |
| 桌面     | Electron；tag 触发 CI 发布四种 `.dmg` / NSIS `.exe` 安装包，尚未签名            |

SGF 有多个变体时只导入第一条主线；原注释与分支不写入训练记录。中途摆子/修改行棋方的特殊 SGF 会明确拒绝。日本规则可以对战与引擎分析，正式终局数目尚未实现。HumanSL 等级不等于野狐/星阵认证等级。当前没有平台账号直连、整局自动批量讲解、读秒、认输、持久化分析缓存。

## 棋局历史、试下与对话

棋局自动保存到本机历史库，在「历史棋局」中选择棋局或导入/导出 SGF。桌面应用默认使用 Electron 的 `userData/history`，Web 模式使用 `.local/history`；可用 `GO_TRAINER_HISTORY_DIR` 指定其他可写目录。数据库为按记录原子写入的 JSON 文档库，无需额外安装数据库，也不写入应用安装包。使用系统临时目录时，数据可能被系统清理。

主页使用「AI 自动落子」开关，并可直接选择「AI 执白 / AI 执黑」。关闭时双方均可手动落子，开启时 AI 自动走所选颜色。主线末尾落子进入实战记录；在历史手数落子（包括 AI 落子与停一手）进入试下分支，原主线不变，棋子以平底环线和「试」角标标识。存在试下时显示「清空试下」和「保存试下为新棋局」。历史局面下还可点击「分支新棋局」，保留原局并把当前局面另存；后续落子进入新局主线。切换复盘手数或棋局会结束当前未保存的试下。试下局面可直接请求分析与教练讲解。

对话独立于棋局：切换棋局、手数、导入或新建棋局均保留当前对话与草稿。「新对话」创建独立会话，「历史对话」恢复已保存会话。每轮记录提问时的棋局 ID、原局手数、时间与试下手顺；失败或停止的分析也保留记录。应用重启后，未完成的分析标记为已中断。

教练通过 `query_game_history` 查询历史棋局列表，或按 `gameId` 与 `turn` 读取棋谱和局面；当前上下文还包含用户试下手顺。棋局历史查询不依赖当前对话，也不会修改棋谱。

## 界面与流式分析

主界面按窗口宽高布局，棋盘自动适配剩余空间；页面本身不滚动，对话和设置各自滚动。左上角 logo 旁的齿轮是统一设置入口，包含“对局训练”和“连接”两页；LLM 和围棋引擎状态在对话区顶部并排显示。

右侧常驻「目差 / 胜率」面板，默认收起，展开后显示两条按手数排列的曲线。引擎就绪后自动分析当前局面，每次使用 `min(训练 visits, 100)`；人机对战复用对手搜索结果。导入棋谱后可点击「补全曲线」依次分析缺失手数，也可随时停止。后台曲线查询使用围棋引擎，前台分析和 AI 落子优先。

曲线的胜率和目差均为黑方视角：正目差表示黑方领先，负值表示白方领先，属于引擎估计。未分析手数保留空缺，未完成搜索用空心点标记；点击曲线上的点可跳到对应手数。回退复盘保留当前主线的历史数据；更换棋谱、规则/贴目或引擎时隔离旧结果。曲线数据仅在本次运行中保留，较深的已完成搜索不会被后台低 visits 结果覆盖。

棋盘下方「候选点」可同时显示或隐藏棋盘 A/B/C 标记与右侧候选列表。聊天支持 Markdown 标题、列表、强调、表格、引用和代码块；长表格和代码块单独滚动。网页链接由系统浏览器打开。

分析时先显示 KataGo 搜索量、黑方胜率/目差与主要变化，再显示 LLM 回答。DeepSeek 和 Claude Code 支持增量正文；Codex 的更新粒度取决于 CLI 版本，部分版本在完整消息生成后才返回正文。

教练可主动检查棋块与气，试下指定手顺并调用引擎搜索后续应对。例如提问“这块白棋是否安定”，它可以比较攻击、防守或脱先的变化。对话内显示每次工具执行的状态，展开可查看试下手顺、目差和主变化；点击“停止”会取消正在执行的搜索与模型请求。试下结果保存在本次讲解记录中，实战棋谱保持原样。

点击“停止”或关闭请求会取消对应 KataGo 查询 / LLM 请求 / CLI 子进程。中断时保留已收到的内容，并标记未完成；只有完成的讲解进入后续对话上下文。

## KataGo 与其他围棋 AI

源码附带引擎安装器和版本清单，首次运行联网下载并校验文件。下载失败可在设置中点击“重启”；已完成的文件会复用。网络中断自动重试并续传，手动取消会删除未完成文件。

| 系统                      | 自动安装                                                                          |
| ------------------------- | --------------------------------------------------------------------------------- |
| macOS 15+ / Apple Silicon | KataGo 1.18.2 **Metal**，使用固定 Homebrew bottle 及其动态库，不要求安装 Homebrew |
| Windows x64 / NVIDIA      | KataGo 1.18.1 **OpenCL**，使用官方发行包；需要显卡厂商的 OpenCL 驱动              |

Windows 默认使用 OpenCL，需安装 NVIDIA 显卡驱动。已有 CUDA/TensorRT 引擎可通过下面的路径配置使用，驱动与运行库要求以对应发行版本为准。暂不支持 Intel Mac、Windows ARM64 的自动安装。启动失败时可在设置中查看诊断信息。

“设置 → 连接”提供 **启动 / 停止 / 重启**，以及外部围棋 AI 的 HTTP 适配接口。手动停止后，引擎保持停止，直到再次启动引擎或重启应用。切换引擎会先释放旧进程。外部服务需实现[引擎接口契约](docs/engines.md)；原生 GTP 引擎需通过 HTTP 桥接服务接入。

应用启动的 KataGo 作为子进程运行，随应用退出。连接外部 AI 时，该服务由用户独立管理启停。

可选：已有自定义安装时设置 `KATAGO_MODEL` 启用路径覆盖，支持 CUDA/TensorRT 版本。Windows 路径使用正斜杠：

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

主程序强制 `reportAnalysisWinratesAs=BLACK`。`GO_TRAINER_DATA_DIR` 可覆盖默认缓存目录。固定下载清单、校验值、来源和许可说明见[引擎部署文档](docs/engines.md)。

## LLM 接入

主界面显示当前 LLM 和可用状态。「自动选择」依次检查 DeepSeek、Codex、Claude Code；手动选择则固定使用所选服务。检测结果缓存 30 秒，可点击「检测连接」立即刷新。

DeepSeek 通过 `/models` 检查认证和所选模型；CLI 分别通过 `codex login status`、`claude auth status` 检查登录状态。

模型和思考深度按服务分别保存，下一次分析生效。Codex 模型列表读取本机 CLI 的公开模型缓存，并按模型支持的档位筛选；没有缓存时仍可选择 CLI 默认或填写模型 ID。Claude 提供模型别名和自定义 ID。API 模型也可自定义，实际可用性由账号与服务决定。

### DeepSeek API

在「DeepSeek」中填写 API key 并保存即可。下列环境变量仍可作为默认值：

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EFFORT=default
```

思考深度映射到 `reasoning_effort`：关闭 / 低 / 高 / 最高对应 `none / low / high / max`；「模型默认」不传此参数。使用供应商默认输出预算，深度影响延迟和用量。[DeepSeek 请求参数](https://api-docs.deepseek.com/api/create-chat-completion/)

应用内配置覆盖对应环境变量；「移除本机 key」删除应用保存的密钥后回退到 env。源码运行保存到 `.local/settings/llm.json`，桌面包保存到应用 userData 下的 `settings/llm.json`。配置文件包含明文密钥，macOS/Linux 权限为 `0600`，Windows 使用所在用户目录的访问权限。更换密钥时填写新值并保存；更换 API 服务域名时需重新输入对应的 key。

点击提问会把当前棋盘、相关引擎数据和本局面对话发送到所选 LLM，产生对应服务用量。

### Codex / Claude Code CLI

先在终端完成所选 CLI 的安装与登录，确认 `codex exec --help` 或 `claude --help` 可用；在 UI 切换模型。必要时设置绝对路径：

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex 使用非交互 `exec`，模型通过 `--model`、思考深度通过 `-c model_reasoning_effort=…` 传入。应用使用独立配置，需安装支持 `--ignore-user-config` / `--ephemeral` 的 CLI 版本。[Codex 配置参考](https://developers.openai.com/codex/config-reference/)

Claude 使用 print 模式，模型和思考深度通过 `--model` / `--effort` 传入。Haiku 仅提供默认深度；其他模型的档位取决于 CLI 版本与供应商，CLI 可能将不支持的档位下调。[Claude 模型与深度](https://code.claude.com/docs/en/model-config#adjust-effort-level)

应用为每次 CLI 讲解自动接入临时 MCP 围棋工具，需使用支持 Streamable HTTP MCP 的 CLI 版本。DeepSeek 使用 API 原生工具调用，三种接入共用相同的搜索工具与执行记录。

CLI 的环境默认值为 `CODEX_MODEL` / `CODEX_EFFORT`、`CLAUDE_MODEL` / `CLAUDE_EFFORT`；留空使用 CLI 默认。应用内保存的模型与深度优先。

Windows：优先使用原生 CLI `.exe`。若通过 npm 安装得到 `.cmd` shim，不能把它当原生可执行文件。用 `npm root -g` 确认安装目录，再设置 Node 与实际 JS 入口，例如 Codex：

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

Claude npm 包同理设置 `CLAUDE_PATH` / `CLAUDE_SCRIPT`，以该包实际入口为准。原生安装不设置 `*_SCRIPT`。GUI 启动时的 PATH 可能不同于终端，绝对路径最稳妥。

## 讲棋 Prompt / Skill

- [运行时中文教练提示词](prompts/coach.zh-CN.md)：约束黑白视角、前后手比较、PV 引用、强弱棋优先级与教学深度。
- [可复用 go-coach 技能](skills/go-coach/SKILL.md)：手动调用时读入同一教练规范。
- [调研与原始来源](docs/research.md)：协议、硬件、人类模型、SGF、CLI 和设计取舍。
- [架构与路线](docs/architecture.md)：后续整局复盘、缓存、真实等级校准及桌面发布。

解释某手时，LLM 会收到落子前后的棋盘、引擎候选与变化数据，并可按需补充搜索。提示词引导教练使用挖、粘、冲断、虎、立等符合棋形的术语说明目的与取舍。

## 测试与桌面构建

规则、服务与协议的自动测试：

```sh
npm test
npm run build
```

**界面和端到端测试优先使用 Electron**：

```sh
npm run desktop
```

在桌面窗口中检查棋盘缩放、设置、棋谱导入、流式分析和引擎启停，以及关闭窗口后的进程退出。

自动测试覆盖围棋规则、SGF、对手采样、黑白视角、引擎生命周期、LLM 协议和界面交互。测试使用本地夹具，需允许 loopback 监听，无需配置 LLM API key。

在目标操作系统打包（默认不发布）：

```sh
npm run package:desktop -- no-models
npm run package:desktop -- with-models
```

桌面发布需在 Apple Silicon macOS / x64 Windows 分别构建，也可推送版本 tag 由 CI 自动构建并上传四个安装包，详见[发布步骤](docs/releases.md)。打包后 `.env` 放到 Electron userData 目录，通常为 macOS `~/Library/Application Support/llm-go-trainer/.env` 或 Windows `%APPDATA%/llm-go-trainer/.env`；自定义 KataGo/模型路径请使用绝对路径。应用标识/命名变更时以 `app.getPath('userData')` 为准。引擎与模型缓存到 userData 的 `katago/`，首次启动需联网。

CI 配置覆盖 Ubuntu、macOS 和 Windows 的测试与构建。

## 目录

```text
src/          Web UI 与 SVG 棋盘
shared/       纯 TypeScript 规则、SGF、训练策略
server/       本地 API、KataGo、LLM 与证据
desktop/      Electron 外壳
config/       KataGo 分析配置
prompts/      运行时讲棋提示词
skills/       可复用讲棋技能
docs/         调研、架构、引擎接口
tests/        规则与集成测试（无需真实模型）
```
