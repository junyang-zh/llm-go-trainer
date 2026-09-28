## v0.1.3

- 新增围棋模型管理：推荐档位、官方模型目录、自定义模型、下载进度与取消、模型切换和删除。
- Windows 新增 CUDA 后端，支持与 OpenCL 切换并保存选择。CUDA 不预装；首次选择时下载约 1.45 GiB 的已校验依赖，复用已有模型。
- 通知显示实时搜索次数和平均每秒搜索数；支持按搜索次数或时间限制分析，设置自动保存。
- 已缓存模型时，自动更新使用不含模型的 minimal 安装包，继续复用模型、后端和调优缓存。旧版需先更新到本版，后续更新才能使用此策略。
- 修复 Windows 首次 OpenCL 调优期间的启动状态和超时处理，隐藏 Windows 菜单栏。
- 精简设置界面，调整标签为「通用」「围棋模型」「AI 自动落子」「连接 LLM」。

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
