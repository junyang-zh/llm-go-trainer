# LLM 設定

[English](../en/llm.md) · [简体中文](../llm.md) · [繁體中文](llm.md) · [日本語](../ja/llm.md) · [한국어](../ko/llm.md)

[返回 README](../../README.zh-TW.md) · [使用指南](usage.md)

在「設定 → 連接 LLM」設定服務。也可使用 `.env` 提供預設值，檔案位置見[環境設定](development.md#environment)。更改環境變量後需重啟應用。

主介面顯示當前 LLM 和可用狀態。「自動選擇」依次檢查 DeepSeek、Codex、Claude Code；手動選擇則固定使用所選服務。檢測結果快取 30 秒，可點擊「檢測連接」立即重新整理。

DeepSeek 通過 `/models` 檢查認證和所選模型；CLI 分別通過 `codex login status`、`claude auth status` 檢查登錄狀態。

模型和思考深度按服務分別保存，下一次分析生效。Codex 模型列表讀取本機 CLI 的公開模型快取，並按模型支援的檔位篩選；沒有快取時仍可選擇 CLI 預設或填寫模型 ID。Claude 提供模型別名和自訂 ID。API 模型也可自訂，實際可用性由賬號與服務決定。

## Agent 工作量上限

在 LLM 接入設定展開「Agent 工作量上限」，可調整每輪最長用時（10–3600 秒）、工具調用次數（1–200）、累計搜索量（4000–1000000 visits）。三項預設均無限制，輸入框留空可取消對應限制；填寫數字後啟用該項上限。未保存最長用時時沿用 `LLM_TIMEOUT_MS`，該環境變量預設 0（無限制）。

達到任何一項上限會停止本輪執行，保留已有正文、工具結果與試下分支，在對話末尾顯示原因和小按鈕「繼續」。點擊後按當前設定補充一輪額度，使用原問題、原棋盤與服務以及服務端保存的已完成結果繼續；暫停期間不運行 LLM 或搜索。繼續會發起新的模型請求，不保留被中斷的模型內部思考。手動停止、斷網和普通服務錯誤不會顯示此按鈕。

待繼續任務只在本次應用運行的記憶體中保留 30 分鐘，最多保留最近 8 個；過期或重啟後需重新提問。已完成正文和試下仍保存在對話歷史中。

## DeepSeek API

在「DeepSeek」中填寫 API key 並保存即可。下列環境變量仍可作為預設值：

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EFFORT=default
```

思考深度映射到 `reasoning_effort`：關閉 / 低 / 高 / 最高對應 `none / low / high / max`；「模型預設」不傳此參數。使用供應商預設輸出預算，深度影響延遲和用量。[DeepSeek 請求參數](https://api-docs.deepseek.com/api/create-chat-completion/)

應用內設定覆蓋對應環境變量；「移除本機 key」刪除應用保存的金鑰後回退到 env。源碼運行保存到 `.local/settings/llm.json`，桌麵包保存到應用 userData 下的 `settings/llm.json`。設定檔案包含明文金鑰，macOS/Linux 權限為 `0600`，Windows 使用所在使用者目錄的訪問權限。更換金鑰時填寫新值並保存；更換 API 服務域名時需重新輸入對應的 key。

點擊提問會把當前棋盤、相關引擎資料和本局面對話發送到所選 LLM，產生對應服務用量。

## Codex / Claude Code CLI

在「設定 → 連接 LLM」展開 Codex CLI 或 Claude Code，可直接儲存各自的 CLI 路徑和選填 Node 路徑，無需編輯 `.env`。填寫絕對路徑，不加引號或參數；也支援 `~/`。npm 安裝版可填寫 CLI 連結或實際 JS 入口；Windows 使用原生 `.exe` 或 JS 入口，不能填寫 `.cmd` / `.bat`。應用會將設定路徑所在目錄加入該 CLI 的 PATH；若 Node 不在同目錄或預設 PATH 中，請填寫 Node 執行檔的絕對路徑。儲存後立即重新檢測，下次講棋生效，重啟後保留；欄位留空恢復環境預設值或命令名稱。

先在終端完成所選 CLI 的安裝與登錄，確認 `codex exec --help` 或 `claude --help` 可用；在 UI 切換模型。必要時設定絕對路徑：

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex 使用非交互 `exec`，模型通過 `--model`、思考深度通過 `-c model_reasoning_effort=…` 傳入。應用使用獨立設定，需安裝支援 `--ignore-user-config` / `--ephemeral` 的 CLI 版本。[Codex 設定參考](https://developers.openai.com/codex/config-reference/)

Claude 使用 print 模式，模型和思考深度通過 `--model` / `--effort` 傳入。Haiku 僅提供預設深度；其他模型的檔位取決於 CLI 版本與供應商，CLI 可能將不支援的檔位下調。[Claude 模型與深度](https://code.claude.com/docs/en/model-config#adjust-effort-level)

應用為每次 CLI 講解自動接入臨時 MCP 圍棋工具，需使用支援 Streamable HTTP MCP 的 CLI 版本。DeepSeek 使用 API 原生工具調用，三種接入共用相同的搜索工具與執行記錄。

CLI 教練可按需聯網查閱圍棋資料並附來源連結：Codex 顯式設定 `web_search="live"`，Claude 開啟並預授權內建 `WebSearch` / `WebFetch`。無需另配搜索 API key。當前局面的戰術與數值仍由棋盤和圍棋引擎支撐。DeepSeek API 接入目前不提供網頁搜索。[Codex 網頁搜索設定](https://learn.chatgpt.com/docs/config-file/config-basic#web-search) · [Claude 工具權限參數](https://code.claude.com/docs/en/cli-reference)

CLI 的環境預設值為 `CODEX_MODEL` / `CODEX_EFFORT`、`CLAUDE_MODEL` / `CLAUDE_EFFORT`；留空使用 CLI 預設。應用內保存的模型與深度優先。

Windows：優先使用原生 CLI `.exe`。若通過 npm 安裝得到 `.cmd` shim，不能把它當原生可執行檔案。用 `npm root -g` 確認安裝目錄，再設定 Node 與實際 JS 入口，例如 Codex：

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

Claude npm 包同理設定 `CLAUDE_PATH` / `CLAUDE_SCRIPT`，以該包實際入口為準。原生安裝不設定 `*_SCRIPT`。GUI 啟動時的 PATH 可能不同於終端，絕對路徑最穩妥。

## 講棋 Prompt / Skill

- [運行時中文教練提示詞](../../prompts/coach.zh-CN.md)：約束黑白視角、前後手比較、PV 引用、強弱棋優先級與教學深度。
- [可復用 go-coach 技能](../../skills/go-coach/SKILL.md)：手動調用時讀入同一教練規範。

解釋某手時，LLM 會收到落子前後的棋盤、引擎候選與變化資料，並可按需補充搜索。提示詞引導教練使用挖、粘、衝斷、虎、立等符合棋形的術語說明目的與取捨。

介面語言設定不修改這份中文提示詞，也不會自動翻譯生成回答。

Agent 正文支援坐標高亮、互斥變化開關及可保存的試下分支。語法與 `edit_trial` 工具約定見[交互講解與試下分支](coach-links.md)。
