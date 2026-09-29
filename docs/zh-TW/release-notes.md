# 更新記錄

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ko/release-notes.md)

## v0.1.5

- Agent 現在可以載入棋局、儲存目前局面或試下分支、修改棋局名稱，棋盤與棋譜庫同步更新。試下儲存為同源新棋局，保留原譜；暫停後繼續時保留新的棋局上下文。
- 修正長時間講棋出現「CLI 輸出超出限制」：移除 Codex / Claude CLI 累計輸出、Codex 回答檔案及前端本機訊息的固定長度限制，工具結果不再觸發隱藏的總量上限。
- 新增棋譜庫搜尋、分頁、改名、來源資訊及同源分支分組。普通版預置 CWI 完整棋譜歸檔，minimal 版可在棋譜下載面板按需安裝；不提供預置定式或死活題。
- 新增野狐圍棋棋譜查詢與匯入，可按使用者名稱或 UID 查詢並下載至本機棋譜庫，重複匯入保留同一棋局記錄。
- minimal 版不再於首次啟動時自動下載引擎與模型；需要本機引擎時，在「設定 → 圍棋模型」點擊「下載並啟用 KataGo」。既有模型、棋譜及對話繼續保留。
- 專案採用 MIT 授權，應用程式內新增授權說明，並補充第三方元件及棋譜來源聲明。第三方資源仍遵循各自授權。

請選擇與你的系統匹配的一個安裝包：

| 檔案名後綴                | 系統                      | 內建權重         |
| ------------------------- | ------------------------- | ---------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 設定中手動下載   |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 設定中手動下載   |

兩種版本功能相同。Windows 普通版內建 KataGo OpenCL 引擎及隨附 DLL，無需聯網下載引擎和模型，但仍需要對應顯卡的 OpenCL 驅動。macOS 普通版內建 Metal 引擎及動態函式庫依賴，無需聯網下載引擎和模型，也無需安裝 Homebrew。兩種平台的 minimal 版均不預置引擎、隨附依賴或模型，需在「設定 → 圍棋模型」中手動下載並啟用。下載錯誤顯示失敗的資源、來源主機及可用的網路錯誤代碼。安裝包不包含 LLM 憑據，LLM 在設定中自行連接。

macOS 請將應用拖入 Applications。發佈憑據齊全時，安裝包使用 Developer ID 簽名及 Apple 公證；否則提供未簽名、未公證的安裝包，首次運行可能受到 macOS 安全檢查攔截。Windows 請運行 `.exe` 安裝器；Windows 安裝器尚未設定代碼簽名，系統可能提示未知發佈者。

“設定 → 通用”提供 GitHub Release 更新檢查與自動更新開關。已有校驗通過的模型時，更新使用 minimal 安裝包；未快取模型的普通版仍使用普通版安裝包。Windows 及使用 Developer ID 簽名的 macOS 安裝版可在下載完成後點擊“重啟並安裝”；未簽名 macOS 安裝版可檢查更新並打開 Release 頁面手動下載安裝。

Release 中的 `.zip` 和 `.yml` 供自動更新使用；首次安裝請選擇上表中的 `.dmg` 或 `.exe`。`SHA256SUMS.txt` 包含安裝包和更新檔案的 SHA-256 摘要。GitHub 自動附帶的 Source code 是源碼，不是安裝包。
