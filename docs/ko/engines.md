# 엔진 설치, 수명 관리, 확장

[English](../en/engines.md) · [简体中文](../engines.md) · [繁體中文](../zh-TW/engines.md) · [日本語](../ja/engines.md) · [한국어](engines.md)

<a id="installation"></a>

## 자동 설치

소스 실행은 `<repo>/.local/katago/`를 사용하고 `GO_TRAINER_DATA_DIR`로 바꿀 수 있습니다. Electron 설치판은 `app.getPath('userData')/katago/`를 사용합니다. 다음 파일은 Git에 넣지 않습니다.

```text
katago/
  downloads/                  SHA-256별 다운로드 캐시
  models/                     검증된 .bin.gz / .txt.gz 모델
  darwin-arm64-<revision>/     또는 win32-x64-<revision>
    bin/                      실행 파일과 Windows DLL
    lib/                      macOS 동적 라이브러리
    licenses/                 아카이브의 원본 라이선스
    installed.json            설치 파일 해시
  connection.json             선택한 엔진 연결(비밀 정보 없음)
  models.json                 모델 목록과 선택
```

서버가 먼저 수신을 시작하고 설치·다운로드·초기화는 백그라운드에서 진행해 UI는 GPU를 기다리지 않습니다. 소스 및 필요한 자원이 없는 패키지는 첫 실행에 네트워크와 수백 MB 다운로드 공간, 추가 압축 해제·모델 캐시 공간이 필요합니다. 실제 분석 성공을 ready 조건으로 삼습니다. 다운로드·플랫폼 오류에도 바둑판은 사용할 수 있습니다.

Windows OpenCL은 첫 실행에 주 모델과 HumanSL을 각각 튜닝하며 몇 분 걸릴 수 있습니다. 캐시 후에는 빨라지고 상태에 튜닝·캐시 읽기·첫 분석 검증을 표시합니다. 초기화 기본 시간은 최소 10분이며 분석 제한보다 짧지 않습니다. `KATAGO_STARTUP_TIMEOUT_MS`로 변경합니다. 일반 분석은 `KATAGO_TIMEOUT_MS`(기본 3분)를 사용합니다. 초기화는 취소할 수 있고 시간 초과에는 엔진 마지막 진단을 붙여 튜닝 지연과 드라이버 오류를 구분합니다.

### Windows CUDA

**바둑 모델 → 계산 백엔드**에서 OpenCL / CUDA(NVIDIA)를 선택합니다. 기존 설치는 기본 OpenCL을 유지합니다. CUDA 12.8 지원 NVIDIA GPU·드라이버가 필요하며 첫 선택 시 공식 KataGo·NVIDIA에서 KataGo 1.18.2, CUDA Runtime 12.8.90, NVRTC 12.8.93, cuBLAS 12.8.4.1, cuDNN 9.8.0.87을 압축 기준 약 1.45 GiB 받습니다. 전역 CUDA Toolkit은 필요 없으며 DLL은 백엔드 전용 `bin`에 두고 시스템 PATH는 바꾸지 않습니다.

버전·SHA-256은 `config/katago/windows-cuda.json`에 고정합니다. NVIDIA 해시 출처는 [CUDA 12.8.1 redistrib](https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.8.1.json), [cuDNN 9.8.0 redistrib](https://developer.download.nvidia.com/compute/cudnn/redist/redistrib_9.8.0.json)입니다. 백엔드 폴더는 독립적이고 모델은 공유합니다. 전환은 기존 프로세스를 종료하고 선택을 저장하며 실패하면 OpenCL로 돌아갈 수 있습니다. 일반판에는 OpenCL을 계속 포함하고 CUDA는 첫 선택 때만 받아 캐시를 재사용합니다.

성능 확인: `node --import tsx scripts/benchmark-backends.ts <cache-directory> [rounds]`. 실제 선택된 주 모델·HumanSL과 앱 설정으로 두 백엔드를 번갈아 실행해 설치 확인, 초기화, 19줄 두 국면의 400/4000 visits 시간을 보고합니다. 출력은 터미널로 보내고 측정 기록은 저장소 밖에 둡니다. 다른 GPU 부하를 피하고 시작 시간과 탐색 처리량은 별도 지표로 봅니다.

<a id="custom-paths"></a>

## 사용자 엔진 경로

기존 설치는 `KATAGO_MODEL`로 경로 덮어쓰기를 활성화합니다. CUDA/TensorRT도 지원하며 Windows 경로에는 `/`를 사용합니다.

```dotenv
KATAGO_PATH=/absolute/path/to/katago
KATAGO_MODEL=/absolute/path/to/main-model.bin.gz
KATAGO_CONFIG=./config/katago/analysis.cfg
KATAGO_HUMAN_MODEL=/absolute/path/to/b18c384nbt-humanv0.bin.gz
KATAGO_TIMEOUT_MS=180000
```

앱은 `reportAnalysisWinratesAs=BLACK`을 강제해 모든 분석을 흑 기준으로 처리합니다. `.env` 위치는 [환경 설정](development.md#environment)을 참고하세요.

## 모델 목록과 선택

**바둑 모델**에서 엔진 시작·중지·외부 연결도 관리하고 코치 인증은 **LLM 연결**에 둡니다. 추천·다운로드됨·전체 필터, 이름·구조 검색, 크기·지원 판·출처·SHA-256 확인, 대기열 다운로드·진행·취소·재시도, 선택하지 않은 모델 삭제를 지원합니다. 네트워크 중단의 partial 파일은 재개하고 명시적 취소는 현재 partial을 지웁니다.

추천은 [`config/katago/models.json`](../../config/katago/models.json)과 artifacts에 고정합니다. 경량 B10은 과거 소형망, 균형 B18은 원래 기본망, 고급 Transformer는 공식 tf3입니다. 단계는 자원·용도 설명이며 앱이 측정한 급단·Elo·속도가 아닙니다. OpenCL에서 Transformer는 느릴 수 있습니다. B10 해시는 공식 v1.3 모델에서 계산하고 Transformer/B18 크기·해시는 공식 훈련 API에서 얻었습니다. HumanSL은 선택적 보조 모델이며 주 분석 모델로 선택할 수 없습니다.

**최신 공식 모델 가져오기**는 `katagotraining.org/api/networks/`의 해시·URL·기본 정보를 보관하고 이전 페이지도 읽습니다. 갱신 실패에도 저장 목록과 로컬 모델을 쓸 수 있습니다. **다른 모델 추가**는 공식 훈련·과거 모델 사이트와 KataGo GitHub Release의 HTTPS `.bin.gz` / `.txt.gz`만 받으며 SHA-256·용도·지원 판이 필수입니다. 임의 내부 주소나 실행 파일은 허용하지 않습니다.

`katago/models.json`은 목록·선택, `katago/models/<sha256>.bin.gz` 또는 `.txt.gz`는 검증 파일을 저장합니다. 확장자는 KataGo 형식 판별을 위해 유지합니다. 기존 기본 모델을 인식하고 앱 업데이트는 선택을 초기화하지 않습니다. 다운로드만으로 전환하지 않습니다. 전환 시 엔진을 종료하고 새 모델로 실제 초기 분석을 성공한 뒤에만 저장합니다. 실패·취소는 원래 선택을 보존하고 **엔진 시작**으로 복구합니다. 선택·검증 중 모델은 삭제할 수 없습니다. `.env` `KATAGO_MODEL` 사용 중에도 다운로드·관리는 가능하지만 사용자 구성을 덮어쓰지 않도록 관리형 선택을 막습니다.

API: `GET /api/models`는 목록·캐시·현재·대기 선택을 반환합니다. `POST /api/models/download|cancel|delete`는 `{id}`, `select`는 `{main, human}`(`human`은 `null` 가능), `refresh`는 `{page}`, `add`는 `{name, url, sha256, role, boards}`를 받습니다. 쓰기는 엔진 관리와 동일 출처 JSON 보호를 사용합니다.

다운로드는 HTTPS, 고정 SHA-256, 임시 파일, 최종 검증·이름 변경을 사용합니다. 네트워크 오류는 최대 3회 재시도하며 HTTP Range 재개를 지원하고 서버가 무시하면 처음부터 씁니다. 미검증 파일은 실행하지 않습니다. 수동 중지는 미완료 파일을 삭제하며 통신 단절은 다음 재개를 위해 남깁니다. 손상 시 검증된 패키지 자원으로 먼저 복구하고 없으면 다시 받습니다. 오류에는 자원명·호스트·가능한 하위 네트워크 코드를 표시합니다. 설치 잠금이 동시 압축 해제를 막으며 오래된 잠금은 복구 가능합니다.

## 버전과 출처

자원 변경 시 manifest의 revision도 바꾸고 시작 테스트를 수행합니다.

- [`artifacts.json`](../../config/katago/artifacts.json): 주 모델, HumanSL, Windows 패키지.
- [`macos-bottles.json`](../../config/katago/macos-bottles.json): Metal 1.18.2와 libzip/xz/zstd/lz4/abseil/protobuf의 고정 ARM64 Sequoia Homebrew bottles. macOS 15 이상, Homebrew 설치 불필요. 라이브러리는 자식의 `DYLD_LIBRARY_PATH`에만 추가합니다.
- Windows는 공식 [OpenCL 1.18.1](https://github.com/lightvector/KataGo/releases/tag/v1.18.1) 또는 [CUDA 1.18.2](https://github.com/lightvector/KataGo/releases/tag/v1.18.2)의 실행 파일·DLL을 유지합니다. TensorRT는 사용자 `.env` 경로로 사용합니다.
- 주 모델 `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz`는 [공식 훈련 사이트](https://katagotraining.org/networks/)에서 오며 해시는 [Homebrew](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/k/katago.rb)와 같습니다.
- HumanSL `b18c384nbt-humanv0.bin.gz`는 [KataGo 1.15.0](https://github.com/lightvector/KataGo/releases/tag/v1.15.0) 공식 HTTPS 자산에서 해시를 계산했습니다. [인간 모델 설명](https://katagotraining.org/extra_networks/)도 참고하세요.
- Homebrew URL에도 전체 blob SHA-256이 있으며 Windows는 GitHub release asset digest와 대조합니다.

KataGo는 [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE), 의존 파일은 각 라이선스를 따릅니다. LICENSE/COPYING/COPYRIGHT/NOTICE를 보존하며 타사 바이너리·가중치를 저장소에 커밋하지 않습니다. 일반판은 두 공식 모델과 [라이선스](../../config/katago/MODEL-LICENSE.txt)를 포함해 시작 시 검증 후 사용자 캐시에 복사합니다. 플랫폼 엔진·의존 아카이브도 포함하며 검증 캐시나 `GO_TRAINER_BUNDLED_RUNTIME` 자원을 우선하고 누락·손상 시만 받습니다. 양쪽 일반판은 오프라인 준비 가능하지만 Windows는 OpenCL 드라이버가 필요합니다. minimal은 처음에 모든 자원을 받습니다. [배포](releases.md)를 참고하세요.

## 탐색 제한과 통계

**AI 자동 착수**는 횟수(50–1,000,000 visits) 또는 시간(0.1–120초)을 로컬에 저장합니다. `Training.searchLimit` 기본은 `visits`, `maxTime`은 5초입니다. 시간 모드는 `overrideSettings.maxTime`을 설정하고 visits 상한을 높여 당시 분석·착수를 정상 반환합니다. 무응답 프로세스용 전송 시간 제한은 별개입니다. 배경 그래프는 최대 100 visits, 코치는 자체 예산을 따릅니다.

`Analysis.searchStats`의 `elapsedMs`·`visitsPerSecond`는 실제 `rootInfo.visits`를 요청 송신부터 결과까지의 단조 시계 시간으로 나눈 값입니다. 대기·전송을 포함한 평균이며 GPU 이론 처리량이 아닙니다. 중간·최종 결과 모두 통계와 흑 관점을 유지합니다. 알림은 실시간 통계, 펼친 분석 패널은 분석 진행률 옆 통계를 표시하고 후보 공간을 확보합니다. 외부 엔진에 시간 정보가 없으면 횟수만 표시합니다.

`POST /api/bot-move`는 JSON과 `Accept: application/x-ndjson`을 지원하며 후자는 중간 `analysis`와 `move`·`method`·`analysis`가 있는 최종 `done`을 보냅니다. 연결 종료는 검색을 취소합니다.

## 제어와 프로세스 종료

**설정 → 바둑 모델**에서 시작·중지·재시작·외부 HTTP AI 연결을 합니다. 수동 중지는 명시적 시작 또는 앱 재시작까지 유지됩니다. 전환은 기존 프로세스를 먼저 해제합니다. 외부 서비스 자체의 실행·종료는 사용자가 관리합니다.

`GET /api/status`의 `engine`은 `phase`, `ready`, `running`, `pid`, `backend`, `progress`, `error`를 포함합니다. phase는 idle/downloading/installing/starting/ready/stopping/stopped/error입니다. 동일 출처 요청에 `Content-Type: application/json`, `X-Go-Trainer: 1`을 넣습니다.

| API                          | 본문           | 동작                                                         |
| ---------------------------- | -------------- | ------------------------------------------------------------ |
| `POST /api/engine/start`     | `{}`           | 중지·오류 상태에서 시작                                      |
| `POST /api/engine/stop`      | `{}`           | 다운로드·요청 취소 후 소유 프로세스 종료 대기                |
| `POST /api/engine/restart`   | `{}`           | 완전히 종료 후 설치 확인·초기화                              |
| `GET /api/engine/connection` | —              | 현재 선택 반환                                               |
| `POST /api/engine/connect`   | 아래 연결 객체 | 선택 저장·기존 종료·배경 초기화, 같은 연결은 재시작하지 않음 |

KataGo는 `spawn`, `shell:false`, `detached:false`, 앱 소유 stdin을 사용합니다. 정상 종료는 입력 종료와 SIGTERM, 최대 2초 뒤 SIGKILL 후 `close` 대기입니다. 동기 종료 훅도 자식을 종료합니다. stdin EOF로 KataGo가 끝나는 것은 부모 강제 종료에 대한 보완이며 OS Job Object 보장은 아닙니다.

마지막 데스크톱 창을 닫으면 macOS에서도 앱이 종료됩니다. Web은 `Ctrl+C`가 필요하며 탭 닫기는 서버 종료가 아닙니다. 외부 HTTP의 중지는 이 앱 연결만 끊고 외부 프로세스를 제어하지 않습니다.

<a id="adapters"></a>

## 외부 바둑 AI 계약

내장은 `{"mode":"managed"}`, 외부 예시는 다음과 같습니다.

```json
{ "mode": "external", "name": "내 바둑 AI", "url": "http://127.0.0.1:9000/analyze" }
```

HTTPS 또는 loopback HTTP를 사용합니다. URL 인증·쿼리·리디렉션·UI API 키는 미지원입니다. GTP는 이 계약의 HTTP 브리지를 직접 제공해야 하며 TCP/GTP 포트를 그대로 넣을 수 없습니다.

전체 URL로 [`shared/types.ts`](../../shared/types.ts)의 `{game, training}`을 POST합니다. game에는 크기·규칙·덤·초기 돌·전체 수순이 들어갑니다. 연결 검증은 빈 19줄 판과 50 visits를 보냅니다. JSON / `application/x-ndjson`을 지원합니다.

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

승률·집 차이·영역은 현재 차례가 아닌 **흑 관점**이어야 합니다. `turnNumber`는 제출 수순 길이와 같아야 합니다. 선택적 `ownership`은 왼쪽 위부터 행 우선 size² 값(+1 흑 / −1 백)입니다. `policy` / `humanPolicy`도 KataGo 행 우선 좌표이며 마지막이 pass입니다. 범위는 서버 schema로 검증합니다. HumanSL이 없으면 후보 기반 샘플링으로 돌아가며 다른 엔진 출력을 KataGo 근거라고 하지 않습니다.

```json
{"type":"analysis","phase":"after","final":false,"analysis":{}}
{"type":"done","analysis":{}}
```

NDJSON은 한 줄에 객체 하나를 보냅니다. `{}`는 완전하고 유효한 분석 객체로 바꾸세요. 최종 `done`은 필수이고 끊김·`error`는 실패입니다. 클라이언트가 끊으면 상위 계산을 취소해야 합니다. GPU 사용·기력·수치 비교 가능성은 어댑터에 달려 있습니다.
