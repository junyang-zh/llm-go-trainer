# 发布桌面应用

GitHub Actions 在推送 `v*` tag 后构建并发布四个安装包：Windows 10/11 x64 × 含/不含权重、macOS 15+ Apple Silicon × 含/不含权重。无 32 位、Windows 7/8 或 Intel Mac 构建。安装包暂未使用开发者证书签名或 Apple 公证。

## 发布步骤

1. 更新 `package.json` 与 `package-lock.json` 中的版本（例如 `npm version 0.1.1 --no-git-tag-version`），按需更新 `docs/release-notes.md`。
2. 提交修改，确保工作区干净，推送代码。
3. 创建与 package.json 一致的 tag，并推送：

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

在仓库 Actions 的 `release` 工作流查看进度。构建使用 `windows-2022` x64 和 `macos-15` ARM64 runner；每个构建执行测试、TypeScript/Vite/服务构建、electron-builder 打包和权重内容校验。含权重版从固定清单下载主模型与 HumanSL，经 SHA-256 验证后才打包。模型缓存损坏时重新下载；不提交模型或二进制到 Git。

四个构建全部成功后，发布 job 检查文件名、数量与非空内容，生成 `SHA256SUMS.txt`，上传到草稿 Release，最后公开。仅发布 job 获得 `contents: write`，使用仓库自动提供的 `GITHUB_TOKEN`，无需配置个人 token。失败时可在 Actions 重跑；未公开的草稿可以继续上传，已公开的版本不被重写，应发布新版本。含 `-` 的版本（如 `0.2.0-beta.1`）标记为 prerelease。

也可在 Actions 手动运行工作流：选择分支时只构建并保留 Actions artifacts；选择版本 tag 时会尝试发布。不要先手工创建公开 Release。

## 本地构建

在目标系统安装 Node.js 24 和依赖后执行：

```sh
npm ci
npm run package:desktop -- no-models
npm run package:desktop -- with-models
```

输出位于 `release/no-models/` 和 `release/with-models/`。macOS 只在 Apple Silicon 构建 arm64 DMG；Windows 只在 x64 构建 NSIS EXE。两个版本共享应用标识和用户数据目录，可相互覆盖升级。

`with-models` 在 `Resources/katago-models/` 携带主模型、HumanSL、来源摘要及上游模型许可。启动时优先复用用户数据目录内校验通过的权重，再从安装包复制，缺失/损坏时才联网下载。`no-models` 不携带这部分资源。两者都在首次运行联网安装 KataGo 可执行文件及依赖，因此含权重版不是完整离线包。

当前 CI 校验安装包内权重，但不具备目标显卡驱动，不能代替真实 Windows OpenCL、macOS Metal 和安装流程的验证。公开发布前后应在目标系统检查安装、启动、引擎分析及退出。

配置依据：[GitHub runner 平台](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[electron-builder v26 配置](https://www.electron.build/v26/docs/configuration/)、[KataGo 模型许可](https://katagotraining.org/network_license/)。
