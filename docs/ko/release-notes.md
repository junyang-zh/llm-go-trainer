# 변경 기록

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.4/docs/ko/release-notes.md)

## v0.1.4

- 영어, 중국어 간체·번체, 일본어, 한국어 UI를 추가했습니다. 기본은 시스템 언어이며 일반 설정에서 선택을 저장합니다. 알림, 모델 패널, 이미 표시된 상태도 함께 바뀝니다.
- 집 차이 / 승률 패널의 탐색 전후 높이 변화를 수정했습니다. 후보 변화 공간을 확보하고 현재 승률은 제목 옆에 표시하며 접으면 숨깁니다. 탐색 수와 수/초는 분석 진행률 옆에 배치했습니다.
- 대화형 해설을 강화했습니다. 좌표 강조·바둑판 연결, 그룹별 변화 선택기, 코치의 시험 분기 생성·편집을 지원하며 실전 기보를 바꾸지 않고 대화와 함께 저장합니다.
- 한 회 시간, 도구 호출 수, 누적 탐색량 제한을 추가했습니다. 한도에 도달하면 결과를 보존해 계속할 수 있고 기본값은 모두 무제한입니다.
- Codex / Claude Code 코치는 필요에 따라 웹 자료를 찾아 출처를 제시합니다. 현재 국면의 전술·수치는 바둑판·엔진 근거를 사용합니다. DeepSeek는 현재 웹 검색을 제공하지 않습니다.
- README와 사용·엔진·LLM·개발·배포·구조 문서를 5개 언어로 제공하고 CI·최신 Release 배지를 추가했습니다.

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
