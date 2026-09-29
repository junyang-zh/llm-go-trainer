# LLM Go Trainer

[![CI](https://github.com/junyang-zh/llm-go-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/junyang-zh/llm-go-trainer/actions/workflows/ci.yml)
[![最新版本](https://img.shields.io/github/v/release/junyang-zh/llm-go-trainer)](https://github.com/junyang-zh/llm-go-trainer/releases/latest)

[English](README.en.md) · [简体中文](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

圍棋訓練工具，支援本地部署 [KataGo](https://github.com/lightvector/katago) 對戰、棋譜復盤和接入 LLM agent 講解。支援 macOS / Windows。

![LLM Go Trainer 桌面介面：棋盤復盤與試下、KataGo 勝率和目差曲線，以及 LLM 教練講解](assets/UI-Example.png)

_在同一介面復盤棋局、探索變化，並結合 KataGo 分析與 LLM 講解理解局勢。_

## 主要功能

- **人機對戰**：支援 9 / 13 / 19 路棋盤、讓子與貼目設定，使用 KataGo 和 HumanSL 調整對手選點。
- **棋譜復盤**：導入 / 導出 SGF、保存歷史棋局，在任意歷史局面試下變化並另存新棋局。
- **局勢分析**：查看勝率、目差曲線、候選點、主要變化與歸屬預測。
- **AI 教練**：接入 DeepSeek API、Codex CLI 或 Claude Code CLI，結合引擎分析講解選點、局勢與變化。

- **介面語言**：英文、簡體中文、繁體中文、日語、韓語，預設跟隨系統語言。

詳細操作與功能邊界見[使用指南](docs/zh-TW/usage.md)。

## 下載與開始使用

前往 [GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases) 下載：

| 平台                      | 安裝包 |
| ------------------------- | ------ |
| Windows 10/11 x64         | `.exe` |
| macOS 15+ / Apple Silicon | `.dmg` |

普通版內建引擎、依賴與模型；`minimal` 版在首次運行時下載，兩種版本功能相同。安裝與首次設定見[使用指南](docs/zh-TW/usage.md#installation)，版本變化見[更新記錄](docs/zh-TW/release-notes.md)。

## 文檔

| 文檔                                     | 內容                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| [使用指南](docs/zh-TW/usage.md)          | 安裝、對戰、棋譜復盤、試下、教練對話與應用更新        |
| [引擎與模型](docs/zh-TW/engines.md)      | KataGo 安裝、模型庫、計算後端、自訂路徑與外部 AI 介面 |
| [LLM 設定](docs/zh-TW/llm.md)            | DeepSeek / Codex / Claude Code 接入、憑據與講棋提示詞 |
| [交互講解](docs/zh-TW/coach-links.md)    | 坐標連結、變化開關與試下分支                          |
| [開發指南](docs/zh-TW/development.md)    | Electron 源碼啟動、瀏覽器調試、測試與項目目錄         |
| [構建與發佈](docs/zh-TW/releases.md)     | 本地打包、GitHub Release、簽名、公證與自動更新        |
| [架構與路線](docs/zh-TW/architecture.md) | 模塊職責、流式協議、資料存儲與後續計劃                |
