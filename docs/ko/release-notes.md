# 변경 기록

[English](../en/release-notes.md) · [简体中文](../release-notes.md) · [繁體中文](../zh-TW/release-notes.md) · [日本語](../ja/release-notes.md) · [한국어](release-notes.md)

## v0.1.3

- 바둑 모델 관리: 추천 단계, 공식 목록, 사용자 모델, 다운로드 진행·취소, 전환·삭제.
- Windows CUDA 백엔드와 OpenCL 전환·선택 저장. CUDA는 미포함이며 첫 선택 시 약 1.45 GiB의 검증된 의존 파일을 받아 기존 모델을 재사용합니다.
- 알림에 실시간 탐색 수·평균 수/초를 표시합니다. 횟수·시간 탐색 제한은 자동 저장됩니다.
- 모델 캐시가 있으면 모델 없는 minimal 업데이트로 모델·백엔드·튜닝 캐시를 재사용합니다. 이전 버전은 먼저 이 버전으로 업데이트해야 다음부터 이 정책을 쓸 수 있습니다.
- Windows 첫 OpenCL 튜닝 중 상태·시간 초과를 수정하고 메뉴 모음을 숨겼습니다.
- 설정을 일반, 바둑 모델, AI 자동 착수, LLM 연결로 정리했습니다.

환경에 맞는 설치 파일 하나를 선택하세요.

| 파일명 끝부분             | 환경                      | 포함 모델           |
| ------------------------- | ------------------------- | ------------------- |
| `windows-x64.exe`         | Windows 10/11 x64         | 주 모델 + HumanSL   |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 첫 실행 시 다운로드 |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 주 모델 + HumanSL   |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 첫 실행 시 다운로드 |

두 판의 기능은 같습니다. Windows 일반판은 KataGo OpenCL과 DLL을 포함하지만 GPU의 OpenCL 드라이버는 필요합니다. macOS 일반판은 Metal·라이브러리를 포함해 엔진·모델 다운로드나 Homebrew가 필요 없습니다. 양쪽 minimal은 엔진·의존 파일·모델을 첫 실행 때 받습니다. 실패 시 자원·호스트·가능한 네트워크 오류 코드를 표시합니다. LLM 인증 정보는 포함하지 않으며 설정에서 연결합니다.

macOS는 앱을 Applications로 이동합니다. 배포 인증 정보가 완전하면 Developer ID 서명·Apple 공증을 하고, 아니면 미서명·미공증이며 첫 실행이 차단될 수 있습니다. Windows는 `.exe`를 실행하며 코드 서명이 없어 알 수 없는 게시자 안내가 나올 수 있습니다.

**설정 → 일반**에서 Release 확인·자동 업데이트를 설정합니다. 검증된 모델이 있으면 minimal, 모델 없는 일반판은 일반판으로 업데이트합니다. Windows와 Developer ID 서명 macOS 설치판은 다운로드 후 **다시 시작하고 설치**를 사용합니다. 미서명 macOS는 Release 페이지에서 수동 설치합니다.

`.zip` / `.yml`은 자동 업데이트용입니다. 첫 설치는 `.dmg` / `.exe`를 선택하세요. `SHA256SUMS.txt`는 설치·업데이트 파일의 SHA-256 목록입니다. Source code는 설치 파일이 아닙니다.
