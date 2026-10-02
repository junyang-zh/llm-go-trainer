# 更新記錄

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ko/release-notes.md)

## v0.1.7

- 勝率與目差曲線在試下時保留完整實戰主線：試下使用紅色，原譜後續使用灰色；清空試下後立即恢復已快取的主線曲線。所有數值繼續使用黑方視角。
- 背景自動補齊實戰與試下的缺失評估，優先分析目前局面；調整搜尋中、完成和錯誤通知，完成通知顯示實際分析手數及引擎提供的搜尋速度。
- 領地預測僅顯示絕對歸屬值至少 0.8 的點，使用清晰的黑白標記；可與候選點及試下編號同時顯示，並錯開標記位置。
- 教練回答支援整塊棋的多座標引用和柔和霧狀高亮，支援分組及鍵盤聚焦；文字離開可視範圍或棋盤切換局面時隱藏。單點引用連線改從標記右下緣出發，並同步更新教練提示詞和各語言說明。
- 更新 README 中的介面範例截圖。

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
