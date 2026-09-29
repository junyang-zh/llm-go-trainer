# 更新履歴

[English](../en/release-notes.md) · [简体中文](../release-notes.md) · [繁體中文](../zh-TW/release-notes.md) · [日本語](release-notes.md) · [한국어](../ko/release-notes.md)

## v0.1.3

- 囲碁モデル管理：推奨区分、公式カタログ、独自モデル、ダウンロード進捗・取消、切り替え・削除。
- Windows CUDA を追加し、OpenCL との選択を保存。CUDA は非同梱で、初回選択時に約 1.45 GiB の検証済み依存ファイルを取得し、モデルは再利用します。
- 通知に探索数と平均探索数/秒を表示。探索回数・時間制限を自動保存します。
- モデルのキャッシュがあれば minimal 更新を使用し、モデル・バックエンド・調整キャッシュを再利用。旧版は一度この版へ更新すると、その後この方式を利用できます。
- Windows 初回 OpenCL 調整中の状態・タイムアウトを修正し、メニューバーを非表示にしました。
- 設定を「一般」「囲碁モデル」「AI 自動着手」「LLM 接続」に整理しました。

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
