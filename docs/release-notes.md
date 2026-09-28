请选择与你的系统匹配的一个安装包：

| 文件名后缀                    | 系统                      | 内置权重         |
| ----------------------------- | ------------------------- | ---------------- |
| `windows-x64-with-models.exe` | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-no-models.exe`   | Windows 10/11 x64         | 首次启动下载     |
| `mac-arm64-with-models.dmg`   | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-no-models.dmg`     | macOS 15+ / Apple Silicon | 首次启动下载     |

两种版本功能相同。含权重版也需要首次联网安装 KataGo 引擎及其依赖；不属于完整离线安装包。Windows 版使用 OpenCL，需要对应显卡驱动。安装包不包含 LLM 凭据，LLM 在设置中自行连接。

目前安装包未使用开发者证书签名或 Apple 公证，系统可能提示未知发布者。macOS 请将应用拖入 Applications；如被 Gatekeeper 拦截，在系统设置 → 隐私与安全性中允许打开。Windows 请运行 `.exe` 安装器。

`SHA256SUMS.txt` 包含四个安装包的 SHA-256 摘要。GitHub 自动附带的 Source code 是源码，不是安装包。
