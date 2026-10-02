# 변경 기록

[English](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/en/release-notes.md) · [简体中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/release-notes.md) · [繁體中文](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/zh-TW/release-notes.md) · [日本語](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ja/release-notes.md) · [한국어](https://github.com/junyang-zh/llm-go-trainer/blob/v0.1.7/docs/ko/release-notes.md)

## v0.1.7

- 시험 수순 중에도 승률과 집 차이 그래프에 실전 본보 전체를 유지합니다. 시험 수순은 빨간색, 본보의 이후 수순은 회색으로 표시하며 시험 수순을 지우면 캐시된 본보 그래프를 즉시 복원합니다. 모든 수치는 계속 흑의 관점을 사용합니다.
- 실전과 시험 수순의 누락된 평가를 백그라운드에서 자동으로 채우며 현재 보고 있는 국면을 우선 분석합니다. 검색 중·완료·오류 알림을 조정하고 완료 시 분석한 수와 엔진이 제공한 검색 속도를 표시합니다.
- 영역 예측은 소유 값의 절댓값이 0.8 이상인 지점만 명확한 흑백 표시로 보여 줍니다. 후보 수 및 시험 수순 번호와 함께 표시할 수 있으며 겹치지 않도록 위치를 조정합니다.
- 코치 답변에서 여러 좌표로 돌 무리를 참조하고 부드러운 안개 형태로 강조할 수 있으며 그룹 전환과 키보드 포커스를 지원합니다. 참조 텍스트가 화면 밖으로 나가거나 바둑판 국면이 바뀌면 강조를 숨깁니다. 단일 지점의 연결선은 표시의 오른쪽 아래 가장자리에서 시작하도록 변경하고 코치 지침과 각 언어의 문서를 업데이트했습니다.
- README의 화면 예시 이미지를 업데이트했습니다.

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
