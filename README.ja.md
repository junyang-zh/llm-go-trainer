# LLM Go Trainer

[English](README.en.md) · [简体中文](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

ローカルの [KataGo](https://github.com/lightvector/katago) との対局、棋譜の検討、LLM エージェントによる解説を提供する囲碁トレーニングアプリです。macOS / Windows に対応しています。

![LLM Go Trainer：棋譜検討と試し打ち、KataGo の勝率・目差グラフ、LLM の解説](assets/UI-Example.png)

_ひとつの画面で棋譜を振り返り、変化を試し、KataGo の分析と LLM の解説で局面を理解できます。_

## 主な機能

- **AI 対局**：9・13・19 路盤、置き石、コミに対応。KataGo と HumanSL で着手を選択します。
- **棋譜検討**：SGF の読み込み・書き出し、対局履歴の保存、過去の局面からの試し打ちと別棋譜への保存。
- **局面分析**：勝率・目差グラフ、候補手、主変化、領域予測。
- **AI コーチ**：DeepSeek API、Codex CLI、Claude Code CLI がエンジンの分析を使って着手・局面・変化を解説。
- **表示言語**：英語、簡体字中国語、繁体字中国語、日本語、韓国語。既定ではシステム言語に従います。

操作方法と制約は[使い方](docs/ja/usage.md)をご覧ください。

## ダウンロード

[GitHub Releases](https://github.com/junyang-zh/llm-go-trainer/releases) から入手できます。

| 環境                      | インストーラー |
| ------------------------- | -------------- |
| Windows 10/11 x64         | `.exe`         |
| macOS 15+ / Apple Silicon | `.dmg`         |

通常版はエンジン・依存ライブラリ・モデルを同梱し、`minimal` 版は初回起動時にダウンロードします。機能は同じです。[初回起動](docs/ja/usage.md#installation)と[更新履歴](docs/ja/release-notes.md)も参照してください。

## ドキュメント

| 文書                                        | 内容                                                 |
| ------------------------------------------- | ---------------------------------------------------- |
| [使い方](docs/ja/usage.md)                  | インストール、対局、検討、試し打ち、コーチ、更新     |
| [エンジンとモデル](docs/ja/engines.md)      | KataGo、モデル管理、バックエンド、独自パス、外部 AI  |
| [LLM 設定](docs/ja/llm.md)                  | DeepSeek / Codex / Claude Code、認証情報、プロンプト |
| [対話型解説](docs/ja/coach-links.md)        | 座標リンク、切り替え、試し打ち分岐                   |
| [開発ガイド](docs/ja/development.md)        | Electron、ブラウザー、テスト、翻訳、ディレクトリ     |
| [ビルドとリリース](docs/ja/releases.md)     | パッケージ、公開、署名、公証、自動更新               |
| [設計と今後の計画](docs/ja/architecture.md) | モジュール、ストリーミング、保存、今後の課題         |
