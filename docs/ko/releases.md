# 데스크톱 배포

[English](../en/releases.md) · [简体中文](../releases.md) · [繁體中文](../zh-TW/releases.md) · [日本語](../ja/releases.md) · [한국어](releases.md)

`v*` 태그를 push하면 GitHub Actions가 Windows 10/11 x64와 macOS 15+ Apple Silicon의 일반판·minimal, 총 4개 설치 파일을 빌드·공개합니다. 32비트, Windows 7/8, Intel Mac 빌드는 없습니다. macOS 인증 정보가 모두 있으면 Developer ID 서명·Apple 공증을 하며 아니면 미서명·미공증입니다. Windows 코드 서명은 미설정입니다.

## 배포 절차

1. `package.json`과 `package-lock.json` 버전을 갱신합니다(예: `npm version 0.1.1 --no-git-tag-version`). 필요하면 모든 언어의 변경 기록도 갱신합니다.
2. 로컬 커밋과 깨끗한 작업 트리를 준비합니다. 정확한 커밋·변경, 대상 remote/branch, 검증 결과를 사용자에게 제시하고 이번 push를 명시적으로 승인받은 뒤에만 보냅니다.
3. 태그도 사전 검토가 필요합니다. 정확한 버전/tag, 대상 commit/remote, 릴리스 노트, 검증 결과를 제시하고 명시 승인 후 package.json과 같은 태그를 생성·push합니다. 승인은 검토한 변경·대상에만 적용되며 추가 변경이나 원격 태그 교체에는 재승인이 필요합니다. 버전 선택이나 배포 기능 구현 요청은 push 승인이 아닙니다.

아래 예시는 해당 브랜치·태그 push를 각각 승인받은 뒤에만 실행합니다.

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0
```

Actions의 `release`에서 진행을 확인합니다. `windows-2022` x64와 `macos-15` ARM64에서 테스트, TypeScript/Vite/서버 빌드, electron-builder, 가중치·엔진·의존 아카이브 검증을 수행합니다. 일반판은 고정 manifest에서 자원을 받아 SHA-256 검증 후 포함합니다. 손상 모델 캐시는 다시 받고 모델·바이너리는 Git에 넣지 않습니다.

4개 빌드가 모두 성공하면 게시 job이 설치 파일 4개, macOS 업데이트 ZIP 2개, 별도 manifest 4개의 버전·파일명·크기·SHA-512를 검사합니다. `SHA256SUMS.txt`를 만들고 모든 자산을 draft Release에 올린 뒤 공개합니다. 이 job만 `contents: write`와 저장소 기본 `GITHUB_TOKEN`을 사용하며 개인 token은 필요 없습니다. 실패는 재실행할 수 있고 비공개 draft는 이어 올릴 수 있지만 공개판은 덮어쓰지 않고 새 버전을 냅니다. `0.2.0-beta.1`처럼 `-`가 있으면 prerelease입니다.

수동 Actions에서 브랜치는 artifacts만 만들고 버전 태그는 공개를 시도합니다. 먼저 공개 Release를 수동으로 만들지 마세요.

<a id="local-build"></a>

## 로컬 빌드

대상 시스템에 Node.js 24를 설치하고 실행합니다.

```sh
npm ci
npm run package:desktop
npm run package:desktop -- minimal
```

인수 없으면 일반판이며 `-- standard`도 가능합니다. `-- minimal`은 minimal입니다. 출력은 `release/standard/` / `release/minimal/`이고 minimal에만 `-minimal` 접미사가 있습니다. macOS는 Apple Silicon에서 arm64 DMG·업데이트 ZIP, Windows는 x64 NSIS EXE를 만듭니다. 두 판은 app ID·userData를 공유해 서로 덮어 업데이트할 수 있습니다.

`public/logo.svg`에서 Windows 다중 해상도 ICO, macOS ICNS, 창 PNG를 생성해 무시 대상 `.local/icons/`에 둡니다. 로고 변경 후 재빌드합니다.

일반판의 `Resources/katago-models/`에는 주 모델·HumanSL·출처 해시·상위 라이선스가 들어갑니다. 시작 시 검증된 사용자 캐시, 패키지 복사 순으로 우선하고 누락·손상 때만 받습니다. `katago-runtime/`에는 SHA-256 고정 Windows OpenCL ZIP(DLL 포함) 또는 macOS Metal·전체 의존 bottles와 고지문을 둡니다. 첫 실행도 오프라인 설치하며 Windows는 GPU OpenCL 드라이버가 필요하고 macOS는 Homebrew가 필요 없습니다. minimal은 이 자원을 포함하지 않으며 자동 다운로드하지 않습니다. 오른쪽 위 안내에 따라 왼쪽 위 **설정 → 바둑 모델**에서 **KataGo 다운로드 및 활성화**를 누르세요.

CI는 자원 내용을 검사하지만 대상 GPU 드라이버가 없어 실제 Windows OpenCL·macOS Metal 및 설치 검증을 대체하지 못합니다. 공개 전후 대상 OS에서 설치·실행·분석·종료를 확인하세요.

참고: [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [electron-builder v26](https://www.electron.build/v26/docs/configuration/), [모델 라이선스](https://katagotraining.org/network_license/).

<a id="updates"></a>

## 자동 업데이트와 macOS 서명

일반판은 `latest.yml` / `latest-mac.yml`, minimal은 `minimal.yml` / `minimal-mac.yml`로 시작합니다. 매 확인 때 userData에 SHA-256 검증 모델이 하나 이상 있으면 일반판도 minimal 채널로 전환해 엔진·모델 아카이브 없는 앱 설치 파일을 받습니다. 공통 app ID/userData로 선택·목록·엔진·튜닝 캐시를 보존하며 앱 버전마다 모델을 다시 받지 않습니다. 향후 엔진 revision이 바뀌면 부족한 엔진 자원만 설치하고 같은 해시의 모델을 재사용합니다. 유효 모델이 전혀 없으면 일반판을 유지합니다. 일부만 캐시되어도 minimal을 쓰고 선택한 모델이나 엔진이 불완전하면 설정에서 수동으로 설치하도록 안내합니다.

manifest는 electron-builder가 생성하고 macOS는 ZIP, Windows는 NSIS EXE로 업데이트합니다. 안정 Release만 확인하며 해시와 이번에 선택한 판·플랫폼을 엄격히 검증합니다. minimal manifest가 없거나 일반판 파일을 가리키면 오류를 내며 큰 일반판으로 조용히 돌아가지 않습니다. 판 간 업데이트는 차등 blockmap을 끄고 **minimal 앱 설치 파일 전체**를 받으며 모델 재다운로드가 아닙니다. 설치 후 판 표시는 minimal입니다. 설정은 `userData/updates.json`에 저장하고 자동 업데이트는 기본 꺼짐이며 다운로드 후 사용자가 **다시 시작하고 설치**를 누릅니다. 구버전은 먼저 이 로직이 있는 버전으로 올려야 이후 모델 없는 업데이트를 선택할 수 있습니다.

macOS 서명·공증을 켜려면 **Settings → Secrets and variables → Actions**에 다음 5개를 모두 설정합니다.

| Secret                       | 내용                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `MACOS_CERTIFICATE`          | Developer ID Application 인증서·개인키를 내보낸 `.p12`의 Base64 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` 내보내기 암호                                            |
| `APPLE_API_KEY_P8`           | 공증용 App Store Connect API `.p8` 개인키                       |
| `APPLE_API_KEY_ID`           | 해당 Key ID                                                     |
| `APPLE_API_ISSUER`           | 해당 Issuer ID                                                  |

Apple Developer 계정에서 만들고 후속 배포도 같은 서명 신원을 유지합니다. 인증서·개인키·암호는 커밋하거나 앱 설정에 넣지 않습니다. CI는 부족한 항목 이름만 기록하고 신원 자동 검색을 끄며 서명·공증·ticket 검사를 생략해 미서명으로 배포합니다. 모두 있으면 runner 임시 경로에만 비밀을 쓰고 인증서 가져오기, Hardened Runtime, 서명·공증, 서명·ticket 검증, 정리를 수행합니다. 활성화된 서명·공증·검증 실패는 공개를 막으며 미서명으로 돌아가거나 불완전한 Release를 공개하지 않습니다.

로컬 `npm run package:desktop`은 기본 미서명·미공증 macOS 패키지입니다. 업데이트 확인·Release 열기는 가능하지만 자동 설치는 불가하며 첫 실행이 macOS에 차단될 수 있습니다. 서명하려면 electron-builder 인증 정보와 `GO_TRAINER_REQUIRE_SIGNING=1`을 설정합니다. 완전한 검증은 서명된 설치판에서 상위 버전으로 업데이트해 두 판 모두 데이터 유지·종료·재시작을 확인해야 합니다.

[Electron macOS 업데이트 서명 요건](https://www.electronjs.org/docs/latest/api/auto-updater#macos)을 참고하세요.
