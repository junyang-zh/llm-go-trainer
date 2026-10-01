# 更新记录

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ko/release-notes.md)

## v0.1.6

- SGF 导入保留完整变化树、注释与棋盘标记，支持含多个棋局的 SGF 集合。每个文件显示为一个本地棋局条目，可用于浏览用户自己的定式大全。
- 新增变化树浏览：选择手顺、返回上层、切换变化，并将选定局面放到主棋盘。摆子、提子及指定下一手方的节点也可浏览；试下可另存为同源棋局，完整原谱继续保留并可导出。
- 移除 SGF 导入的文件大小、节点数与嵌套深度限制；未注明或不支持的规则继续按现有逻辑使用中国规则，移除对应的导入提示。
- 手顺路径与变化选择按钮增加细线框和浅背景，与导航及放置到棋盘按钮作出视觉区分。
- Codex / Claude 设置新增 CLI 路径及可选 Node 路径，支持原生程序和 Node 脚本入口，改善桌面启动时的 CLI 查找与检测。

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
