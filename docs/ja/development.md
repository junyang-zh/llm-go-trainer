# 開発ガイド

[English](../en/development.md) · [简体中文](../development.md) · [繁體中文](../zh-TW/development.md) · [日本語](development.md) · [한국어](../ko/development.md)

[README](../../README.ja.md) · [設計](architecture.md) · [ビルドとリリース](releases.md)

## Electron の起動

Node.js 22.12 以上（24 LTS 推奨）と npm が必要です。macOS / Windows PowerShell で実行できます。

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
npm run desktop
```

日常利用と UI テストの基本手順です。ビルド後に Electron を開き、ローカルサーバーと KataGo を起動します。ウィンドウを閉じると両方終了します。変更後は古いウィンドウを閉じて再実行してください。このコマンドはホットリロードしません。

[初回起動](usage.md#installation)、[エンジン](engines.md)、[LLM 設定](llm.md)も参照してください。

## ブラウザーでのデバッグ

ホットリロードやブラウザー固有の調査には Web モードを使えます。

| 用途                 | コマンド                         | URL                     |
| -------------------- | -------------------------------- | ----------------------- |
| 開発・ホットリロード | `npm run dev`                    | <http://127.0.0.1:5173> |
| ビルド済み Web       | `npm run build` の後 `npm start` | <http://127.0.0.1:3001> |

終了はターミナルの `Ctrl+C` で行います。タブを閉じてもサーバーや KataGo は終了しません。

<a id="environment"></a>

## 環境設定

ソース実行は [`.env.example`](../../.env.example) をルートの `.env` にコピーして既定値を設定できます。変更後は再起動し、環境診断には `npm run doctor` を使います。アプリ内の LLM 設定が環境変数より優先されます。[LLM 設定](llm.md)を参照してください。

インストール版は Electron userData の `.env` を読みます。通常 macOS は `~/Library/Application Support/llm-go-trainer/.env`、Windows は `%APPDATA%/llm-go-trainer/.env` です。アプリ名変更時は `app.getPath('userData')` を基準にします。独自エンジン・モデルは絶対パスを使ってください。[独自パス](engines.md#custom-paths)、[キャッシュ](engines.md#installation)、[履歴](architecture.md#history)に詳細があります。

`.env`、認証情報、バイナリ、モデル、非公開 SGF、実行ログをコミットしないでください。

## テストと検証

ロジック変更の完了前に実行します。

```sh
npm test
npm run build
```

**UI / E2E は Electron を優先します。**

```sh
npm run desktop
npm run test:coach-layout
npm run test:i18n-layout
```

盤面の伸縮、設定、SGF、ストリーミング、エンジン操作、閉じた後のプロセス終了を確認します。ブラウザーテストは補助であり、デスクトップ検証の代わりにはなりません。

`test:coach-layout` は独立した一時領域で複数サイズの座標強調、距離による明るさ、双方向ホバー・キーボード接続、スクロールの切り抜き、グループ・分岐・折りたたみ復帰を検証します。`test:i18n-layout` は 5 言語と複数サイズで設定、モデル通知、探索開始・完了・エラー・再試行時の領域確保、見出し整列、はみ出しを検証します。

自動テストはルール、SGF、相手選択、黒白視点、エンジン寿命、LLM プロトコル、UI を対象にします。ローカル fixture を使い、loopback 接続が必要ですが実際の LLM キーは不要です。模擬評価は `tests/fixtures/` のみに置き、アプリの代替評価に使いません。CI は Ubuntu、macOS、Windows で実行します。結果、ハードウェア、プロバイダー、未検証点は会話で報告し、作業報告・ログをリポジトリに保存しません。

## 翻訳の保守

`src/i18n.ts` がシステム言語、選択の保存、文字列の補間を扱います。`src/locales/{en,zh-CN,zh-TW,ja,ko}.json` のキーと引数を揃えてください。UI は `t(...)` を使い、サービスの診断は原文で保持して描画時に `localizeDiagnostic(...)` で変換します。これにより既存通知も言語切り替えに追従します。独自名と未知の診断は保持し、実行時の中国語コーチプロンプトや回答を自動翻訳しません。

簡体字版は元の README/docs パス、他言語は `README.<locale>.md` と `docs/<locale>/` を使い、各ページから同じ内容の 5 言語版へ移動できます。変更は各言語に反映し、コマンド・設定名・技術的制約を保持して相対リンクを確認します。`tests/i18n.test.tsx` が言語判定、キー・引数の一致、状態を保持する切り替えを検証します。

<a id="local-build"></a>

## パッケージ作成

コマンド、対象環境、出力先、検証と公開手順は[ビルドとリリース](releases.md#local-build)で管理します。

## ディレクトリ

```text
src/          Web UI、SVG 盤面、翻訳カタログ
shared/       純粋 TypeScript のルール、SGF、訓練方針
server/       ローカル API、KataGo、LLM、根拠データ
desktop/      Electron シェル
config/       KataGo 分析設定
prompts/      実行時コーチプロンプト
skills/       再利用可能な囲碁コーチ技能
docs/         使用・設定・開発・公開文書
tests/        ルール・統合テスト（実モデル不要）
```

責務とデータの流れは[設計](architecture.md)をご覧ください。
