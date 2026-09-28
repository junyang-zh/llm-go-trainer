# 发布桌面应用

GitHub Actions 在推送 `v*` tag 后构建并发布四个安装包：Windows 10/11 x64 × 普通版/minimal 版、macOS 15+ Apple Silicon × 普通版/minimal 版。无 32 位、Windows 7/8 或 Intel Mac 构建。安装包暂未使用开发者证书签名或 Apple 公证。

## 发布步骤

1. 更新 `package.json` 与 `package-lock.json` 中的版本（例如 `npm version 0.1.1 --no-git-tag-version`），按需更新 `docs/release-notes.md`。
2. 准备本地提交，确保工作区干净。将待推送的 commit、具体改动、目标远端与分支、验证结果交给用户审阅，获得对本次推送的明确批准后，才推送代码。
3. 发布 tag 也必须先审阅：提供准确的版本/tag、目标 commit、目标远端、Release notes 和验证结果，获得明确批准后，才创建并推送与 package.json 一致的 tag。批准仅适用于已审阅的改动和目标；新增改动或替换远端 tag 必须重新审阅。选择版本号或要求实现发布流程不等于批准任何 push。

以下命令仅在相应分支和 tag 推送均获批准后执行：

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

在仓库 Actions 的 `release` 工作流查看进度。构建使用 `windows-2022` x64 和 `macos-15` ARM64 runner；每个构建执行测试、TypeScript/Vite/服务构建、electron-builder 打包、权重及各平台引擎、依赖归档内容校验。普通版从固定清单下载平台引擎、依赖、主模型与 HumanSL，经 SHA-256 验证后才打包。模型缓存损坏时重新下载；不提交模型或二进制到 Git。

四个构建全部成功后，发布 job 检查文件名、数量与非空内容，生成 `SHA256SUMS.txt`，上传到草稿 Release，最后公开。仅发布 job 获得 `contents: write`，使用仓库自动提供的 `GITHUB_TOKEN`，无需配置个人 token。失败时可在 Actions 重跑；未公开的草稿可以继续上传，已公开的版本不被重写，应发布新版本。含 `-` 的版本（如 `0.2.0-beta.1`）标记为 prerelease。

也可在 Actions 手动运行工作流：选择分支时只构建并保留 Actions artifacts；选择版本 tag 时会尝试发布。不要先手工创建公开 Release。

## 本地构建

在目标系统安装 Node.js 24 和依赖后执行：

```sh
npm ci
npm run package:desktop
npm run package:desktop -- minimal
```

不带参数时构建普通版，也可显式指定 `-- standard`；`-- minimal` 构建 minimal 版。输出分别位于 `release/standard/` 和 `release/minimal/`。普通版安装包不带版本类型后缀，minimal 版带 `-minimal` 后缀。macOS 只在 Apple Silicon 构建 arm64 DMG；Windows 只在 x64 构建 NSIS EXE。两个版本共享应用标识和用户数据目录，可相互覆盖升级。

应用图标和界面共用 `public/logo.svg`。构建时自动生成多分辨率 Windows ICO、macOS ICNS 和窗口 PNG，输出到忽略提交的 `.local/icons/`；修改 logo 后重新构建即可。

普通版在 `Resources/katago-models/` 携带主模型、HumanSL、来源摘要及上游模型许可。启动时优先复用用户数据目录内校验通过的权重，再从安装包复制，缺失/损坏时才联网下载。普通版还在资源目录的 `katago-runtime/` 携带固定 SHA-256 校验的引擎归档：Windows 使用官方 OpenCL ZIP（含可执行文件及 DLL），macOS 使用 Metal 引擎及全部动态库依赖的 Homebrew bottles，并保留上游声明。首次启动从内置归档安装，无需联网下载引擎、依赖或模型；Windows 需要系统已安装显卡 OpenCL 驱动，macOS 无需安装 Homebrew。`minimal` 不预置模型、KataGo 引擎或随附依赖，首次启动时联网下载。

当前 CI 校验安装包内权重和各平台引擎、依赖归档，但不具备目标显卡驱动，不能代替真实 Windows OpenCL、macOS Metal 和安装流程的验证。公开发布前后应在目标系统检查安装、启动、引擎分析及退出。

配置依据：[GitHub runner 平台](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[electron-builder v26 配置](https://www.electron.build/v26/docs/configuration/)、[KataGo 模型许可](https://katagotraining.org/network_license/)。
