# 更新记录

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ko/release-notes.md)

## v0.1.4

- 新增五语言界面：英文、简体中文、繁体中文、日语和韩语，默认跟随系统语言，支持在通用设置中切换并保存偏好。通知、模型面板和已显示的状态同步切换语言。
- 修复「目差 / 胜率」面板在计算前后的高度跳变：预留候选变化空间，当前胜率与标题同行，折叠时隐藏；搜索次数和次数/秒移至已分析进度处。
- 增强交互式讲棋：正文坐标可高亮并连接棋盘，支持分组变化开关；教练可创建和编辑试下分支，随对话保存，不修改实战棋谱。
- 新增 Agent 工作量上限，可限制单轮用时、工具调用次数和累计搜索量；达到上限后保留结果并支持继续，默认无限制。
- Codex / Claude Code 教练支持按需联网查阅资料并提供来源；当前局面的战术和数值仍以棋盘与引擎证据为准。DeepSeek 暂不提供网页搜索。
- README 和使用、引擎、LLM、开发、发布、架构文档提供五语言版本，并添加 CI 与最新 Release 徽章。

请选择与你的系统匹配的一个安装包：

| 文件名后缀                | 系统                      | 内置权重         |
| ------------------------- | ------------------------- | ---------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 首次启动下载     |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 首次启动下载     |

两种版本功能相同。Windows 普通版内置 KataGo OpenCL 引擎及随附 DLL，无需联网下载引擎和模型，但仍需要对应显卡的 OpenCL 驱动。macOS 普通版内置 Metal 引擎及动态库依赖，无需联网下载引擎和模型，也无需安装 Homebrew。两种平台的 minimal 版均不预置引擎、随附依赖或模型，首次启动时联网下载。下载错误显示失败的资源、来源主机及可用的网络错误代码。安装包不包含 LLM 凭据，LLM 在设置中自行连接。

macOS 请将应用拖入 Applications。发布凭据齐全时，安装包使用 Developer ID 签名及 Apple 公证；否则提供未签名、未公证的安装包，首次运行可能受到 macOS 安全检查拦截。Windows 请运行 `.exe` 安装器；Windows 安装器尚未配置代码签名，系统可能提示未知发布者。

“设置 → 通用”提供 GitHub Release 更新检查与自动更新开关。已有校验通过的模型时，更新使用 minimal 安装包；未缓存模型的普通版仍使用普通版安装包。Windows 及使用 Developer ID 签名的 macOS 安装版可在下载完成后点击“重启并安装”；未签名 macOS 安装版可检查更新并打开 Release 页面手动下载安装。

Release 中的 `.zip` 和 `.yml` 供自动更新使用；首次安装请选择上表中的 `.dmg` 或 `.exe`。`SHA256SUMS.txt` 包含安装包和更新文件的 SHA-256 摘要。GitHub 自动附带的 Source code 是源码，不是安装包。
