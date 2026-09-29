# LLM 配置

[返回 README](../README.md) · [使用指南](usage.md)

在「设置 → 连接 LLM」配置服务。也可使用 `.env` 提供默认值，文件位置见[环境配置](development.md#环境配置)。更改环境变量后需重启应用。

主界面显示当前 LLM 和可用状态。「自动选择」依次检查 DeepSeek、Codex、Claude Code；手动选择则固定使用所选服务。检测结果缓存 30 秒，可点击「检测连接」立即刷新。

DeepSeek 通过 `/models` 检查认证和所选模型；CLI 分别通过 `codex login status`、`claude auth status` 检查登录状态。

模型和思考深度按服务分别保存，下一次分析生效。Codex 模型列表读取本机 CLI 的公开模型缓存，并按模型支持的档位筛选；没有缓存时仍可选择 CLI 默认或填写模型 ID。Claude 提供模型别名和自定义 ID。API 模型也可自定义，实际可用性由账号与服务决定。

## Agent 工作量上限

在 LLM 接入设置展开「Agent 工作量上限」，可调整每轮最长用时（10–3600 秒）、工具调用次数（1–200）、累计搜索量（4000–1000000 visits）。三项默认均无限制，输入框留空可取消对应限制；填写数字后启用该项上限。未保存最长用时时沿用 `LLM_TIMEOUT_MS`，该环境变量默认 0（无限制）。

达到任何一项上限会停止本轮执行，保留已有正文、工具结果与试下分支，在对话末尾显示原因和小按钮「继续」。点击后按当前设置补充一轮额度，使用原问题、原棋盘与服务以及服务端保存的已完成结果继续；暂停期间不运行 LLM 或搜索。继续会发起新的模型请求，不保留被中断的模型内部思考。手动停止、断网和普通服务错误不会显示此按钮。

待继续任务只在本次应用运行的内存中保留 30 分钟，最多保留最近 8 个；过期或重启后需重新提问。已完成正文和试下仍保存在对话历史中。

## DeepSeek API

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

## Codex / Claude Code CLI

先在终端完成所选 CLI 的安装与登录，确认 `codex exec --help` 或 `claude --help` 可用；在 UI 切换模型。必要时设置绝对路径：

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex 使用非交互 `exec`，模型通过 `--model`、思考深度通过 `-c model_reasoning_effort=…` 传入。应用使用独立配置，需安装支持 `--ignore-user-config` / `--ephemeral` 的 CLI 版本。[Codex 配置参考](https://developers.openai.com/codex/config-reference/)

Claude 使用 print 模式，模型和思考深度通过 `--model` / `--effort` 传入。Haiku 仅提供默认深度；其他模型的档位取决于 CLI 版本与供应商，CLI 可能将不支持的档位下调。[Claude 模型与深度](https://code.claude.com/docs/en/model-config#adjust-effort-level)

应用为每次 CLI 讲解自动接入临时 MCP 围棋工具，需使用支持 Streamable HTTP MCP 的 CLI 版本。DeepSeek 使用 API 原生工具调用，三种接入共用相同的搜索工具与执行记录。

CLI 教练可按需联网查阅围棋资料并附来源链接：Codex 显式设置 `web_search="live"`，Claude 开启并预授权内置 `WebSearch` / `WebFetch`。无需另配搜索 API key。当前局面的战术与数值仍由棋盘和围棋引擎支撑。DeepSeek API 接入目前不提供网页搜索。[Codex 网页搜索配置](https://learn.chatgpt.com/docs/config-file/config-basic#web-search) · [Claude 工具权限参数](https://code.claude.com/docs/en/cli-reference)

CLI 的环境默认值为 `CODEX_MODEL` / `CODEX_EFFORT`、`CLAUDE_MODEL` / `CLAUDE_EFFORT`；留空使用 CLI 默认。应用内保存的模型与深度优先。

Windows：优先使用原生 CLI `.exe`。若通过 npm 安装得到 `.cmd` shim，不能把它当原生可执行文件。用 `npm root -g` 确认安装目录，再设置 Node 与实际 JS 入口，例如 Codex：

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

Claude npm 包同理设置 `CLAUDE_PATH` / `CLAUDE_SCRIPT`，以该包实际入口为准。原生安装不设置 `*_SCRIPT`。GUI 启动时的 PATH 可能不同于终端，绝对路径最稳妥。

## 讲棋 Prompt / Skill

- [运行时中文教练提示词](../prompts/coach.zh-CN.md)：约束黑白视角、前后手比较、PV 引用、强弱棋优先级与教学深度。
- [可复用 go-coach 技能](../skills/go-coach/SKILL.md)：手动调用时读入同一教练规范。

解释某手时，LLM 会收到落子前后的棋盘、引擎候选与变化数据，并可按需补充搜索。提示词引导教练使用挖、粘、冲断、虎、立等符合棋形的术语说明目的与取舍。

Agent 正文支持坐标高亮、互斥变化开关及可保存的试下分支。语法与 `edit_trial` 工具约定见[交互讲解与试下分支](coach-links.md)。
