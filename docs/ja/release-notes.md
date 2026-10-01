# 更新履歴

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ko/release-notes.md)

## v0.1.6

- SGF の取り込みで変化ツリー全体、コメント、盤面のマークを保持し、複数の棋譜を含む SGF コレクションにも対応しました。各ファイルを 1 つのローカル棋譜として表示し、自分の定石集を閲覧できます。
- 手順の選択、親ノードへの移動、変化の切り替え、選択した局面のメイン盤面への読み込みに対応しました。石の配置・除去や手番指定のノードも閲覧できます。試し打ちは関連棋譜として保存でき、元の SGF 全体を保持して書き出せます。
- SGF 取り込みのファイルサイズ、ノード数、入れ子の深さの制限を撤廃しました。ルール未指定または非対応の場合は従来どおり中国ルールを使用し、その取り込み警告を表示しなくなりました。
- 手順パスと変化選択のボタンに細い枠線と淡い背景を追加し、ナビゲーションや盤面への読み込みボタンと見分けやすくしました。
- Codex / Claude の設定に CLI パスと任意の Node パスを追加しました。ネイティブ実行ファイルと Node スクリプトに対応し、デスクトップ起動時の CLI 検索と検出を改善しました。

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
