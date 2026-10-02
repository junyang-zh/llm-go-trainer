# 更新履歴

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ko/release-notes.md)

## v0.1.7

- 試し打ち中も勝率と目差のグラフに実戦の本譜全体を保持します。試し打ちは赤、本譜の後続手は灰色で表示し、試し打ちを消すとキャッシュ済みの本譜グラフをすぐに復元します。数値は引き続き黒の視点です。
- 実戦と試し打ちの未評価局面をバックグラウンドで自動補完し、表示中の局面を優先します。探索中・完了・エラーの通知を調整し、完了時に分析した手数とエンジンが提供する探索速度を表示します。
- 領地予測は所有値の絶対値が 0.8 以上の点のみを明瞭な黒白のマークで表示します。候補手や試し打ちの手順番号と同時に表示でき、重ならないよう位置をずらします。
- コーチの回答で複数座標による石の一団の参照と柔らかな霧状ハイライトに対応し、グループ切り替えやキーボードフォーカスも利用できます。参照テキストが表示範囲外に出るか盤面の局面が変わると非表示になります。単点参照の線はマーク右下端から出るよう変更し、コーチの指示と各言語の説明を更新しました。
- README の画面例を更新しました。

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
