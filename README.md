# LLM Go Trainer

[![CI](https://github.com/junyang-zh/llm-go-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/junyang-zh/llm-go-trainer/actions/workflows/ci.yml)
[![最新版本](https://img.shields.io/github/v/release/junyang-zh/llm-go-trainer)](https://github.com/junyang-zh/llm-go-trainer/releases/latest)

[English](README.en.md) · [简体中文](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

围棋训练工具，支持本地部署 [KataGo](https://github.com/lightvector/katago) 对战、棋谱复盘和接入 LLM agent 讲解。支持 macOS / Windows。

![LLM Go Trainer 桌面界面：棋盘复盘与试下、KataGo 胜率和目差曲线，以及 LLM 教练讲解](assets/UI-Example.png)

_在同一界面复盘棋局、探索变化，并结合 KataGo 分析与 LLM 讲解理解局势。_

## 主要功能

- **人机对战**：支持 9 / 13 / 19 路棋盘、让子与贴目设置，使用 KataGo 和 HumanSL 调整对手选点。
- **棋谱复盘**：在「棋谱」浏览历史对局与经典名局；支持搜索、SGF 导入 / 导出，复盘试下另存为同源棋谱组。
- **局势分析**：查看胜率、目差曲线、候选点、主要变化与归属预测。
- **AI 教练**：接入 DeepSeek API、Codex CLI 或 Claude Code CLI，结合引擎分析讲解选点、局势与变化。

- **界面语言**：英文、简体中文、繁体中文、日语、韩语，默认跟随系统语言。

详细操作与功能边界见[使用指南](docs/usage.md)。

## 下载与开始使用

前往 [GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases) 下载：

| 平台                      | 安装包 |
| ------------------------- | ------ |
| Windows 10/11 x64         | `.exe` |
| macOS 15+ / Apple Silicon | `.dmg` |

普通版内置引擎、依赖、模型与经典名局；`minimal` 版首次运行下载引擎与模型，棋谱通过「下载棋谱」按需安装，两种版本功能相同。安装与首次配置见[使用指南](docs/usage.md#安装与首次启动)，版本变化见[更新记录](docs/release-notes.md)。

## 文档

| 文档                               | 内容                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| [使用指南](docs/usage.md)          | 安装、对战、棋谱复盘、试下、教练对话与应用更新          |
| [引擎与模型](docs/engines.md)      | KataGo 安装、模型库、计算后端、自定义路径与外部 AI 接口 |
| [LLM 配置](docs/llm.md)            | DeepSeek / Codex / Claude Code 接入、凭据与讲棋提示词   |
| [交互讲解](docs/coach-links.md)    | 坐标链接、变化开关与试下分支                            |
| [开发指南](docs/development.md)    | Electron 源码启动、浏览器调试、测试与项目目录           |
| [构建与发布](docs/releases.md)     | 本地打包、GitHub Release、签名、公证与自动更新          |
| [架构与路线](docs/architecture.md) | 模块职责、流式协议、数据存储与后续计划                  |
