# 更新記錄

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ko/release-notes.md)

## v0.1.6

- SGF 匯入保留完整變化樹、註解與棋盤標記，支援包含多個棋局的 SGF 集合。每個檔案顯示為一個本機棋局項目，可用來瀏覽自己的定式大全。
- 新增變化樹瀏覽：選擇手順、返回上層、切換變化，並將選定局面放到主棋盤。擺子、移除棋子及指定下一手方的節點也可瀏覽；試下可另存為同源棋局，完整原譜繼續保留並可匯出。
- 移除 SGF 匯入的檔案大小、節點數與巢狀深度限制；未註明或不支援的規則繼續依既有邏輯使用中國規則，移除對應的匯入提示。
- 手順路徑與變化選擇按鈕增加細線框和淺色背景，與導覽及放置到棋盤按鈕作出視覺區分。
- Codex / Claude 設定新增 CLI 路徑及選用的 Node 路徑，支援原生程式和 Node 指令碼入口，改善桌面啟動時的 CLI 尋找與偵測。

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
