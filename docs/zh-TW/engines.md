# 引擎安裝、生命週期與擴展

[English](../en/engines.md) · [简体中文](../engines.md) · [繁體中文](engines.md) · [日本語](../ja/engines.md) · [한국어](../ko/engines.md)

<a id="installation"></a>

## 自動安裝

源碼啟動使用 `<repo>/.local/katago/`；`GO_TRAINER_DATA_DIR` 可覆蓋。Electron 打包後使用 `app.getPath('userData')/katago/`。這些檔案不提交到 Git：

```text
katago/
  downloads/                  按 SHA-256 保存的下載快取
  models/                     校驗後的 .bin.gz 模型
  darwin-arm64-<revision>/     或 win32-x64-<revision>
    bin/                      可執行文件和 Windows DLL
    lib/                      macOS 動態函式庫
    licenses/                 歸檔內上游聲明
    installed.json            安裝文件摘要
  connection.json             選擇的引擎連接（無密鑰）
```

服務先開始監聽，再後台安裝、下載、預熱；頁面不等待 GPU。源碼啟動和未內建所需資源的安裝包首次啟動需要網路和數百 MB 下載空間，解壓和模型快取額外佔用空間。啟動以一次分析成功作為 ready 條件。下載失敗或平台不支援時顯示錯誤，棋盤仍可用。

Windows OpenCL 首次啟動會分別為主模型和 HumanSL 模型進行 GPU 調優，可能需要數分鐘；快取完成後啟動會快很多。啟動狀態會顯示調優、讀取快取和首次分析驗證進度。初始化預設允許至少 10 分鐘（不小於分析超時），可用 `KATAGO_STARTUP_TIMEOUT_MS` 單獨覆蓋；正常分析仍使用 `KATAGO_TIMEOUT_MS`（預設 3 分鐘）。初始化可隨時停止；超時錯誤附帶引擎末尾診斷，便於區分調優耗時與驅動故障。

### Windows CUDA

在「圍棋模型」頂部的「計算後端」選擇 OpenCL 或 CUDA（NVIDIA）。現有安裝預設繼續使用 OpenCL；CUDA 需支援 CUDA 12.8 的 NVIDIA GPU 和驅動。首次選擇 CUDA 時按需從 KataGo 和 NVIDIA 官方源下載 KataGo 1.18.2、CUDA Runtime 12.8.90、NVRTC 12.8.93、cuBLAS 12.8.4.1、cuDNN 9.8.0.87，壓縮包合計約 1.45 GiB。無需全局安裝 CUDA Toolkit；DLL 存在該後端的私有 bin 目錄中，不修改系統 PATH。

清單和 SHA-256 固定在 `config/katago/windows-cuda.json`；NVIDIA 摘要來自 [CUDA 12.8.1 redistrib](https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.8.1.json) 和 [cuDNN 9.8.0 redistrib](https://developer.download.nvidia.com/compute/cudnn/redist/redistrib_9.8.0.json)。後端目錄相互獨立，模型目錄共享。切換會停止舊程序並持久化選擇；初始化失敗可切回 OpenCL。標準安裝包仍預置 OpenCL，CUDA 依賴僅首次選擇時下載，之後復用快取。

性能復測命令：`node --import tsx scripts/benchmark-backends.ts <缓存目录> [轮数]`。讀取該目錄選中的真實主模型和 HumanSL，交替測試兩個後端，分別輸出安裝檢查、程序初始化和 19 路兩種局面在 400 / 4000 visits 下的耗時。使用應用的分析設定，結果輸出到終端；保存測量記錄時請放在儲存庫外。運行時避免其他 GPU 負載，啟動測試和分析吞吐不可混為一個指標。

<a id="custom-paths"></a>

## 自訂引擎路徑

可選：已有自訂安裝時設定 `KATAGO_MODEL` 啟用路徑覆蓋，支援 CUDA/TensorRT 版本。Windows 路徑使用正斜槓：

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

主程序強制 `reportAnalysisWinratesAs=BLACK`，所有分析使用黑方視角。`.env` 檔案位置見[環境設定](development.md#environment)。

## 模型庫與選擇

設定中的「圍棋模型」替代原有的引擎連接面板；引擎啟停、外部連接仍可用，AI 教練憑據獨立放在「連接 LLM」頁。模型庫提供推薦、已下載、全部和名稱 / 網路結構搜索；顯示下載大小、適用棋盤、來源與 SHA-256，並支援後台排隊下載、進度、取消、失敗重試及刪除未選用的模型。網路中斷留下的 partial 可在重試時續傳；主動取消會清理正在下載的 partial。

內建推薦由 [`config/katago/models.json`](../../config/katago/models.json) 和現有 artifacts 清單固定：輕量 B10 是歷史小網路，均衡 B18 是原預設網路，進階 Transformer 是官方 tf3 網路。檔位描述資源與使用場景，不代表本應用測得的段位、Elo 或速度；OpenCL 對 Transformer 可能較慢。B10 的摘要從官方 v1.3 Release 模型檔案計算，Transformer 和 B18 的大小、摘要來自官方訓練 API。HumanSL 作為獨立伴隨模型，可啟用或關閉，不可誤選為主分析模型。

「獲取最新官方模型」讀取 `katagotraining.org/api/networks/`，保留校驗摘要、下載地址和模型基本資訊，支援載入更早的目錄。重新整理失敗時已保存的目錄和本地模型仍可用。「添加其他模型」支援官方訓練站、官方歷史站及 KataGo GitHub Release 的 HTTPS `.bin.gz` / `.txt.gz` 連結，必須填寫 SHA-256、用途與適用棋盤；不接受任意內網地址或可執行檔案下載。

`katago/models.json` 保存模型目錄與選擇；`katago/models/<sha256>.bin.gz` 或 `<sha256>.txt.gz` 保存校驗後的模型檔案。後綴保留上游格式，KataGo 依此選擇解析器。已有預設模型自動識別，應用升級不會重置選擇。下載只入庫，不自動切換；切換會停止當前引擎、以新模型運行真實初始化分析，成功後才持久化選擇。失敗或取消時保留原選擇，可點擊「啟動引擎」恢復。當前選擇和正在驗證的模型不能刪除。使用 `.env` 的 `KATAGO_MODEL` 自訂路徑時，模型庫仍可下載管理，但禁用托管選擇，避免靜默覆蓋自訂設定。

模型 API：`GET /api/models` 返回目錄、快取狀態、當前選擇和待驗證選擇；`POST /api/models/download|cancel|delete` 接收 `{id}`；`select` 接收 `{main, human}`（`human` 可為 `null`）；`refresh` 接收 `{page}`；`add` 接收 `{name, url, sha256, role, boards}`。寫操作使用與引擎管理相同的同源 JSON 請求保護。

下載採用 HTTPS、固定 SHA-256、臨時檔案、最終校驗和重命名。網路錯誤自動重試最多 3 次，支援 HTTP Range 續傳；服務端忽略 Range 時從頭寫入。中斷後未通過驗證的檔案不會執行。手動停止刪除未完成下載，意外斷網留下的 partial 在下次啟動嘗試續傳。檔案損壞時優先從安裝包中已校驗的資源修復，否則重新下載。下載失敗時顯示資源名稱、來源主機及可用的底層網路錯誤代碼。安裝鎖防止多個本地實例同時展開資源，失效鎖可恢復。

## 版本與來源

資源版本由清單固定；更新資源時應同步修改 revision，並運行啟動測試。

- [`config/katago/artifacts.json`](../../config/katago/artifacts.json)：主模型、HumanSL、Windows 發行包。
- [`config/katago/macos-bottles.json`](../../config/katago/macos-bottles.json)：macOS Metal 1.18.2 及 libzip / xz / zstd / lz4 / abseil / protobuf 的固定 Homebrew ARM64 Sequoia bottle。至少 macOS 15；無需使用者安裝 Homebrew，動態函式庫僅加入該子程序的 `DYLD_LIBRARY_PATH`。
- Windows 預設使用 [官方 1.18.1 OpenCL 包](https://github.com/lightvector/KataGo/releases/tag/v1.18.1)，CUDA 使用 [官方 1.18.2 包](https://github.com/lightvector/KataGo/releases/tag/v1.18.2)；保留可執行檔案及隨附 DLL。TensorRT 仍可通過 `.env` 自訂路徑使用。
- 主模型 `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` 來自[官方訓練網站](https://katagotraining.org/networks/)，摘要與 [Homebrew 公式](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb) 一致。
- HumanSL `b18c384nbt-humanv0.bin.gz` 來自 [KataGo 1.15.0 官方資產](https://github.com/lightvector/KataGo/releases/tag/v1.15.0)。清單摘要由該官方 HTTPS 資產計算；參考[人類模型說明](https://katagotraining.org/extra_networks/)。
- Homebrew 資源的完整 blob SHA-256 也在下載 URL 內；Windows 摘要對照 GitHub release asset digest。

KataGo 為 [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE)；依賴有各自許可。安裝器保留歸檔內 LICENSE / COPYING / COPYRIGHT / NOTICE。不將第三方二進制或權重提交到儲存庫。普通版安裝包攜帶兩個官方模型及[模型許可](../../config/katago/MODEL-LICENSE.txt)，啟動時校驗並複製到使用者快取；普通版安裝包還攜帶對應平台的引擎及依賴歸檔（Windows OpenCL ZIP 或 macOS Metal Homebrew bottles），啟動時優先使用已校驗的快取或 `GO_TRAINER_BUNDLED_RUNTIME` 指向的內建歸檔，缺失/損壞時才下載。minimal 安裝包不預置引擎、DLL 或動態函式庫依賴，首次啟動時聯網下載引擎、依賴和模型。兩種平台的普通版均可離線安裝引擎、依賴和模型；Windows 仍需顯卡 OpenCL 驅動，macOS 無需安裝 Homebrew。詳見[發佈說明](releases.md)。

## 搜索限制與統計

「AI 自動落子」提供按次數（50–1,000,000 visits）或按時間（0.1–120 秒）搜索，保存在本地設定中。`Training.searchLimit` 缺省為 `visits`，`maxTime` 缺省為 5 秒。時間模式通過 KataGo 的 `overrideSettings.maxTime` 限制每次搜索，並提高 visits 上限，正常返回當時的分析與落子；程序無響應時的傳輸超時仍是獨立保護機制。後台曲線維持最多 100 visits，教練工具調用仍遵守各自的次數預算。

`Analysis.searchStats` 包含 `elapsedMs` 和 `visitsPerSecond`，後者為實際 `rootInfo.visits` 除以該請求發送後到本次結果的單調時鐘耗時（含排隊、傳輸開銷），是平均速度，不是 GPU 理論吞吐。中間結果和最終結果均攜帶統計，Black 視角不變。通知欄顯示實時統計，展開的目差/勝率面板在已分析進度處保留搜索統計，並在計算時預留候選後續空間；外部引擎未提供計時資料時只顯示搜索次數。

`POST /api/bot-move` 繼續支援 JSON，並在 `Accept: application/x-ndjson` 時發送中間 `analysis` 事件及含 `move`、`method`、`analysis` 的最終 `done` 事件。斷開流會取消對應搜索。

## 控制與程序退出

在「設定 → 圍棋模型」啟動、停止、重啟引擎或設定外部 HTTP 圍棋 AI。手動停止後，引擎保持停止，直到再次啟動引擎或重啟應用；切換引擎會先釋放舊程序。外部服務由使用者獨立管理啟停，接入方式見[適配契約](#adapters)。

`GET /api/status` 的 `engine` 包含 `phase`、`ready`、`running`、`pid`、`backend`、下載 `progress` 和診斷 `error`。`phase` 有 idle / downloading / installing / starting / ready / stopping / stopped / error。

同源請求帶 `Content-Type: application/json`、`X-Go-Trainer: 1`：

| 路由                         | 請求體       | 行為                                                 |
| ---------------------------- | ------------ | ---------------------------------------------------- |
| `POST /api/engine/start`     | `{}`         | 從停止/錯誤狀態啟動                                  |
| `POST /api/engine/stop`      | `{}`         | 取消下載/請求，等待已擁有子程序退出                  |
| `POST /api/engine/restart`   | `{}`         | 完全停止後重新安裝檢查、預熱                         |
| `GET /api/engine/connection` | —            | 返回當前選擇                                         |
| `POST /api/engine/connect`   | 下方連接對象 | 切換時持久化並釋放舊程序，後台初始化；相同連接不重啟 |

KataGo 直接使用 `spawn`，`shell:false`、`detached:false`，stdin 管道屬於應用。正常關閉結束輸入併發 SIGTERM，最多 2 秒後 SIGKILL，等待 close 事件；同步程序退出鈎子也會終止擁有的子程序。KataGo 自身在 stdin EOF 後結束分析服務，這為父程序被強殺提供補充，不把它當成平台級 Job Object 保證。

桌面版關閉最後一個窗口即退出，包括 macOS。源碼 Web 版 `Ctrl+C` 關閉整個服務；瀏覽器頁面關閉不等於本地服務退出。對外部 HTTP 服務的“停止”只斷開本軟體連接，不管理外部程序。

<a id="adapters"></a>

## 其他圍棋 AI 適配契約

內建連接為 `{"mode":"managed"}`。外部連接示例：

```json
{ "mode": "external", "name": "我的圍棋 AI", "url": "http://127.0.0.1:9000/analyze" }
```

使用 HTTPS 或 loopback HTTP。當前不支援 URL 憑據、查詢參數、重定向或 UI 內 API key。接入原生 GTP 引擎時需要自行提供 HTTP 橋接，並實現以下資料結構；不能直接填入 TCP/GTP 端口。

本軟體向該完整 URL 發送 POST `{game, training}`，類型來自 [`shared/types.ts`](../../shared/types.ts)；`game` 帶棋盤大小、規則、貼目、初始擺子和完整落子歷史。連接時會發送一次空 19 路、50 visits 分析以確認介面可用。支援 JSON 或 `application/x-ndjson`。

JSON 響應示例：

```json
{
  "id": "your-request-id",
  "perspective": "B",
  "turnNumber": 0,
  "rootInfo": { "visits": 50, "winrate": 0.5, "scoreLead": 0 },
  "moveInfos": [
    {
      "move": "D4",
      "visits": 50,
      "winrate": 0.5,
      "scoreLead": 0,
      "prior": 0.1,
      "order": 0,
      "pv": ["D4", "Q16"]
    }
  ]
}
```

所有勝率、目差和歸屬數值必須是**黑方視角**，不能是當前行棋方視角。`turnNumber` 必須等於提交歷史長度。可選 `ownership` 為 size² 個值，左上開始逐行，+1 黑 / −1 白；`policy` / `humanPolicy` 與 KataGo 行優先坐標一致，最後一項為 pass。字段範圍由服務端 schema 校驗。未提供 HumanSL 時訓練策略回退到基於候選的採樣；不把其他引擎輸出聲稱為 KataGo 證據。

NDJSON 按行發送：

```json
{"type":"analysis","phase":"after","final":false,"analysis":{}}
{"type":"done","analysis":{}}
```

上例的 `{}` 必須替換為完整、合法的分析對象。最終必須有 `done`；斷流和 `error` 事件視為失敗。適配器應在客戶端斷開時取消上游計算。外部服務是否實際使用 GPU、其棋力及數值可比性由具體適配器決定。
