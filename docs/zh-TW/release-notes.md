# 更新記錄

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ko/release-notes.md)

## v0.1.4

- 新增五語言介面：英文、簡體中文、繁體中文、日語及韓語，預設跟隨系統語言，可在一般設定中切換並儲存偏好。通知、模型面板及已顯示的狀態會同步切換語言。
- 修正「目差 / 勝率」面板在計算前後的高度跳動：預留候選變化空間，目前勝率與標題同行，收合時隱藏；搜尋次數及次數/秒移至已分析進度處。
- 增強互動講棋：正文座標可醒目提示並連接棋盤，支援分組變化開關；教練可建立與編輯試下分支，隨對話儲存，不修改實戰棋譜。
- 新增 Agent 工作量上限，可限制單輪用時、工具呼叫次數及累計搜尋量；達到上限後保留結果並可繼續，預設無限制。
- Codex / Claude Code 教練可視需要連網查閱資料並提供來源；目前局面的戰術及數值仍以棋盤與引擎證據為準。DeepSeek 暫不提供網頁搜尋。
- README 及使用、引擎、LLM、開發、發布、架構文件提供五語言版本，並加入 CI 及最新 Release 徽章。

請選擇與你的系統匹配的一個安裝包：

| 檔案名後綴                | 系統                      | 內建權重         |
| ------------------------- | ------------------------- | ---------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 主模型 + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 首次啟動下載     |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主模型 + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 首次啟動下載     |

兩種版本功能相同。Windows 普通版內建 KataGo OpenCL 引擎及隨附 DLL，無需聯網下載引擎和模型，但仍需要對應顯卡的 OpenCL 驅動。macOS 普通版內建 Metal 引擎及動態函式庫依賴，無需聯網下載引擎和模型，也無需安裝 Homebrew。兩種平台的 minimal 版均不預置引擎、隨附依賴或模型，首次啟動時聯網下載。下載錯誤顯示失敗的資源、來源主機及可用的網路錯誤代碼。安裝包不包含 LLM 憑據，LLM 在設定中自行連接。

macOS 請將應用拖入 Applications。發佈憑據齊全時，安裝包使用 Developer ID 簽名及 Apple 公證；否則提供未簽名、未公證的安裝包，首次運行可能受到 macOS 安全檢查攔截。Windows 請運行 `.exe` 安裝器；Windows 安裝器尚未設定代碼簽名，系統可能提示未知發佈者。

“設定 → 通用”提供 GitHub Release 更新檢查與自動更新開關。已有校驗通過的模型時，更新使用 minimal 安裝包；未快取模型的普通版仍使用普通版安裝包。Windows 及使用 Developer ID 簽名的 macOS 安裝版可在下載完成後點擊“重啟並安裝”；未簽名 macOS 安裝版可檢查更新並打開 Release 頁面手動下載安裝。

Release 中的 `.zip` 和 `.yml` 供自動更新使用；首次安裝請選擇上表中的 `.dmg` 或 `.exe`。`SHA256SUMS.txt` 包含安裝包和更新檔案的 SHA-256 摘要。GitHub 自動附帶的 Source code 是源碼，不是安裝包。
