# 發佈桌面應用

[English](../en/releases.md) · [简体中文](../releases.md) · [繁體中文](releases.md) · [日本語](../ja/releases.md) · [한국어](../ko/releases.md)

GitHub Actions 在推送 `v*` tag 後構建併發布四個安裝包：Windows 10/11 x64 × 普通版/minimal 版、macOS 15+ Apple Silicon × 普通版/minimal 版。無 32 位、Windows 7/8 或 Intel Mac 構建。macOS 在發佈憑據齊全時啟用 Developer ID 簽名與 Apple 公證，否則構建未簽名、未公證的安裝包；Windows 安裝器尚未設定代碼簽名。

## 發佈步驟

1. 更新 `package.json` 與 `package-lock.json` 中的版本（例如 `npm version 0.1.1 --no-git-tag-version`），按需同步更新各語言的更新記錄。
2. 準備本地提交，確保工作區乾淨。將待推送的 commit、具體改動、目標遠端與分支、驗證結果交給使用者審閱，獲得對本次推送的明確批准後，才推送代碼。
3. 發佈 tag 也必須先審閱：提供準確的版本/tag、目標 commit、目標遠端、Release notes 和驗證結果，獲得明確批准後，才創建並推送與 package.json 一致的 tag。批准僅適用於已審閱的改動和目標；新增改動或替換遠端 tag 必須重新審閱。選擇版本號或要求實現發佈流程不等於批准任何 push。

以下命令僅在相應分支和 tag 推送均獲批准後執行：

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

在儲存庫 Actions 的 `release` 工作流查看進度。構建使用 `windows-2022` x64 和 `macos-15` ARM64 runner；每個構建執行測試、TypeScript/Vite/服務構建、electron-builder 打包、權重及各平台引擎、依賴歸檔內容校驗。普通版從固定清單下載平台引擎、依賴、主模型與 HumanSL，經 SHA-256 驗證後才打包。模型快取損壞時重新下載；不提交模型或二進制到 Git。

四個構建全部成功後，發佈 job 檢查四個安裝包、兩個 macOS 更新 ZIP 和四個獨立更新清單，驗證清單內的版本、檔案名、大小和 SHA-512，再生成 `SHA256SUMS.txt`，將安裝包、更新 ZIP、更新清單及校驗摘要一起上傳到草稿 Release，最後公開。僅發佈 job 獲得 `contents: write`，使用儲存庫自動提供的 `GITHUB_TOKEN`，無需設定個人 token。失敗時可在 Actions 重跑；未公開的草稿可以繼續上傳，已公開的版本不被重寫，應發佈新版本。含 `-` 的版本（如 `0.2.0-beta.1`）標記為 prerelease。

也可在 Actions 手動運行工作流：選擇分支時只構建並保留 Actions artifacts；選擇版本 tag 時會嘗試發佈。不要先手工創建公開 Release。

<a id="local-build"></a>

## 本地構建

在目標系統安裝 Node.js 24 和依賴後執行：

```sh
npm ci
npm run package:desktop
npm run package:desktop -- minimal
```

不帶參數時構建普通版，也可顯式指定 `-- standard`；`-- minimal` 構建 minimal 版。輸出分別位於 `release/standard/` 和 `release/minimal/`。普通版安裝包不帶版本類型後綴，minimal 版帶 `-minimal` 後綴。macOS 只在 Apple Silicon 構建 arm64 DMG 和用於自動更新的 ZIP；Windows 只在 x64 構建 NSIS EXE。兩個版本共享應用標識和使用者資料目錄，可相互覆蓋升級。

應用圖標和介面共用 `public/logo.svg`。構建時自動生成多分辨率 Windows ICO、macOS ICNS 和窗口 PNG，輸出到忽略提交的 `.local/icons/`；修改 logo 後重新構建即可。

普通版在 `Resources/katago-models/` 攜帶主模型、HumanSL、來源摘要及上游模型許可。啟動時優先復用使用者資料目錄內校驗通過的權重，再從安裝包複製，缺失/損壞時才聯網下載。普通版還在資源目錄的 `katago-runtime/` 攜帶固定 SHA-256 校驗的引擎歸檔：Windows 使用官方 OpenCL ZIP（含可執行檔案及 DLL），macOS 使用 Metal 引擎及全部動態函式庫依賴的 Homebrew bottles，並保留上游聲明。首次啟動從內建歸檔安裝，無需聯網下載引擎、依賴或模型；Windows 需要系統已安裝顯卡 OpenCL 驅動，macOS 無需安裝 Homebrew。`minimal` 不預置模型、KataGo 引擎或隨附依賴，不在啟動時自動下載；請前往左上角「設定 → 圍棋模型」，點擊「下載並啟用 KataGo」。

當前 CI 校驗安裝包內權重和各平台引擎、依賴歸檔，但不具備目標顯卡驅動，不能代替真實 Windows OpenCL、macOS Metal 和安裝流程的驗證。公開發佈前後應在目標系統檢查安裝、啟動、引擎分析及退出。

設定依據：[GitHub runner 平台](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[electron-builder v26 設定](https://www.electron.build/v26/docs/configuration/)、[KataGo 模型許可](https://katagotraining.org/network_license/)。

<a id="updates"></a>

## 自動更新與 macOS 簽名

普通版初始使用 `latest.yml` / `latest-mac.yml`，minimal 使用 `minimal.yml` / `minimal-mac.yml`。每次檢查更新時，若使用者目錄已存在至少一個通過 SHA-256 校驗的模型，普通版也切換到 minimal 更新通道，下載不含模型和引擎歸檔的應用安裝包。兩個版本使用相同應用標識和使用者資料目錄，安裝後繼續復用所選模型、模型目錄、引擎安裝及調優快取；模型不會隨應用版本再次下載。若未來引擎資源 revision 變化，只安裝缺失的新引擎資源，仍復用同一 SHA-256 的模型。未快取任何有效模型的普通版保持普通版通道；只有部分模型已快取時也使用 minimal，啟動時若所選模型或引擎不完整，會提示在設定中手動下載並啟用。

這些清單由 electron-builder 生成；macOS 更新讀取 ZIP，Windows 更新讀取 NSIS EXE。更新器只檢查穩定 Release，驗證下載摘要，並嚴格匹配本次選定的下載類型與平台；minimal 清單不可用或包含普通版安裝包時報告錯誤，不靜默回退到攜帶模型的大包。跨類型升級禁用差分塊圖，下載完整的 **minimal 應用安裝包**，並非重新下載模型。安裝後的版本類型會顯示為 minimal。更新設定保存到 Electron userData 的 `updates.json`，預設關閉自動更新；下載完成後由使用者點擊“重啟並安裝”。舊版本需先升級到包含此邏輯的版本，才能在之後的檢查中選擇 model-free 更新。

如需啟用 macOS 簽名和公證，請在儲存庫 **Settings → Secrets and variables → Actions** 配齊以下 Secrets：

| Secret                       | 內容                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `MACOS_CERTIFICATE`          | 從鑰匙串導出的 Developer ID Application 證書及私鑰 `.p12` 的 Base64 內容 |
| `MACOS_CERTIFICATE_PASSWORD` | 該 `.p12` 的導出密碼                                                     |
| `APPLE_API_KEY_P8`           | 用於 Apple 公證的 App Store Connect API `.p8` 私鑰內容                   |
| `APPLE_API_KEY_ID`           | 對應 API Key ID                                                          |
| `APPLE_API_ISSUER`           | 對應 Issuer ID                                                           |

Developer ID Application 證書和 API 金鑰需在 Apple Developer 賬號中創建，並在後續發佈中保持簽名身份一致。不要將證書、私鑰、密碼提交到儲存庫或寫入應用設定。CI 檢查上述五項憑據：未設定或設定不齊全時，在日誌中列出缺失的設定名稱，關閉簽名身份自動發現並跳過簽名、公證及票據校驗，繼續發佈未簽名安裝包。憑據齊全時，CI 只將證書和公證金鑰寫入 runner 臨時目錄；electron-builder 導入證書、啟用 Hardened Runtime、簽名並提交 Apple 公證，隨後校驗簽名和公證票據，最後清理臨時檔案。啟用後的簽名、公證或校驗失敗會阻止發佈，不會回退為未簽名包，也不會公開不完整 Release。

本地 `npm run package:desktop` 預設構建未簽名、未公證的 macOS 包；該包可檢查更新並打開 GitHub Release 手動下載安裝，不能自動安裝更新。首次運行可能受到 macOS 安全檢查攔截。若要本地簽名構建，需要設定 electron-builder 簽名和公證憑據，並設定 `GO_TRAINER_REQUIRE_SIGNING=1`。完整驗證需使用簽名安裝版，從已安裝版本更新到更高版本，並分別驗證普通版和 minimal 的資料保留、退出及重新啟動。

依據：[Electron macOS 自動更新簽名要求](https://www.electronjs.org/docs/latest/api/auto-updater#macos)。
