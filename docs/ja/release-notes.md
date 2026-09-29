# 更新履歴

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ko/release-notes.md)

## v0.1.5

- Agent が棋譜の読み込み、現在局面や試し打ち分岐の保存、棋譜名の変更に対応しました。盤面と棋譜ライブラリを同期し、試し打ちは元の棋譜を残した関連棋譜として保存します。中断後の続行でも更新した棋譜のコンテキストを保持します。
- 長い解説中に「CLI 出力が上限を超えました」となる問題を修正しました。Codex / Claude CLI の累計出力、Codex の回答ファイル、フロントエンドのローカルメッセージに対する固定長制限を撤廃し、ツール結果による隠れた総量制限を解消しました。
- 棋譜ライブラリの検索、ページ切り替え、名前変更、出典表示、関連分岐のグループ化を追加しました。通常版は CWI の全棋譜アーカイブを同梱し、minimal 版は棋譜ダウンロード画面から必要に応じて導入できます。定石集・詰碁集は同梱していません。
- 野狐囲碁の棋譜をユーザー名または UID で検索し、ローカルライブラリへ取り込めるようになりました。同じ棋譜を再度取り込んでも記録は重複しません。
- minimal 版は初回起動時にエンジンやモデルを自動取得しなくなりました。ローカルエンジンを使う場合は「設定 → 囲碁モデル」で KataGo のダウンロード・有効化を選択してください。既存のモデル、棋譜、会話は保持します。
- プロジェクトに MIT ライセンスを採用し、アプリ内のライセンス表示、第三者コンポーネントと棋譜出典の告知を追加しました。第三者のリソースにはそれぞれのライセンスが適用されます。

環境に合うインストーラーを 1 つ選んでください。

| ファイル末尾              | 環境                      | 同梱モデル         |
| ------------------------- | ------------------------- | ------------------ |
| `windows-x64.exe`         | Windows 10/11 x64         | 主モデル + HumanSL |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 設定から手動取得   |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 主モデル + HumanSL |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 設定から手動取得   |

両版の機能は同じです。Windows 通常版は KataGo OpenCL と DLL を同梱しますが GPU の OpenCL ドライバーが必要です。macOS 通常版は Metal とライブラリを同梱し、Homebrew もエンジン・モデルのネット取得も不要です。minimal は両環境とも設定の囲碁モデル画面からエンジン・依存ファイル・モデルを手動で取得・有効化します。失敗時は資源名、ホスト、利用可能なネットワークエラーコードを表示します。LLM 認証情報は同梱せず、設定で接続します。

macOS は Applications にドラッグします。公開認証情報が揃えば Developer ID 署名・Apple 公証を行い、そうでなければ未署名・未公証で初回の安全確認に遮断される場合があります。Windows は `.exe` を実行します。未署名のため不明な発行元の警告が出る場合があります。

「設定 → 一般」で Release 確認・自動更新を設定します。検証済みモデルがあれば minimal、モデルなしの通常版は通常版で更新します。Windows と Developer ID 署名済み macOS は取得後に「再起動してインストール」を使えます。未署名 macOS は Release ページから手動導入します。

`.zip` / `.yml` は自動更新用です。初回は `.dmg` / `.exe` を選びます。`SHA256SUMS.txt` はインストーラーと更新ファイルの SHA-256 一覧です。Source code はインストーラーではありません。
