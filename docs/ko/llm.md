# LLM 설정

[English](../en/llm.md) · [简体中文](../llm.md) · [繁體中文](../zh-TW/llm.md) · [日本語](../ja/llm.md) · [한국어](llm.md)

[README](../../README.ko.md) · [사용 안내](usage.md)

**설정 → LLM 연결**에서 설정합니다. `.env` 기본값도 지원하며 변경 후 재시작해야 합니다. 위치는 [환경 설정](development.md#environment)을 참고하세요.

메인 화면에 현재 LLM과 사용 가능 상태를 표시합니다. 자동 선택은 DeepSeek, Codex, Claude Code 순서이며 수동 선택은 해당 서비스로 고정합니다. 감지 결과는 30초 캐시하고 **연결 확인**으로 즉시 갱신합니다. DeepSeek는 `/models`에서 인증·모델을 확인하고 CLI는 `codex login status` / `claude auth status`를 사용합니다.

모델과 추론 수준은 서비스별로 저장해 다음 분석부터 적용합니다. Codex는 로컬 CLI의 공개 모델 캐시에서 지원 수준을 필터링합니다. 캐시가 없으면 CLI 기본값이나 모델 ID를 직접 선택합니다. Claude는 별칭·사용자 ID, API도 사용자 ID를 지원합니다. 실제 사용 가능 여부는 계정·서비스에 달려 있습니다.

## 에이전트 작업량 제한

**에이전트 작업량 제한**에서 한 회 최대 시간(10–3600초), 도구 호출(1–200회), 누적 탐색량(4,000–1,000,000 visits)을 설정합니다. 기본은 모두 무제한입니다. 빈칸은 해제, 숫자는 활성화합니다. 저장된 시간이 없으면 `LLM_TIMEOUT_MS`를 사용합니다(기본 0, 무제한).

어느 한도든 도달하면 본문·도구 결과·시험 분기를 남기고 일시 중지하며 이유와 **계속** 버튼을 표시합니다. 계속하면 현재 설정으로 새 예산을 추가하고 원래 질문·바둑판·서비스와 서버에 남은 결과를 사용합니다. 일시 중지 중에는 LLM·탐색을 실행하지 않습니다. 계속은 새 모델 요청이므로 중단한 내부 추론은 유지하지 않습니다. 수동 중지·연결 끊김·일반 오류에는 계속 버튼이 없습니다.

계속 작업은 현재 앱 실행의 메모리에 30분, 최근 최대 8개만 보관합니다. 만료·재시작 후에는 다시 질문해야 하지만 완료 본문과 시험 진행은 기록에 남습니다.

## DeepSeek API

DeepSeek에 API 키를 입력해 저장합니다. 환경 기본값도 사용할 수 있습니다.

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EFFORT=default
```

추론 끄기·낮음·높음·최대는 `reasoning_effort`의 `none/low/high/max`이며 모델 기본값은 인수를 생략합니다. 출력 예산은 공급자 기본값을 쓰며 추론 수준은 지연·사용량에 영향을 줍니다. [DeepSeek 요청 매개변수](https://api-docs.deepseek.com/api/create-chat-completion/)

앱 설정은 환경변수보다 우선합니다. **로컬 키 삭제**는 저장 키를 지우고 env로 돌아갑니다. 소스는 `.local/settings/llm.json`, 설치판은 `userData/settings/llm.json`에 평문 키를 저장합니다. macOS/Linux 권한은 `0600`, Windows는 사용자 디렉터리 권한을 따릅니다. 키 교체는 새 값을 저장하고 API 도메인을 바꾸면 해당 키를 다시 입력합니다.

질문하면 현재 바둑판·관련 엔진 데이터·대화 문맥을 공급자에게 보내며 해당 서비스 사용량이 발생합니다.

## Codex / Claude Code CLI

「설정 → LLM 연결」에서 Codex CLI 또는 Claude Code를 펼치면 `.env`를 편집하지 않고 각 CLI 경로와 선택 사항인 Node 경로를 저장할 수 있습니다. 따옴표나 인수 없이 절대 경로를 입력하세요. `~/`도 지원합니다. npm 설치는 CLI 링크 또는 실제 JS 진입점을 지정할 수 있습니다. Windows에서는 `.cmd` / `.bat` 대신 네이티브 `.exe` 또는 JS 진입점을 사용하세요. 지정한 경로의 디렉터리를 해당 CLI의 PATH에 추가합니다. Node가 다른 위치에 있다면 Node 실행 파일의 절대 경로를 입력하세요. 저장하면 인증을 다시 확인하고 다음 해설부터 적용합니다. 재시작 후에도 유지되며, 비워 두면 환경 기본값 또는 명령 이름으로 복원됩니다.

터미널에서 설치·로그인하고 `codex exec --help` / `claude --help`를 확인한 후 UI에서 모델을 선택합니다. 필요하면 절대 경로를 설정합니다.

```dotenv
CODEX_PATH=/absolute/path/to/codex
CLAUDE_PATH=/absolute/path/to/claude
```

Codex는 비대화형 `exec`, `--model`, `-c model_reasoning_effort=…`를 사용합니다. 독립 설정을 사용하므로 `--ignore-user-config` / `--ephemeral` 지원 CLI가 필요합니다. [Codex 설정](https://developers.openai.com/codex/config-reference/)

Claude는 print 모드에 `--model` / `--effort`를 전달합니다. Haiku는 기본 수준만 제공하며 다른 모델은 CLI·공급자에 따라 지원 수준이 달라집니다. CLI가 미지원 값을 낮출 수 있습니다. [Claude 모델·추론 수준](https://code.claude.com/docs/en/model-config#adjust-effort-level)

매 CLI 해설에 임시 MCP 바둑 도구를 연결하므로 Streamable HTTP MCP 지원 버전이 필요합니다. DeepSeek는 API의 기본 도구 호출을 사용하며 세 접속 모두 탐색 도구와 실행 기록을 공유합니다.

CLI 코치는 웹에서 바둑 자료를 찾아 출처를 제시할 수 있습니다. Codex는 `web_search="live"`, Claude는 `WebSearch` / `WebFetch`를 활성화·사전 허용합니다. 별도 검색 키는 필요 없습니다. 현재 국면의 전술·수치는 바둑판과 엔진 근거를 사용합니다. DeepSeek 연결은 현재 웹 검색을 제공하지 않습니다. [Codex 웹 검색](https://learn.chatgpt.com/docs/config-file/config-basic#web-search) · [Claude 도구 권한](https://code.claude.com/docs/en/cli-reference)

환경 기본값은 `CODEX_MODEL` / `CODEX_EFFORT`, `CLAUDE_MODEL` / `CLAUDE_EFFORT`이며 비우면 CLI 기본값입니다. 앱에 저장한 값이 우선합니다.

Windows는 네이티브 `.exe`를 권장합니다. npm의 `.cmd` shim은 네이티브 실행 파일이 아닙니다. `npm root -g`로 설치 위치를 찾고 Node와 실제 JS 진입점을 지정하세요.

```dotenv
CODEX_PATH=C:/Program Files/nodejs/node.exe
CODEX_SCRIPT=C:/Users/your-name/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js
```

Claude npm도 실제 진입점으로 `CLAUDE_PATH` / `CLAUDE_SCRIPT`를 설정합니다. 네이티브는 `*_SCRIPT`를 지정하지 않습니다. GUI의 PATH는 터미널과 다를 수 있어 절대 경로가 가장 확실합니다.

## 코치 프롬프트와 스킬

- [실행 중국어 코치 프롬프트](../../prompts/coach.zh-CN.md): 흑백 관점, 착수 전후 비교, 주요 변화도 인용, 돌의 강약, 설명 깊이.
- [재사용 go-coach 스킬](../../skills/go-coach/SKILL.md): 수동 호출 시에도 같은 규범을 읽습니다.

착수 해설에는 전후 바둑판·후보·변화 정보를 주고 추가 탐색을 허용합니다. 프롬프트는 모양에 맞는 바둑 용어로 목적과 득실을 설명하도록 안내합니다. 표시 언어는 중국어 프롬프트를 바꾸거나 생성 답변을 자동 번역하지 않습니다.

좌표 강조, 상호 배타적 선택기, 저장되는 시험 분기와 `edit_trial` 계약은 [대화형 해설](coach-links.md)을 참고하세요.
