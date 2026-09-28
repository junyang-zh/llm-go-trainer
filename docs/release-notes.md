请选择与你的系统匹配的一个安装包：

| 文件名后缀                | 系统                      | 内置权重         |
| ------------------------- | ------------------------- | ---------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 首次启动下载     |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 首次启动下载     |

两种版本功能相同。Windows 普通版内置 KataGo OpenCL 引擎及随附 DLL，无需联网下载引擎和模型，但仍需要对应显卡的 OpenCL 驱动。macOS 普通版内置 Metal 引擎及动态库依赖，无需联网下载引擎和模型，也无需安装 Homebrew。两种平台的 minimal 版均不预置引擎、随附依赖或模型，首次启动时联网下载。下载错误显示失败的资源、来源主机及可用的网络错误代码。安装包不包含 LLM 凭据，LLM 在设置中自行连接。

目前安装包未使用开发者证书签名或 Apple 公证，系统可能提示未知发布者。macOS 请将应用拖入 Applications；如被 Gatekeeper 拦截，在系统设置 → 隐私与安全性中允许打开。Windows 请运行 `.exe` 安装器。

`SHA256SUMS.txt` 包含四个安装包的 SHA-256 摘要。GitHub 自动附带的 Source code 是源码，不是安装包。
