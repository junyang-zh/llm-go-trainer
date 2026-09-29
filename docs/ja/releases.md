# デスクトップ版の公開

[English](../en/releases.md) · [简体中文](../releases.md) · [繁體中文](../zh-TW/releases.md) · [日本語](releases.md) · [한국어](../ko/releases.md)

`v*` タグの push で GitHub Actions が Windows 10/11 x64 と macOS 15+ Apple Silicon の通常版・minimal 版、計 4 インストーラーを作成・公開します。32 bit、Windows 7/8、Intel Mac はありません。macOS は認証情報が揃えば Developer ID 署名・Apple 公証、それ以外は未署名・未公証です。Windows 署名は未設定です。

## 公開手順

1. `package.json` / `package-lock.json` のバージョンを更新します（例：`npm version 0.1.1 --no-git-tag-version`）。必要に応じ各言語の更新履歴も更新します。
2. ローカルコミットとクリーンな作業ツリーを準備します。正確なコミット・変更、送信先 remote/branch、検証結果を利用者に提示し、今回の push の明示承認後だけ送信します。
3. タグも事前確認が必要です。正確なバージョン/tag、対象 commit/remote、リリースノート、検証結果を提示し、明示承認後に package.json と一致するタグを作成・push します。承認は確認済み変更・宛先のみで、追加変更やリモートタグの置換は再承認が必要です。バージョン選択や公開機能の実装依頼は push 承認ではありません。

以下は該当ブランチ・タグの push がそれぞれ承認された後だけ実行します。

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

Actions の `release` で進捗を確認します。`windows-2022` x64 / `macos-15` ARM64 でテスト、TypeScript/Vite/サーバービルド、electron-builder、モデルとエンジン・依存アーカイブを検証します。通常版は固定 manifest の資源を SHA-256 検証後に同梱し、破損キャッシュは再取得します。モデル・バイナリは Git に入れません。

全 4 ビルド成功後、公開 job が 4 インストーラー、macOS 更新 ZIP 2 個、更新 manifest 4 個のバージョン・ファイル名・サイズ・SHA-512 を確認します。`SHA256SUMS.txt` を作り、全資産を draft Release にアップロードしてから公開します。この job のみ `contents: write` と自動の `GITHUB_TOKEN` を使い、個人 token は不要です。失敗は再実行でき、非公開 draft は継続可能ですが公開済み版は上書きせず新バージョンを出します。`0.2.0-beta.1` のように `-` を含む版は prerelease です。

手動 Actions はブランチ選択なら artifacts のみ、版タグなら公開を試みます。先に公開 Release を手作業で作らないでください。

<a id="local-build"></a>

## ローカルビルド

対象 OS に Node.js 24 を入れ、実行します。

```sh
npm ci
npm run package:desktop
npm run package:desktop -- minimal
```

引数なしは通常版（`-- standard` も可）、minimal は `-- minimal`。出力は `release/standard/` / `release/minimal/` で、minimal のみ `-minimal` 接尾辞が付きます。macOS は Apple Silicon 上で arm64 DMG と更新 ZIP、Windows は x64 NSIS EXE を作ります。両版は app ID と userData を共有し、相互に上書き更新できます。

`public/logo.svg` から Windows ICO、macOS ICNS、窓用 PNG を生成し、無視対象 `.local/icons/` に保存します。ロゴ変更後は再ビルドします。

通常版の `Resources/katago-models/` は主モデル・HumanSL・出典摘要・許諾文を含みます。起動は検証済み利用者キャッシュ、同梱コピーの順で優先し、不足・破損時だけ取得します。`katago-runtime/` は固定 SHA-256 の Windows OpenCL ZIP（DLL 含む）または macOS Metal と全依存 bottles・宣言を含みます。初回もオフライン導入でき、Windows は GPU の OpenCL ドライバーが必要、macOS は Homebrew 不要です。minimal はこれらを含まず初回取得します。

CI は資源を検証しますが対象 GPU ドライバーがなく、Windows OpenCL / macOS Metal の実機・インストール検証を代替しません。公開前後に対象 OS で導入、起動、分析、終了を確認してください。

参照：[GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[electron-builder v26](https://www.electron.build/v26/docs/configuration/)、[モデル許諾](https://katagotraining.org/network_license/)。

<a id="updates"></a>

## 自動更新と macOS 署名

通常版は `latest.yml` / `latest-mac.yml`、minimal は `minimal.yml` / `minimal-mac.yml` で開始します。確認時に userData に SHA-256 検証済みモデルが 1 つ以上あれば通常版も minimal 通路を使い、エンジン・モデルを含まないアプリのみ取得します。共通 app ID/userData により選択・一覧・エンジン・調整キャッシュを維持し、アプリ更新ごとにモデルを再取得しません。将来の engine revision 変更でも不足するエンジン資源だけ取得し、同一摘要のモデルを再利用します。有効モデルが皆無なら通常版のまま、部分キャッシュでも minimal を選び、起動時に不足する選択モデルだけ取得します。

manifest は electron-builder が生成し、macOS は ZIP、Windows は NSIS EXE を使います。安定 Release のみを確認し、摘要と選択した版・OS を厳格に照合します。minimal manifest がない、または通常版を指す場合はエラーとし、大きい通常版へ黙って戻しません。版をまたぐ差分 blockmap は無効で、**minimal アプリ全体**を取得し、モデルを再取得するわけではありません。更新後の表示版は minimal です。設定は `userData/updates.json`、自動更新は既定オフ、取得後は利用者が「再起動してインストール」を押します。旧版はこのロジックを含む版へ一度更新してから利用できます。

署名・公証には **Settings → Secrets and variables → Actions** に以下の 5 項目を設定します。

| Secret                       | 内容                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `MACOS_CERTIFICATE`          | Developer ID Application 証明書・秘密鍵を書き出した `.p12` の Base64 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` の書き出しパスワード                                          |
| `APPLE_API_KEY_P8`           | 公証用 App Store Connect API `.p8` 秘密鍵                            |
| `APPLE_API_KEY_ID`           | 対応 Key ID                                                          |
| `APPLE_API_ISSUER`           | 対応 Issuer ID                                                       |

Apple Developer アカウントで作成し、以後も同じ署名 ID を維持します。証明書・秘密鍵・パスワードをコミットしたりアプリ設定へ入れたりしません。不足時は CI が不足名を記録し、自動 ID 検出を無効にして署名・公証・ticket 検証を省略し、未署名を公開します。完備時は runner 一時領域だけに秘密を書き、証明書の導入、Hardened Runtime、署名・公証、署名と ticket の検証、清掃を行います。有効化後の失敗は公開を止め、未署名に戻したり不完全な公開をしたりしません。

ローカル `npm run package:desktop` は既定で未署名・未公証です。更新確認と Release を開く操作はできますが自動導入は不可で、初回に macOS が遮断する場合があります。署名ビルドは electron-builder 認証情報と `GO_TRAINER_REQUIRE_SIGNING=1` を設定します。完全な検証は署名済みインストール版から上位版へ更新し、両版のデータ保持・終了・再起動を確認します。

[Electron の macOS 更新署名要件](https://www.electronjs.org/docs/latest/api/auto-updater#macos)を参照してください。
