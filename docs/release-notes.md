# 更新记录

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ko/release-notes.md)

## v0.1.5

- Agent 现在可以加载棋局、保存当前局面或试下分支、修改棋局名称，棋盘与棋谱库同步更新。试下保存为同源新棋局，保留原谱；暂停后继续时保留新的棋局上下文。
- 修复长时间讲棋报「CLI 输出超出限制」：移除 Codex / Claude CLI 累计输出、Codex 回答文件和前端本地消息的固定长度限制，工具结果不再触发隐藏的总量上限。
- 新增棋谱库搜索、分页、改名、来源信息和同源分支分组。普通版预置 CWI 完整棋谱归档，minimal 版可在棋谱下载面板按需安装；不提供预置定式或死活题。
- 新增野狐围棋棋谱查询与导入，可按用户名或 UID 查询并下载到本地棋谱库，重复导入保留同一棋局记录。
- minimal 版不再在首次启动时自动下载引擎和模型；需要本地引擎时，在「设置 → 围棋模型」点击「下载并启用 KataGo」。已有模型、棋谱和对话继续保留。
- 项目采用 MIT 许可，应用内增加许可说明，并补充第三方组件和棋谱来源声明。第三方资源仍遵循各自许可。

请选择与你的系统匹配的一个安装包：

| 文件名后缀                | 系统                      | 内置权重         |
| ------------------------- | ------------------------- | ---------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 设置中手动下载   |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 设置中手动下载   |

两种版本功能相同。Windows 普通版内置 KataGo OpenCL 引擎及随附 DLL，无需联网下载引擎和模型，但仍需要对应显卡的 OpenCL 驱动。macOS 普通版内置 Metal 引擎及动态库依赖，无需联网下载引擎和模型，也无需安装 Homebrew。两种平台的 minimal 版均不预置引擎、随附依赖或模型，需在「设置 → 围棋模型」中手动下载并启用。下载错误显示失败的资源、来源主机及可用的网络错误代码。安装包不包含 LLM 凭据，LLM 在设置中自行连接。

macOS 请将应用拖入 Applications。发布凭据齐全时，安装包使用 Developer ID 签名及 Apple 公证；否则提供未签名、未公证的安装包，首次运行可能受到 macOS 安全检查拦截。Windows 请运行 `.exe` 安装器；Windows 安装器尚未配置代码签名，系统可能提示未知发布者。

“设置 → 通用”提供 GitHub Release 更新检查与自动更新开关。已有校验通过的模型时，更新使用 minimal 安装包；未缓存模型的普通版仍使用普通版安装包。Windows 及使用 Developer ID 签名的 macOS 安装版可在下载完成后点击“重启并安装”；未签名 macOS 安装版可检查更新并打开 Release 页面手动下载安装。

Release 中的 `.zip` 和 `.yml` 供自动更新使用；首次安装请选择上表中的 `.dmg` 或 `.exe`。`SHA256SUMS.txt` 包含安装包和更新文件的 SHA-256 摘要。GitHub 自动附带的 Source code 是源码，不是安装包。
