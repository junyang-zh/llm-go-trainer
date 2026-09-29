# 更新記錄

[English](../en/release-notes.md) · [简体中文](../release-notes.md) · [繁體中文](release-notes.md) · [日本語](../ja/release-notes.md) · [한국어](../ko/release-notes.md)

## v0.1.3

- 新增圍棋模型管理：推薦檔位、官方模型目錄、自訂模型、下載進度與取消、模型切換和刪除。
- Windows 新增 CUDA 後端，支援與 OpenCL 切換並保存選擇。CUDA 不預裝；首次選擇時下載約 1.45 GiB 的已校驗依賴，復用已有模型。
- 通知顯示實時搜索次數和平均每秒搜索數；支援按搜索次數或時間限制分析，設定自動保存。
- 已快取模型時，自動更新使用不含模型的 minimal 安裝包，繼續復用模型、後端和調優快取。舊版需先更新到本版，後續更新才能使用此策略。
- 修復 Windows 首次 OpenCL 調優期間的啟動狀態和超時處理，隱藏 Windows 菜單欄。
- 精簡設定介面，調整標籤為「通用」「圍棋模型」「AI 自動落子」「連接 LLM」。

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
