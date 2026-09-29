# 변경 기록

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.5/docs/ko/release-notes.md)

## v0.1.5

- Agent가 기보 불러오기, 현재 국면이나 시험 분기 저장, 기보 이름 변경을 지원합니다. 바둑판과 기보 보관함을 동기화하며 시험 분기는 원본을 보존한 관련 기보로 저장합니다. 일시 중지 후 계속할 때도 변경된 기보 문맥을 유지합니다.
- 긴 해설 중 “CLI 출력이 제한을 초과했습니다” 오류가 발생하던 문제를 수정했습니다. Codex / Claude CLI의 누적 출력, Codex 답변 파일, 프런트엔드의 로컬 메시지에 대한 고정 길이 제한을 제거하여 도구 결과가 숨겨진 총량 제한에 걸리지 않도록 했습니다.
- 기보 보관함에 검색, 페이지 이동, 이름 변경, 출처 정보와 관련 분기 그룹을 추가했습니다. 일반판에는 전체 CWI 기보 아카이브를 포함하며 minimal판은 기보 다운로드 화면에서 필요할 때 설치할 수 있습니다. 정석이나 사활 문제 모음은 포함하지 않습니다.
- 한큐(野狐, Fox) 바둑 기보를 사용자 이름 또는 UID로 조회하여 로컬 보관함으로 가져올 수 있습니다. 같은 기보를 다시 가져와도 중복 기록을 만들지 않습니다.
- minimal판은 첫 실행 때 엔진과 모델을 자동으로 다운로드하지 않습니다. 로컬 엔진이 필요하면 설정 → 바둑 모델에서 KataGo 다운로드 및 활성화를 선택하세요. 기존 모델, 기보와 대화는 유지됩니다.
- 프로젝트에 MIT 라이선스를 적용하고 앱 내 라이선스 안내와 타사 구성 요소 및 기보 출처 고지를 추가했습니다. 타사 리소스에는 각각의 라이선스가 적용됩니다.

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
