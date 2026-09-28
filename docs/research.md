# 技术调研与取舍

## KataGo 协议与部署

采用常驻 `katago analysis` JSONL 子进程：每个请求独立传完整历史，按 ID 关联返回。它比维护一份有状态 GTP 棋盘更适合复盘跳转与并发请求。读取候选 PV、搜索量、目差、胜率和 ownership，统一黑方视角。处理搜索中间响应、最终响应、取消、超时和异常退出；重启由生命周期管理器执行。[上游 Analysis Engine 文档](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md)

macOS M 系列使用上游 Metal 后端，支持 GPU / ANE 配置。自动安装器将固定 Homebrew ARM64 Sequoia bottle 和依赖解压到项目缓存，不要求用户安装 Homebrew；该发行组合要求 macOS 15+。[上游 README](https://github.com/lightvector/KataGo#macos)、[macOS 编译说明](https://github.com/lightvector/KataGo/blob/master/Compiling.md#macos)

Windows NVIDIA 默认自动安装官方 1.18.1 OpenCL 发行包，复用 NVIDIA 驱动提供的 OpenCL，降低独立 CUDA/TensorRT SDK 配置需求。1.18.2 上游 Windows 修订针对 CUDA，其他后端沿用 1.18.1。用户已有 CUDA/TensorRT 时可覆盖路径；DLL、驱动、CUDA/cuDNN/TensorRT 版本需严格匹配该 release。[官方 releases](https://github.com/lightvector/KataGo/releases)

## 人类对手与强度

HumanSL 是等级条件策略模型。首版加载独立主模型与 human model，并按 `rank_5k` 等 profile 的合法 `humanPolicy` 采样；主模型负责形势判断和停一手判断。该路线比任意挑选“次优手”更接近人类选点，但依然需要对局校准，不能承诺对应某棋站段位。[Human SL 指南](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md#human-sl-analysis-guide)

无 HumanSL 时采用我们的近似策略：在引擎已搜索且合法的候选中，剔除超过目损上限的点，再按先验和目损温度采样。激进度只在此模式中改变接触对手棋子的偏好；它不是完整的“攻击意识”。低 visits 下候选覆盖率和估计均有局限。纯 HumanSL 与最强模式禁用这些滑块以避免虚假控制。

## 规则、领地与数目

本地中国规则采用位置超级劫，对应 KataGo `chinese-ogs`，包含让子还点 N；日本规则采用单劫，对应 `japanese`。避免前端使用超级劫、后端却默认 `chinese` 单劫的不一致。复杂长循环裁决和日本终局确认尚未实现。[KataGo rules / GTP extensions](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md)

UI 区分归属预测与手动面积计分。ownership 是引擎对归属的估计；手动计分要求用户标死子、收官并核对双活。日本规则的正式数目流程尚未实现。

## 野狐 / 星阵棋谱

首版接受用户从客户端导出的 SGF，兼容 UTF-8、声明编码和无声明时的 GB18030 回退。解析括号树、转义、根摆子、让子和停一手；导入第一条主线，明确提示分支丢弃，导出训练后的新主线。[SGF FF[4] 规范](https://www.red-bean.com/sgf/sgf4.html)

通过标准 SGF 文件接入，暂不支持平台账号同步或私有二进制格式转换。

## LLM 接入

DeepSeek 走兼容 Chat Completions 的 HTTP 接口；base URL、模型名、思考深度和 API key 均可在连接设置中配置，环境变量作为默认值。调研时官方入口示例是 `deepseek-flash`，故作为默认值；模型名变化不需要改业务代码。密钥仅保存在本地服务端，不回传。[DeepSeek 官方快速开始](https://api-docs.deepseek.com/)

Codex 使用 `codex exec` stdin + 最终答复文件，独立临时工作目录、read-only sandbox、禁用 shell 功能且不加载用户配置。CLI 需支持本项目参数；不同安装版本先运行 doctor，并以本机 `codex exec --help` 为准。[OpenAI 非交互模式](https://developers.openai.com/codex/noninteractive)

Claude Code 使用 `-p --output-format stream-json --verbose --include-partial-messages`，通过 stdin 传任务；关闭内置工具，使用 strict MCP 配置接入本次讲解的围棋工具，并用 allowedTools 授权。不加载项目/用户 settings sources。[Claude CLI 参考](https://code.claude.com/docs/en/cli-reference)

Codex 和 Claude Code 均支持 Streamable HTTP MCP；本项目在请求期间创建本机 MCP 服务，通过执行回调报告搜索进度，CLI 的工具事件用于补充调用阶段。Codex 使用 `mcp_servers` 参数配置，Claude 使用 `--mcp-config`；两者均不修改用户全局配置。[Codex MCP](https://developers.openai.com/codex/mcp/) · [Claude MCP](https://code.claude.com/docs/en/mcp)

DeepSeek 使用原生 `tools` / `tool_calls` 多轮调用。流式参数需要按调用索引拼接，工具结果通过 `role=tool` 与 `tool_call_id` 关联；思考模式下保留并回传同次请求的 `reasoning_content`，界面只显示公开回答和执行状态。[DeepSeek 工具调用](https://api-docs.deepseek.com/guides/tool_calls/) · [思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)

跨平台不拼接 shell 命令。Windows npm 的 `.cmd` 包装需改成原生 exe，或 `node + CLI JS 入口`。连接检查使用 CLI 登录状态命令以及 DeepSeek `/models`，据此自动选择可用服务；检查不生成回答，也不证明特定 CLI 模型有额度。模型及深度分别映射到各家参数，Codex 可用档位来自本机公开模型缓存。[DeepSeek 模型列表](https://api-docs.deepseek.com/api/list-models/) · [Codex 配置](https://developers.openai.com/codex/config-reference/) · [Claude 模型设置](https://code.claude.com/docs/en/model-config)

## 怎样提高讲解质量

讲解以结构化证据为基础：合法棋盘和棋块气数由代码计算，胜率/目差/PV 由 KataGo 计算，LLM 解释目的、取舍和训练问题。每手采用前后两次分析，目损估计受搜索量影响；征子、双活等战术判断需要具体变化支持。

## Web UI 到桌面

React + SVG 棋盘共用纯 TypeScript 规则层；Node 本地服务持有 KataGo 与 LLM 进程。Electron 外壳可直接打包 `.app/.dmg` 或 Windows NSIS `.exe`，无须重写业务。当前已经提供外壳与打包入口，尚未签名、公证或做自动更新。将来改 SwiftUI / WinUI / Tauri 时，可保留同一 HTTP API 或替换为 IPC。[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
