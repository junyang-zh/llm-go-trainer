# 更新履歴

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ko/release-notes.md)

## v0.1.4

- 英語、簡体字中国語、繁体字中国語、日本語、韓国語の UI を追加しました。既定はシステム言語に従い、一般設定で選択を保存できます。通知、モデルパネル、表示済みの状態も切り替わります。
- 「目差 / 勝率」の探索前後の高さ変動を修正しました。候補変化の領域を確保し、現在の勝率を見出し横に表示して折りたたみ時は非表示にします。探索数と探索数/秒は分析進捗の横に移しました。
- 対話型解説を強化しました。座標の強調と盤面への接続、グループ別変化切り替え、コーチによる試し打ち分岐の作成・編集に対応し、実戦棋譜を変えず会話と保存します。
- 1 回の時間、ツール回数、累計探索数の上限を追加しました。上限到達時は結果を保持して続行でき、既定ではすべて無制限です。
- Codex / Claude Code コーチは必要に応じウェブを調べて出典を示せます。現在局面の戦術・数値は引き続き盤面・エンジンを根拠とします。DeepSeek のウェブ検索は未対応です。
- README と使用・エンジン・LLM・開発・公開・設計文書を 5 言語化し、CI と最新 Release のバッジを追加しました。

環境に合うインストーラーを 1 つ選んでください。

| ファイル末尾              | 環境                      | 同梱モデル         |
| ------------------------- | ------------------------- | ------------------ |
| `windows-x64.exe`         | Windows 10/11 x64         | 主モデル + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 初回ダウンロード   |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主モデル + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 初回ダウンロード   |

両版の機能は同じです。Windows 通常版は KataGo OpenCL と DLL を同梱しますが GPU の OpenCL ドライバーが必要です。macOS 通常版は Metal とライブラリを同梱し、Homebrew もエンジン・モデルのネット取得も不要です。minimal は両環境ともエンジン・依存ファイル・モデルを初回取得します。失敗時は資源名、ホスト、利用可能なネットワークエラーコードを表示します。LLM 認証情報は同梱せず、設定で接続します。

macOS は Applications にドラッグします。公開認証情報が揃えば Developer ID 署名・Apple 公証を行い、そうでなければ未署名・未公証で初回の安全確認に遮断される場合があります。Windows は `.exe` を実行します。未署名のため不明な発行元の警告が出る場合があります。

「設定 → 一般」で Release 確認・自動更新を設定します。検証済みモデルがあれば minimal、モデルなしの通常版は通常版で更新します。Windows と Developer ID 署名済み macOS は取得後に「再起動してインストール」を使えます。未署名 macOS は Release ページから手動導入します。

`.zip` / `.yml` は自動更新用です。初回は `.dmg` / `.exe` を選びます。`SHA256SUMS.txt` はインストーラーと更新ファイルの SHA-256 一覧です。Source code はインストーラーではありません。
