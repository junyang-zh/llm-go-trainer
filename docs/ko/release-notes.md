# 변경 기록

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.6/docs/ko/release-notes.md)

## v0.1.6

- SGF를 가져올 때 전체 변화 트리, 주석과 바둑판 표시를 보존하며 여러 기보가 담긴 SGF 모음도 지원합니다. 파일 하나를 로컬 기보 항목 하나로 표시하여 자신의 정석 모음을 탐색할 수 있습니다.
- 수순 선택, 상위 노드로 이동, 변화 전환 및 선택한 국면을 메인 바둑판에 불러오기를 지원합니다. 돌 배치·제거와 다음 차례 지정 노드도 탐색할 수 있습니다. 시험 수순은 관련 기보로 저장하고 원본 SGF 전체를 보존하여 내보낼 수 있습니다.
- SGF 가져오기의 파일 크기, 노드 수와 중첩 깊이 제한을 제거했습니다. 규칙이 지정되지 않거나 지원되지 않으면 기존처럼 중국 규칙을 적용하며 해당 가져오기 경고는 표시하지 않습니다.
- 수순 경로와 변화 선택 버튼에 얇은 테두리와 은은한 배경을 추가하여 탐색 및 바둑판 불러오기 버튼과 구분했습니다.
- Codex / Claude 설정에 CLI 경로와 선택적 Node 경로를 추가했습니다. 네이티브 실행 파일과 Node 스크립트를 지원하며 데스크톱에서 실행할 때 CLI 검색과 감지를 개선했습니다.

환경에 맞는 설치 파일 하나를 선택하세요.

| 파일명 끝부분             | 환경                      | 포함 모델          |
| ------------------------- | ------------------------- | ------------------ |
| `windows-x64.exe`         | Windows 10/11 x64         | 주 모델 + HumanSL  |
| `windows-x64-minimal.exe` | Windows 10/11 x64         | 설정에서 수동 설치 |
| `mac-arm64.dmg`           | macOS 15+ / Apple Silicon | 주 모델 + HumanSL  |
| `mac-arm64-minimal.dmg`   | macOS 15+ / Apple Silicon | 설정에서 수동 설치 |

두 판의 기능은 같습니다. Windows 일반판은 KataGo OpenCL과 DLL을 포함하지만 GPU의 OpenCL 드라이버는 필요합니다. macOS 일반판은 Metal·라이브러리를 포함해 엔진·모델 다운로드나 Homebrew가 필요 없습니다. 양쪽 minimal은 설정의 바둑 모델 화면에서 엔진·의존 파일·모델을 수동으로 다운로드하고 활성화합니다. 실패 시 자원·호스트·가능한 네트워크 오류 코드를 표시합니다. LLM 인증 정보는 포함하지 않으며 설정에서 연결합니다.

macOS는 앱을 Applications로 이동합니다. 배포 인증 정보가 완전하면 Developer ID 서명·Apple 공증을 하고, 아니면 미서명·미공증이며 첫 실행이 차단될 수 있습니다. Windows는 `.exe`를 실행하며 코드 서명이 없어 알 수 없는 게시자 안내가 나올 수 있습니다.

**설정 → 일반**에서 Release 확인·자동 업데이트를 설정합니다. 검증된 모델이 있으면 minimal, 모델 없는 일반판은 일반판으로 업데이트합니다. Windows와 Developer ID 서명 macOS 설치판은 다운로드 후 **다시 시작하고 설치**를 사용합니다. 미서명 macOS는 Release 페이지에서 수동 설치합니다.

`.zip` / `.yml`은 자동 업데이트용입니다. 첫 설치는 `.dmg` / `.exe`를 선택하세요. `SHA256SUMS.txt`는 설치·업데이트 파일의 SHA-256 목록입니다. Source code는 설치 파일이 아닙니다.
