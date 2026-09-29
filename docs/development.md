# 开发指南

[English](en/development.md) · [简体中文](development.md) · [繁體中文](zh-TW/development.md) · [日本語](ja/development.md) · [한국어](ko/development.md)

[返回 README](../README.md) · [架构与路线](architecture.md) · [构建与发布](releases.md)

## 启动 Electron 桌面应用

需要 Node.js 22.12+（建议 24 LTS）、npm。macOS、Windows PowerShell 均可使用：

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
```

安装依赖后，在项目目录运行：

```sh
npm run desktop
```

这是日常运行和界面测试的默认入口。命令会先构建，再打开 Electron 窗口，自动启动本地服务与 KataGo。关闭窗口时，本地服务和应用启动的 KataGo 一起退出。

修改源码后，关闭旧窗口并重新执行 `npm run desktop`，即可构建并运行最新版本；此命令不提供源码热更新。

首次启动与服务配置见[使用指南](usage.md#安装与首次启动)、[引擎与模型](engines.md)和 [LLM 配置](llm.md)。

## 浏览器调试

需要前端热更新或定位浏览器问题时，可启动 Web 服务：

| 用途                  | 命令                              | 浏览器地址              |
| --------------------- | --------------------------------- | ----------------------- |
| 开发与热更新          | `npm run dev`                     | <http://127.0.0.1:5173> |
| 检查构建后的 Web 版本 | `npm run build`，然后 `npm start` | <http://127.0.0.1:3001> |

Web 模式需在终端按 `Ctrl+C` 关闭服务；关闭浏览器标签页不会结束服务或 KataGo。

<a id="environment"></a>

## 环境配置

源码运行时可将 [`.env.example`](../.env.example) 复制为项目根目录的 `.env`，提供默认配置；更改环境变量后需重启。环境排查可运行 `npm run doctor`。LLM 在应用内保存的配置优先于环境默认值，详见 [LLM 配置](llm.md)。

安装版的 `.env` 放在 Electron userData 目录，通常为 macOS `~/Library/Application Support/llm-go-trainer/.env` 或 Windows `%APPDATA%/llm-go-trainer/.env`；应用标识或命名变更时以 `app.getPath('userData')` 为准。自定义 KataGo / 模型路径请使用绝对路径，配置项见[自定义引擎路径](engines.md#自定义引擎路径)。引擎缓存和历史记录位置分别见[引擎与模型](engines.md#自动安装)、[历史存储](architecture.md#历史存储)。

`.env`、凭据、引擎二进制、模型、私人棋谱与本地运行日志不提交到仓库。

## 测试与验证

规则、服务与协议的自动测试：

```sh
npm test
npm run build
```

**界面和端到端测试优先使用 Electron**：

```sh
npm run desktop
```

在桌面窗口中检查棋盘缩放、设置、棋谱导入、流式分析和引擎启停，以及关闭窗口后的进程退出。

选点浏览的 Electron 自动回归：

```sh
npm run test:coach-layout
npm run test:i18n-layout
```

该测试使用独立临时存储，覆盖多个窗口尺寸下的选点高亮、距离亮度、双向悬浮/键盘连线、滚动裁剪、分组切换、分支定位及折叠恢复。

`test:i18n-layout` 使用 Electron 覆盖五语言、多窗口尺寸、模型通知、搜索开始/完成/错误/重试的预留布局、标题对齐与溢出。

自动测试覆盖围棋规则、SGF、对手采样、黑白视角、引擎生命周期、LLM 协议和界面交互。测试使用本地夹具，需允许 loopback 监听，无需配置 LLM API key。

CI 配置覆盖 Ubuntu、macOS 和 Windows 的测试与构建。

## 国际化维护

`src/i18n.ts` 解析系统语言、保存语言偏好并插值消息；`src/locales/{en,zh-CN,zh-TW,ja,ko}.json` 必须具有相同键和占位参数。UI 文字使用 `t(...)`；服务端诊断保留原文，在渲染时通过 `localizeDiagnostic(...)` 翻译，确保已有通知随语言变化。保留自定义名称和未知供应商输出，不翻译或替换运行时教练提示词。

简中 README 和文档保留原路径，其他语言使用 `README.<locale>.md` 与 `docs/<locale>/`。每页提供五语言对应页入口。修改文档时同步各语言，保持命令、配置名与技术约束一致，并检查相对链接。`tests/i18n.test.tsx` 检查语言解析、词条/参数一致性和切换时状态保留。

模拟评估只允许放在 `tests/fixtures/`，不能作为应用引擎的回退结果。验证结果、硬件、供应商与剩余缺口在对话中报告，会话报告和日志保留在仓库外。

<a id="local-build"></a>

## 桌面打包

本地打包命令、平台要求、输出目录与安装包验证统一见[构建与发布](releases.md#本地构建)；发布流程也在该文档中维护。

## 项目目录

```text
src/          Web UI 与 SVG 棋盘
shared/       纯 TypeScript 规则、SGF、训练策略
server/       本地 API、KataGo、LLM 与证据
desktop/      Electron 外壳
config/       KataGo 分析配置
prompts/      运行时讲棋提示词
skills/       可复用讲棋技能
docs/         使用、配置、开发与发布文档
tests/        规则与集成测试（无需真实模型）
```

模块职责与数据流见[架构与路线](architecture.md)。
