# 開發指南

[English](../en/development.md) · [简体中文](../development.md) · [繁體中文](development.md) · [日本語](../ja/development.md) · [한국어](../ko/development.md)

[返回 README](../../README.zh-TW.md) · [架構與路線](architecture.md) · [構建與發佈](releases.md)

## 啟動 Electron 桌面應用

需要 Node.js 22.12+（建議 24 LTS）、npm。macOS、Windows PowerShell 均可使用：

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
```

安裝依賴後，在項目目錄運行：

```sh
npm run desktop
```

這是日常運行和介面測試的預設入口。命令會先構建，再打開 Electron 窗口，自動啟動本地服務與 KataGo。關閉窗口時，本地服務和應用啟動的 KataGo 一起退出。

修改源碼後，關閉舊窗口並重新執行 `npm run desktop`，即可構建並運行最新版本；此命令不提供源碼熱更新。

首次啟動與服務設定見[使用指南](usage.md#installation)、[引擎與模型](engines.md)和 [LLM 設定](llm.md)。

## 瀏覽器調試

需要前端熱更新或定位瀏覽器問題時，可啟動 Web 服務：

| 用途                  | 命令                              | 瀏覽器地址              |
| --------------------- | --------------------------------- | ----------------------- |
| 開發與熱更新          | `npm run dev`                     | <http://127.0.0.1:5173> |
| 檢查構建後的 Web 版本 | `npm run build`，然後 `npm start` | <http://127.0.0.1:3001> |

Web 模式需在終端按 `Ctrl+C` 關閉服務；關閉瀏覽器標籤頁不會結束服務或 KataGo。

<a id="environment"></a>

## 環境設定

源碼運行時可將 [`.env.example`](../../.env.example) 複製為項目根目錄的 `.env`，提供預設設定；更改環境變量後需重啟。環境排查可運行 `npm run doctor`。LLM 在應用內保存的設定優先於環境預設值，詳見 [LLM 設定](llm.md)。

安裝版的 `.env` 放在 Electron userData 目錄，通常為 macOS `~/Library/Application Support/llm-go-trainer/.env` 或 Windows `%APPDATA%/llm-go-trainer/.env`；應用標識或命名變更時以 `app.getPath('userData')` 為準。自訂 KataGo / 模型路徑請使用絕對路徑，設定項見[自訂引擎路徑](engines.md#custom-paths)。引擎快取和歷史記錄位置分別見[引擎與模型](engines.md#installation)、[歷史存儲](architecture.md#history)。

`.env`、憑據、引擎二進制、模型、私人棋譜與本地運行日誌不提交到儲存庫。

## 測試與驗證

規則、服務與協議的自動測試：

```sh
npm test
npm run build
```

**介面和端到端測試優先使用 Electron**：

```sh
npm run desktop
```

在桌面窗口中檢查棋盤縮放、設定、棋譜導入、流式分析和引擎啟停，以及關閉窗口後的程序退出。

選點瀏覽的 Electron 自動回歸：

```sh
npm run test:coach-layout
npm run test:i18n-layout
```

該測試使用獨立臨時存儲，覆蓋多個窗口尺寸下的選點高亮、距離亮度、雙向懸浮/鍵盤連線、滾動裁剪、分組切換、分支定位及折疊恢復。

`test:i18n-layout` 使用 Electron 覆蓋五語言、多窗口尺寸、模型通知、搜索開始/完成/錯誤/重試的預留佈局、標題對齊與溢出。

自動測試覆蓋圍棋規則、SGF、對手採樣、黑白視角、引擎生命週期、LLM 協議和介面交互。測試使用本地夾具，需允許 loopback 監聽，無需設定 LLM API key。

CI 設定覆蓋 Ubuntu、macOS 和 Windows 的測試與構建。

## 國際化維護

`src/i18n.ts` 解析系統語言、保存語言偏好並插值消息；`src/locales/{en,zh-CN,zh-TW,ja,ko}.json` 必須具有相同鍵和佔位參數。UI 文字使用 `t(...)`；服務端診斷保留原文，在渲染時通過 `localizeDiagnostic(...)` 翻譯，確保已有通知隨語言變化。保留自訂名稱和未知供應商輸出，不翻譯或替換運行時教練提示詞。

簡中 README 和文檔保留原路徑，其他語言使用 `README.<locale>.md` 與 `docs/<locale>/`。每頁提供五語言對應頁入口。修改文檔時同步各語言，保持命令、設定名與技術約束一致，並檢查相對連結。`tests/i18n.test.tsx` 檢查語言解析、詞條/參數一致性和切換時狀態保留。

模擬評估只允許放在 `tests/fixtures/`，不能作為應用引擎的回退結果。驗證結果、硬體、供應商與剩餘缺口在對話中報告，會話報告和日誌保留在儲存庫外。

<a id="local-build"></a>

## 桌面打包

本地打包命令、平台要求、輸出目錄與安裝包驗證統一見[構建與發佈](releases.md#local-build)；發佈流程也在該文檔中維護。

## 項目目錄

```text
src/          Web UI 與 SVG 棋盤
shared/       純 TypeScript 規則、SGF、訓練策略
server/       本地 API、KataGo、LLM 與證據
desktop/      Electron 外殼
config/       KataGo 分析配置
prompts/      運行時講棋提示詞
skills/       可復用講棋技能
docs/         使用、配置、開發與發佈文檔
tests/        規則與集成測試（無需真實模型）
```

模塊職責與資料流見[架構與路線](architecture.md)。
