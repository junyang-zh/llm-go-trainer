# 更新记录

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ko/release-notes.md)

## v0.1.7

- 胜率与目差曲线在试下时保留完整实战主线：试下使用红色，原谱后续使用灰色；清空试下后立即恢复已缓存的主线曲线。所有数值继续使用黑方视角。
- 后台自动补全实战与试下的缺失评估，优先分析当前局面；调整搜索中、完成和错误通知，完成通知显示实际分析手数及引擎提供的搜索速度。
- 领地预测仅显示绝对归属值至少 0.8 的点，使用清晰的黑白标记；可与候选点及试下编号同时显示，并错开标记位置。
- 教练回答支持整块棋的多坐标引用和柔和雾状高亮，支持分组及键盘聚焦；文字离开可视范围或棋盘切换局面时隐藏。单点引用连线改从标记右下缘出发，并同步更新教练提示词和各语言说明。
- 更新 README 中的界面示例截图。

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
