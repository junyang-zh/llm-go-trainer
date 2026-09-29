# LLM 設定

[English](../en/llm.md) · [简体中文](../llm.md) · [繁體中文](../zh-TW/llm.md) · [日本語](llm.md) · [한국어](../ko/llm.md)

[README](../../README.ja.md) · [使い方](usage.md)

「設定 → LLM 接続」で設定します。`.env` の既定値も利用できますが、変更後は再起動が必要です。[環境設定](development.md#environment)を参照してください。

メイン画面に現在の LLM と利用状態を表示します。自動選択は DeepSeek、Codex、Claude Code の順に確認し、手動選択はそのサービスに固定します。検出は 30 秒キャッシュされ、「接続を確認」で即時更新できます。DeepSeek は `/models` で認証とモデルを確認し、CLI は `codex login status` / `claude auth status` を使います。

モデルと推論の深さはサービス別に保存され、次の分析から反映されます。Codex は CLI の公開モデルキャッシュを読み、対応する深さだけを表示します。キャッシュがなければ CLI 既定値かモデル ID を指定できます。Claude は別名と独自 ID、API も独自 ID に対応します。実際の利用可否はアカウントとサービスによります。

## エージェントの作業上限

「エージェントの作業上限」で 1 回の最大時間（10〜3600 秒）、ツール回数（1〜200）、累計探索数（4,000〜1,000,000 visits）を指定します。既定はすべて無制限です。空欄で制限を解除し、数値入力で有効にします。時間が未保存なら `LLM_TIMEOUT_MS` を使います（既定 0＝無制限）。

いずれかに達すると本文・ツール結果・試し打ちを保持して一時停止し、理由と「続行」を表示します。続行は現在の設定で新たな予算を追加し、元の質問・盤面・サービス・サーバー保存結果を利用します。一時停止中に LLM や探索は動きません。続行は新しいモデル要求であり、中断した内部推論は保持しません。手動停止・切断・通常のエラーでは続行ボタンは出ません。

続行タスクは今回の起動中のメモリに 30 分、直近最大 8 件保持します。期限切れ・再起動後は再質問が必要ですが、完了本文と試し打ちは会話履歴に残ります。

## DeepSeek API

DeepSeek 欄に API キーを入力して保存します。以下は環境変数による既定値です。

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EFFORT=default
```

推論のオフ・低・高・最高を `reasoning_effort` の `none/low/high/max` に対応させます。「モデル既定」は引数を省略します。出力予算はサービスの既定値を使い、深さは待ち時間・使用量に影響します。[DeepSeek パラメーター](https://api-docs.deepseek.com/api/create-chat-completion/)

アプリ設定は環境変数より優先されます。「ローカルキーを削除」は保存キーを削除して env に戻します。ソースは `.local/settings/llm.json`、インストール版は `userData/settings/llm.json` に平文で保存します。macOS/Linux は `0600`、Windows は利用者ディレクトリの権限を使います。キー交換時は新値を保存し、API ホスト変更時は対応キーを再入力してください。

質問すると現在の盤面、関連エンジン情報、会話の文脈がサービスに送信され、その使用量が発生します。

## Codex / Claude Code CLI

端末でインストールとログインを済ませ、`codex exec --help` / `claude --help` を確認して UI でモデルを選びます。必要なら絶対パスを設定します。

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex は非対話 `exec`、`--model`、`-c model_reasoning_effort=…` を使います。独立した設定のため `--ignore-user-config` / `--ephemeral` 対応 CLI が必要です。[Codex 設定](https://developers.openai.com/codex/config-reference/)

Claude は print モードで `--model` / `--effort` を渡します。Haiku は既定の深さのみです。他モデルの深さは CLI とサービスに依存し、未対応値が下げられる場合があります。[Claude モデルと深さ](https://code.claude.com/docs/en/model-config#adjust-effort-level)

各 CLI 解説には一時的な MCP 囲碁ツールを接続するため、Streamable HTTP MCP 対応版が必要です。DeepSeek は API のネイティブツール呼び出しを使い、3 接続で探索ツール・実行記録を共有します。

CLI コーチは囲碁資料をウェブ検索して出典を示せます。Codex は `web_search="live"`、Claude は `WebSearch` / `WebFetch` を有効化・事前許可します。別の検索キーは不要です。現在局面の戦術・数値は引き続き盤面・エンジンが根拠です。DeepSeek 接続にウェブ検索はありません。[Codex 検索設定](https://learn.chatgpt.com/docs/config-file/config-basic#web-search) · [Claude 権限](https://code.claude.com/docs/en/cli-reference)

既定値は `CODEX_MODEL` / `CODEX_EFFORT`、`CLAUDE_MODEL` / `CLAUDE_EFFORT` で、空なら CLI 既定です。アプリ内の保存値が優先されます。

Windows はネイティブ `.exe` を推奨します。npm の `.cmd` は直接実行するネイティブファイルではありません。`npm root -g` で場所を確認し、Node と実際の JS エントリーを指定します。

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

Claude の npm 版も実際の入口で `CLAUDE_PATH` / `CLAUDE_SCRIPT` を指定します。ネイティブ版は `*_SCRIPT` 不要です。GUI の PATH は端末と異なる場合があるため、絶対パスが確実です。

## コーチプロンプトと技能

- [実行時の中国語プロンプト](../../prompts/coach.zh-CN.md)：黒白視点、着手前後の比較、主変化引用、石の強弱、解説の深さを規定します。
- [再利用可能な go-coach](../../skills/go-coach/SKILL.md)：手動呼び出しでも同じ規範を読みます。

着手解説には前後の盤面・候補・変化を渡し、必要に応じ追加探索します。棋形に合う囲碁用語で目的と得失を説明するよう促します。表示言語はこの中国語プロンプトを変えず、回答を自動翻訳しません。

本文の座標強調、排他的切り替え、保存できる試し打ちと `edit_trial` は[対話型解説](coach-links.md)を参照してください。
