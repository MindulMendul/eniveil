# Codex Cloud 자율 개발

## 운영 방식

GitHub 이슈 하나를 Codex Goal 하나로 처리한다. 에이전트가 구현·검증·CI 실패 수정·Qodo 대응을 반복하고, 저장소가 요구하는 승인까지 충족되면 허용된 작업 브랜치 → dev squash merge 후 작업 브랜치를 삭제한다. 제품 목표가 모호하거나 인증·권한이 부족한 경우만 사용자에게 결정을 요청한다. 사람이 필요한 GitHub 승인은 생략하지 않는다.

현재 dev는 루트 package.json 기준의 Astro + Svelte / Hono + Bun / SQLite 구조다. 과거 festival/ 작업 디렉터리를 사용하지 않는다. test:e2e는 아직 없다. 이 변경은 브라우저 테스트 자체를 추가하지 않는다.

작업 브랜치는 `feat/*`, `fix/*`, `bugfix/*`, `style/*`, `chore/*`, `refactor/*`, `docs/*`, `test/*`, `ci/*`, `build/*`, `perf/*`를 허용한다. 디자인 작업은 `style/*`를 사용한다. 용도와 예시는 [브랜치 이름 규칙](branch-naming.md)을 따른다.

## 환경을 한 번 준비하기

1. 웹 또는 데스크톱의 `Work in > Cloud > Select environment > Create environment`에서 MindulMendul/murder-parker를 선택한다. 환경 이름은 murder-parker-dev, 기준 브랜치는 dev로 설정한다. GitHub 연결이 필요하면 연결한다.
2. Bun 1.4.4와 Python 3, Git을 준비하도록 요청한다. GitHub 작업은 연결된 GitHub 도구를 사용한다. CLI를 사용할 경우 gh와 유효한 인증이 별도로 필요하다. 저장소에 토큰을 넣지 않는다. 개발·테스트에는 운영 SSH 키나 DB 인증이 필요 없다.
3. Install script에는 저장소 루트에서 `bash scripts/codex/setup.sh`를 실행하도록 지정한다. 설치 도메인 접근이 필요하다. 이 스크립트는 런타임 버전을 확인하고 lockfile대로 의존성을 설치하고 의존성 lifecycle 스크립트는 실행하지 않는다. 런타임 설치 자체는 환경 준비 단계에서 수행한다.
4. 시작 지침에는 “작업 전 AGENTS.md와 docs/codex-cloud.md를 읽고 현재 브랜치·변경·기존 PR을 확인한다. 서버가 필요한 작업은 테스트 전용 DB를 사용하며 종료 시 정리한다”를 기록한다. 일반 개발서버를 자동으로 영구 실행할 필요는 없다.
5. `bash scripts/codex/verify.sh`를 실제 실행해 준비 결과를 확인하고 환경을 Publish한다. 실패하면 원인을 해결한 뒤 게시한다. 기본 검증 외 Docker/Trivy 등 CI 전용 검사도 PR에서 확인한다.
6. 새 작업에서 저장소 파일과 명령이 준비됐는지 확인한다. 스크립트·의존성이 바뀌면 환경을 Edit 후 Republish한다. 기존 작업의 상태와 새 작업의 환경은 다르다.

저장소 파일만 추가해서 계정의 Cloud 환경이 생성되거나 게시되지는 않는다. 환경 생성·게시와 Goal 활성화는 해당 Codex 화면에서 수행한다. GitHub 연결·네트워크·쓰기 권한도 환경에서 확인해야 한다.

## 이슈를 시작하기

GitHub의 Codex 개발 작업 양식에 원하는 결과·완료 조건을 적는다.

이 지침을 포함한 브랜치의 저장소가 열린 Codex 작업에 이슈 번호만 보낸다. 아래 `123`은 예시이며 실제 이슈 번호로 바꾼다.

```text
/goal 123
```

이 메시지가 에이전트에게 전달되면 에이전트가 프롬프트 생성 명령을 실행하고, 이슈·기존 작업·PR 상태를 확인한 뒤 해당 지침에 따라 진행한다. 사용자가 직접 Python 명령을 실행하거나 출력된 프롬프트를 다시 복사할 필요는 없다. 다른 이슈의 작업과 충돌하면 전환 여부를 먼저 확인한다.

Codex 클라이언트가 `/goal`을 자체 명령으로 처리하면 저장소에서 이 동작을 바꿀 수 없다. 이 경우 같은 요청을 일반 메시지로 보낸다.

```text
이슈 123 진행
```

이 단축 입력은 저장소의 에이전트 지침이다. 플랫폼의 네이티브 Goal을 생성하는 API나 사용자 정의 슬래시 명령을 설치하는 기능은 아니다. 네이티브 Goal 등록 여부와 자동 재개 지원은 Codex에서 별도로 확인한다.

프롬프트 전체를 직접 확인하거나 네이티브 Goal에 등록하고 싶은 경우에는 다음 명령을 사용할 수 있다.

```sh
python3 scripts/codex/goal.py 123
```

출력된 `/goal ...`을 Goal 지원 Codex 작업에 입력한다. 공식 Goals 가이드는 Codex 0.128.0 이상을 안내한다. 사용하는 Cloud 화면에서 Goal 지원을 확인한다. 이 명령은 프롬프트를 출력할 뿐 Goal 생성 API나 예약 작업이 아니다. 지원하지 않는 화면에서는 자동 재개를 보장할 수 없다.

`/goal`로 현재 상태, `/goal pause`·`/goal resume`·`/goal clear`로 수명 주기를 관리한다. 목표는 스레드 단위이므로 재접속할 때 같은 작업을 연다. 새 작업으로 중복 실행하지 않는다. 에이전트가 다음 이슈를 임의로 시작하지 않는다.

## 검증과 실패 근거

```sh
bash scripts/codex/verify.sh
bash scripts/codex/verify.sh --browser # UI/브라우저 동작 변경
```

기본 verify는 check → build → 서버 테스트를 실행한다. wrapper는 실제 종료 코드를 보존하고 `.codex-results/verify.*.log`에 출력을 저장한다. 결과물은 Git에서 제외된다. 현재 --browser는 기본 검증 후 test:e2e 부재를 오류로 보고한다. UI 변경은 실제 브라우저 조작·화면·로그 등 근거를 PR에 기록하거나 브라우저 테스트를 구현한 뒤 실행해야 한다. 명령 부재를 통과로 바꾸지 않는다.

PR에는 이슈, 완료 조건, 실행 명령·결과, 미실행 사유, 최신 head SHA, 리뷰 상태와 남은 제약을 남긴다. 로그를 외부에 첨부하기 전에 토큰·쿠키·역할 비밀·미공개 결말·투표 내용을 제거한다. 테스트가 띄운 프로세스와 임시 DB도 종료 후 확인한다.

## Qodo와 병합 반복

PR을 만든 뒤 최신 head의 체크·리뷰·인라인 스레드·대화 댓글을 모두 확인한다. `.pr_agent.toml`은 PR과 push에서 `/agentic_review` 실행을 설정한다. 결과가 없으면 설치·실행 상태를 확인하고, 필요하면 PR 댓글의 `/agentic_review`로 재검토를 요청한다. 응답이 없으면 Qodo 완료로 처리하지 않는다.

각 지적을 수정하거나 해당 스레드에 적용하지 않는 근거를 답변한 뒤 해결 처리한다. 수정 커밋 후 Qodo가 최신 head를 다뤘다는 리뷰 SHA 또는 명시적인 실행 근거를 확인한다. 오래된 리뷰, 미해결 스레드, 실패·대기 체크가 있으면 병합하지 않는다. 근거 없이 스레드를 닫지 않는다.

GitHub 병합 가능 상태와 필수 승인을 확인하고 직전에 head SHA가 바뀌지 않았는지 다시 읽는다. 해당 SHA로 squash merge한 뒤 실제 merged 상태를 확인하고 해당 작업 원격 브랜치만 삭제한다. 환경 브랜치나 미병합 브랜치는 보존한다. 권한 부족·병합 충돌은 원인을 해결하거나 blocker로 남기고 보호 설정을 우회하지 않는다.

CI/Qodo를 기다리다 작업이 멈추면 같은 Goal을 재개해 최신 head부터 확인한다. 이 저장소는 상시 GitHub 이벤트 수신기나 자동 재기동 서비스를 추가하지 않는다. Goal은 예산·제품 지원·권한·외부 리뷰 상태에 따라 멈출 수 있으며, 계정의 사용량 제한도 적용된다.

## 공식 문서

- [Cloud 환경 생성·게시와 여러 기기에서 재개](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Goals의 완료 조건·검증·중단·예산](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)
