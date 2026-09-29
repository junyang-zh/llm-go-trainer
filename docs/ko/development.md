# 개발 안내

[English](../en/development.md) · [简体中文](../development.md) · [繁體中文](../zh-TW/development.md) · [日本語](../ja/development.md) · [한국어](development.md)

[README](../../README.ko.md) · [구조](architecture.md) · [빌드와 배포](releases.md)

## Electron 실행

Node.js 22.12 이상(24 LTS 권장)과 npm이 필요합니다. macOS와 Windows PowerShell에서 실행할 수 있습니다.

```sh
git clone git@github.com:junyang-zh/llm-go-trainer.git
cd llm-go-trainer
npm ci
npm run desktop
```

일상 실행과 UI 테스트의 기본 진입점입니다. 빌드 후 Electron을 열고 로컬 서버와 KataGo를 시작합니다. 창을 닫으면 둘 다 종료합니다. 코드 변경 후에는 이전 창을 닫고 다시 실행하세요. 이 명령은 핫 리로드를 제공하지 않습니다.

[첫 실행](usage.md#installation), [엔진](engines.md), [LLM](llm.md)도 참고하세요.

## 브라우저 디버깅

핫 리로드나 보조 브라우저 디버깅에는 Web 모드를 사용합니다.

| 목적           | 명령                           | 주소                    |
| -------------- | ------------------------------ | ----------------------- |
| 개발·핫 리로드 | `npm run dev`                  | <http://127.0.0.1:5173> |
| 빌드한 Web 앱  | `npm run build` 후 `npm start` | <http://127.0.0.1:3001> |

종료는 터미널에서 `Ctrl+C`를 누릅니다. 탭만 닫으면 서버와 KataGo는 계속 실행됩니다.

<a id="environment"></a>

## 환경 설정

소스 실행에서는 [`.env.example`](../../.env.example)을 저장소 루트의 `.env`로 복사해 기본값을 설정합니다. 변경 후 재시작하며 `npm run doctor`로 환경을 진단할 수 있습니다. 앱에 저장한 LLM 설정이 환경 기본값보다 우선합니다. [LLM 설정](llm.md)을 참고하세요.

설치판은 Electron userData의 `.env`를 읽습니다. 보통 macOS는 `~/Library/Application Support/llm-go-trainer/.env`, Windows는 `%APPDATA%/llm-go-trainer/.env`입니다. 앱 이름이 바뀌면 `app.getPath('userData')`가 기준입니다. 엔진·모델 사용자 경로는 절대 경로로 지정합니다. [사용자 경로](engines.md#custom-paths), [엔진 캐시](engines.md#installation), [기록 저장](architecture.md#history)을 참고하세요.

`.env`, 인증 정보, 엔진 바이너리, 모델, 비공개 SGF, 실행 로그는 커밋하지 않습니다.

## 테스트와 검증

로직 변경을 마치기 전에 실행합니다.

```sh
npm test
npm run build
```

**UI와 E2E는 Electron을 우선합니다.**

```sh
npm run desktop
npm run test:coach-layout
npm run test:i18n-layout
```

바둑판 크기, 설정, SGF, 스트리밍, 엔진 제어, 창 종료 후 프로세스 정리를 확인합니다. 브라우저 검증은 보조이며 데스크톱 검증을 대체하지 않습니다.

`test:coach-layout`은 독립 임시 저장소에서 여러 창 크기의 좌표 강조, 거리별 밝기, 양방향 호버·키보드 연결, 스크롤 잘림, 그룹·분기·접기 복원을 검사합니다. `test:i18n-layout`은 5개 언어와 여러 크기에서 설정·모델 알림, 검색 시작·완료·오류·재시도 시 공간 확보, 제목 정렬, 넘침을 검사합니다.

자동 테스트는 규칙, SGF, 상대 수 샘플링, 흑백 시점, 엔진 수명, LLM 프로토콜, UI를 다룹니다. 로컬 fixture와 loopback 연결이 필요하지만 실제 LLM 키는 필요 없습니다. 모의 평가는 `tests/fixtures/`에만 두고 앱의 대체 결과로 사용하지 않습니다. CI는 Ubuntu·macOS·Windows에서 테스트와 빌드를 수행합니다. 결과·하드웨어·공급자·미검증 항목은 대화에서 보고하고 세션 보고서와 로그는 저장소 밖에 둡니다.

## 국제화 유지보수

`src/i18n.ts`가 시스템 언어, 선택 저장, 메시지 보간을 처리합니다. `src/locales/{en,zh-CN,zh-TW,ja,ko}.json`의 키와 매개변수는 동일해야 합니다. UI는 `t(...)`를 사용합니다. 서비스 진단은 원문으로 저장하고 렌더링할 때 `localizeDiagnostic(...)`으로 번역해 기존 알림도 언어 변경을 따르게 합니다. 사용자 이름·알 수 없는 진단은 유지하며 중국어 코치 프롬프트나 답변을 자동 번역하지 않습니다.

중국어 간체 README/docs는 원래 경로, 다른 언어는 `README.<locale>.md`와 `docs/<locale>/`를 사용합니다. 각 페이지는 같은 문서의 5개 언어로 연결됩니다. 수정할 때 모든 언어를 갱신하고 명령·설정명·기술 제약을 유지하며 상대 링크를 검사하세요. `tests/i18n.test.tsx`는 언어 판별, 키·인수 일치, 상태를 유지하는 실시간 전환을 확인합니다.

<a id="local-build"></a>

## 데스크톱 패키징

명령, 플랫폼 요건, 출력 경로, 설치 검증과 배포 절차는 [빌드와 배포](releases.md#local-build)에 있습니다.

## 디렉터리

```text
src/          Web UI, SVG 바둑판, 번역 목록
shared/       순수 TypeScript 규칙, SGF, 훈련 정책
server/       로컬 API, KataGo, LLM, 근거 데이터
desktop/      Electron 셸
config/       KataGo 분석 설정
prompts/      실행 코치 프롬프트
skills/       재사용 가능한 바둑 코치 스킬
docs/         사용·설정·개발·배포 문서
tests/        규칙·통합 테스트(실제 모델 불필요)
```

모듈 책임과 데이터 흐름은 [구조](architecture.md)를 참고하세요.
