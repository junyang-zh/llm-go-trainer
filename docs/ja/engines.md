# エンジンの導入・ライフサイクル・拡張

[English](../en/engines.md) · [简体中文](../engines.md) · [繁體中文](../zh-TW/engines.md) · [日本語](engines.md) · [한국어](../ko/engines.md)

<a id="installation"></a>

## 自動インストール

ソース実行は `<repo>/.local/katago/`（`GO_TRAINER_DATA_DIR` で変更可能）、Electron インストール版は `app.getPath('userData')/katago/` を使います。以下は Git に含めません。

```text
katago/
  downloads/                  SHA-256 別のダウンロードキャッシュ
  models/                     検証済み .bin.gz / .txt.gz
  darwin-arm64-<revision>/     または win32-x64-<revision>
    bin/                      実行ファイルと Windows DLL
    lib/                      macOS 動的ライブラリ
    licenses/                 アーカイブ内の上流ライセンス
    installed.json            インストール済みファイルの摘要
  connection.json             選択した接続（秘密情報なし）
  models.json                 モデル一覧と選択
```

サーバーは先に待ち受けを開始し、取得・導入・ウォームアップを裏で行います。画面は GPU を待ちません。ソース実行や必要資源を含まないパッケージの初回はネット接続と数百 MB の取得領域、展開・モデルキャッシュ用領域が必要です。実分析の成功を ready 条件とし、取得失敗・非対応環境でもエラー表示と盤面操作は可能です。

Windows OpenCL は主モデルと HumanSL を別々に初回調整し、数分かかる場合があります。キャッシュ後は高速化し、状態は調整・キャッシュ読込・初回分析確認を区別します。初期化は既定で最低 10 分（分析タイムアウト以上）を許容し、`KATAGO_STARTUP_TIMEOUT_MS` で変更できます。通常分析は `KATAGO_TIMEOUT_MS`（既定 3 分）です。初期化は中止可能で、タイムアウトには末尾の診断を添え、調整の遅延とドライバー障害を見分けられます。

### Windows CUDA

「囲碁モデル → 計算バックエンド」で OpenCL / CUDA（NVIDIA）を選びます。既存環境は OpenCL のままです。CUDA 12.8 対応 GPU・ドライバーが必要で、初回選択時に公式 KataGo / NVIDIA から KataGo 1.18.2、CUDA Runtime 12.8.90、NVRTC 12.8.93、cuBLAS 12.8.4.1、cuDNN 9.8.0.87 を計約 1.45 GiB（圧縮）取得します。CUDA Toolkit の全体インストールは不要で、DLL は専用 `bin` に置き、システム PATH は変更しません。

バージョン・SHA-256 は `config/katago/windows-cuda.json` に固定します。NVIDIA 摘要の出典は [CUDA 12.8.1 redistrib](https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.8.1.json) と [cuDNN 9.8.0 redistrib](https://developer.download.nvidia.com/compute/cudnn/redist/redistrib_9.8.0.json) です。バックエンドの領域は別、モデルは共通です。切り替えで旧プロセスを終了し選択を保存します。失敗時は OpenCL に戻せます。通常版は引き続き OpenCL を同梱し、CUDA は初回選択時だけ取得、以後キャッシュを使います。

性能確認は `node --import tsx scripts/benchmark-backends.ts <cache-directory> [rounds]`。実際に選択中の主モデル・HumanSL とアプリ設定で両バックエンドを交互に試し、導入確認、起動、19 路の 2 局面を 400/4000 visits で測ります。結果は端末に出し、保存する場合はリポジトリ外へ。他の GPU 負荷を避け、起動時間と探索速度を別指標として扱います。

<a id="custom-paths"></a>

## 独自エンジンのパス

既存環境は `KATAGO_MODEL` で上書きを有効化できます。CUDA/TensorRT にも対応し、Windows パスは `/` を使います。

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

アプリは `reportAnalysisWinratesAs=BLACK` を強制し、すべて黒視点です。`.env` の場所は[環境設定](development.md#environment)を参照してください。

## モデル管理

「囲碁モデル」に起動・停止・外部接続をまとめ、コーチ認証は「LLM 接続」に分離しています。推奨・取得済み・すべての絞り込み、名前・構造検索、サイズ・対応盤・出典・SHA-256 表示、順次ダウンロード、進捗・取消・再試行、未選択モデル削除に対応します。通信中断の partial は再開し、明示取消は実行中の partial を削除します。

[`config/katago/models.json`](../../config/katago/models.json) と artifacts に推奨を固定します。軽量 B10 は過去の小型ネット、均衡 B18 は元の既定、上級 Transformer は公式 tf3 です。区分は用途・資源の説明で、実測段位・Elo・速度ではありません。OpenCL の Transformer は遅い場合があります。B10 摘要は公式 v1.3 のモデルから計算し、Transformer/B18 のサイズ・摘要は公式学習 API 由来です。HumanSL は任意の補助モデルで、主分析には選べません。

「最新の公式モデルを取得」は `katagotraining.org/api/networks/` の摘要・URL・基本情報を保存し、過去のページも取得できます。失敗しても保存済み一覧・モデルは利用可能です。「別のモデルを追加」は公式学習サイト・旧モデルサイト・KataGo GitHub Release の HTTPS `.bin.gz` / `.txt.gz` のみ受け付け、SHA-256、役割、対応盤が必須です。任意の内部 URL や実行ファイルは拒否します。

`katago/models.json` が一覧・選択を、`katago/models/<sha256>.bin.gz` または `.txt.gz` が検証済みファイルを保存します。拡張子は KataGo の形式判定に使うため保持します。既存モデルを認識し、更新でも選択を維持します。取得だけでは切り替えません。切り替えは旧エンジンを停止し、新モデルで実際に初期分析して成功時だけ保存します。失敗・取消は旧選択を保持し、「エンジン起動」で復帰できます。選択中・検証中は削除不可です。`.env` の `KATAGO_MODEL` 使用時も管理・取得は可能ですが、自動上書きを避けて管理モデルの選択を無効にします。

API：`GET /api/models` は一覧・キャッシュ・選択・検証待ちを返します。`POST /api/models/download|cancel|delete` は `{id}`、`select` は `{main, human}`（`human` は `null` 可）、`refresh` は `{page}`、`add` は `{name, url, sha256, role, boards}` を受けます。書込はエンジン操作と同じ同一オリジン JSON 保護です。

取得は HTTPS、固定 SHA-256、一時ファイル、最終検証・改名を使います。通信エラーは最大 3 回再試行し HTTP Range で再開、Range 無視時は最初から書きます。未検証ファイルは実行しません。手動停止は未完了ファイルを削除、通信断は次回再開用に残します。破損時は検証済み同梱資源から修復し、なければ再取得します。エラーは資源・ホスト・利用可能な通信コードを表示します。導入ロックで並行展開を防ぎ、古いロックは復旧できます。

## バージョンと出典

資源を更新する際は manifest の revision も変更し、起動テストを行います。

- [`artifacts.json`](../../config/katago/artifacts.json)：主モデル、HumanSL、Windows パッケージ。
- [`macos-bottles.json`](../../config/katago/macos-bottles.json)：Metal 1.18.2、libzip/xz/zstd/lz4/abseil/protobuf の固定 ARM64 Sequoia bottles。macOS 15 以上、Homebrew 導入不要。ライブラリは子の `DYLD_LIBRARY_PATH` のみに追加。
- Windows は [OpenCL 1.18.1](https://github.com/lightvector/KataGo/releases/tag/v1.18.1) または [CUDA 1.18.2](https://github.com/lightvector/KataGo/releases/tag/v1.18.2) の公式実行ファイル・DLL を使用。TensorRT は独自 `.env` パスで利用可能。
- 主モデル `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` は[公式学習サイト](https://katagotraining.org/networks/)由来で、摘要は [Homebrew](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb) と一致。
- HumanSL `b18c384nbt-humanv0.bin.gz` は [KataGo 1.15.0](https://github.com/lightvector/KataGo/releases/tag/v1.15.0) の公式 HTTPS 資産から摘要を計算。[人間モデル説明](https://katagotraining.org/extra_networks/)も参照。
- Homebrew URL に完全な blob SHA-256 が含まれ、Windows は GitHub release asset digest と照合します。

KataGo は [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE)、依存物は個別ライセンスです。LICENSE/COPYING/COPYRIGHT/NOTICE を保持し、第三者バイナリ・重みはコミットしません。通常版は 2 つの公式モデルと[許諾文](../../config/katago/MODEL-LICENSE.txt)を同梱し、検証後に利用者キャッシュへコピーします。エンジン・依存アーカイブも同梱し、検証済みキャッシュまたは `GO_TRAINER_BUNDLED_RUNTIME` の資源を優先、欠落・破損時のみ取得します。両通常版はオフライン準備可能ですが、Windows は OpenCL ドライバーが必要です。minimal は初回に全資源を取得します。[公開](releases.md)を参照してください。

## 探索制限と統計

「AI 自動着手」は回数（50〜1,000,000 visits）または時間（0.1〜120 秒）をローカル保存します。`Training.searchLimit` は `visits`、`maxTime` は 5 秒が既定です。時間モードは `overrideSettings.maxTime` と高い visits 上限で、制限時点の分析・着手を正常に返します。応答停止用通信タイムアウトは別の保護です。背景曲線は最大 100 visits、コーチは自身の予算を使います。

`Analysis.searchStats` の `elapsedMs` / `visitsPerSecond` は実際の `rootInfo.visits` を要求送信から結果までの単調時計時間で割った値です。待ち行列・通信を含む平均で、GPU 理論性能ではありません。中間・最終とも黒視点を保持します。通知はライブ統計、展開パネルは分析済み進捗と統計を表示し、候補領域を確保します。外部エンジンに時間情報がなければ回数だけ表示します。

`POST /api/bot-move` は JSON に加え `Accept: application/x-ndjson` で中間 `analysis` と `move`・`method`・`analysis` を含む最終 `done` を返します。切断は探索を取り消します。

## 操作とプロセス終了

「設定 → 囲碁モデル」で起動・停止・再起動・外部 HTTP AI 接続を行います。手動停止後は明示的な起動かアプリ再起動まで停止を維持し、切り替えは旧プロセスを先に解放します。外部サービス自体の起動・終了は利用者が管理します。

`GET /api/status` の `engine` は `phase`、`ready`、`running`、`pid`、`backend`、`progress`、`error` を返します。phase は idle/downloading/installing/starting/ready/stopping/stopped/error です。同一オリジン要求には `Content-Type: application/json` と `X-Go-Trainer: 1` が必要です。

| API                          | 本文     | 動作                                                       |
| ---------------------------- | -------- | ---------------------------------------------------------- |
| `POST /api/engine/start`     | `{}`     | 停止・エラーから開始                                       |
| `POST /api/engine/stop`      | `{}`     | 取得・要求を取消し所有プロセス終了を待つ                   |
| `POST /api/engine/restart`   | `{}`     | 完全停止後に導入確認・初期化                               |
| `GET /api/engine/connection` | —        | 現在の選択                                                 |
| `POST /api/engine/connect`   | 下記接続 | 保存・旧プロセス解放・背景初期化。同じ接続なら再起動しない |

KataGo は `spawn`、`shell:false`、`detached:false`、所有 stdin を使います。通常終了は入力を閉じ SIGTERM、最大 2 秒後に SIGKILL し `close` を待ちます。同期終了フックも子を終了させます。stdin EOF による KataGo 終了は親の強制終了時の補助であり、OS Job Object 相当の保証ではありません。

最後のデスクトップ窓を閉じると macOS でも終了します。Web は `Ctrl+C` が必要で、タブを閉じてもサービスは終了しません。外部 HTTP の停止は接続解除のみで、外部プロセスには触れません。

<a id="adapters"></a>

## 外部囲碁 AI の契約

内蔵は `{"mode":"managed"}`、外部は次の形式です。

```json
{ "mode": "external", "name": "自分の囲碁 AI", "url": "http://127.0.0.1:9000/analyze" }
```

HTTPS または loopback HTTP を使います。URL 認証・クエリ・リダイレクト・UI の API キーは未対応です。GTP はこの契約を実装する HTTP ブリッジが必要で、TCP/GTP ポートを直接指定できません。

完全な URL に [`shared/types.ts`](../../shared/types.ts) の `{game, training}` を POST します。game はサイズ・ルール・コミ・初期石・全履歴を含みます。接続時は空の 19 路、50 visits で確認します。JSON / `application/x-ndjson` に対応します。

```json
{
  "id": "your-request-id",
  "perspective": "B",
  "turnNumber": 0,
  "rootInfo": { "visits": 50, "winrate": 0.5, "scoreLead": 0 },
  "moveInfos": [
    {
      "move": "D4",
      "visits": 50,
      "winrate": 0.5,
      "scoreLead": 0,
      "prior": 0.1,
      "order": 0,
      "pv": ["D4", "Q16"]
    }
  ]
}
```

勝率・目差・領域はすべて**黒視点**で、手番視点ではありません。`turnNumber` は履歴長と一致。任意の `ownership` は左上から行優先の size² 値（+1 黒 / −1 白）、`policy` / `humanPolicy` も KataGo の行優先で末尾が pass です。範囲はサーバースキーマで検証します。HumanSL なしは候補サンプリングに戻り、他エンジンを KataGo の根拠と呼びません。

```json
{"type":"analysis","phase":"after","final":false,"analysis":{}}
{"type":"done","analysis":{}}
```

NDJSON は 1 行 1 オブジェクトです。`{}` は完全で合法な分析に置換し、最後に必ず `done` を送ります。切断・`error` は失敗です。クライアント切断時は上流計算を取り消してください。GPU 利用・棋力・数値の比較可能性はアダプターによります。
