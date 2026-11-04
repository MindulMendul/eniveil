# 이상한 축제

Astro 정적 사이트 + Svelte 5 인터랙티브 화면 + Hono + Bun 기반 머더 미스터리 모노레포. 배포 시 Bun 서버 하나가 정적 화면, HTTP API, WebSocket을 제공합니다.

## 빠른 시작

Bun **1.4.4 이상**을 설치한 뒤 프로젝트 루트에서 실행합니다.

```sh
bun install --frozen-lockfile
bun run dev
```

브라우저에서 http://localhost:5173 에 접속합니다. API 서버는 127.0.0.1:3000입니다. 개발 환경 Origin은 localhost:5173 / 127.0.0.1:5173을 허용합니다. 다른 주소를 사용하면 APP_ORIGIN을 설정해야 합니다.

```sh
bun run verify  # Svelte·TS 검사 → production build → 테스트
bun run build
bun run start  # http://localhost:3000
```

환경 변수는 `.env.example`을 참고해 루트 `.env`에 설정합니다. Bun이 `.env`를 읽습니다. 기본 데이터 파일은 `data/festival.sqlite`이며 git에서 제외됩니다.

## 구조

- `apps/web`: Astro 정적 빌드가 Svelte 5 화면을 마운트합니다. 현재 게임 화면은 브라우저에서 동작하며 기존 Hono API를 `fetch`로 호출하고 WebSocket으로 실시간 상태를 받습니다.
- `apps/server`: Hono HTTP + Bun WebSocket, 게스트 인증·방·세션·SQLite 저장.
- `packages/shared`: Zod 입력 검증, API/WS 통신 타입. 비밀 콘텐츠 없음.
- `deploy`: OCI용 Docker Compose와 Nginx 설정 예시.

## UI 스타일

웹 UI는 UnoCSS의 Wind4 프리셋을 사용합니다. `apps/web/uno.config.ts`에 축제 색상과 폰트 토큰이 있고, Astro와 Svelte 컴포넌트에서 `bg-festival-panel`, `text-festival-text`, `font-serif` 같은 유틸리티를 사용할 수 있습니다. 기존 CSS는 유지하며 새 UI부터 점진적으로 적용합니다.

의존성 설치와 실행 명령은 루트에서 관리합니다. 프론트·백은 별도 workspace 패키지이며 함께 빌드·배포할 수 있습니다.

## 현재 구현

- 닉네임 게스트 로그인. 30일 HttpOnly/SameSite 쿠키로 동일 브라우저 재접속.
- 게스트 토큰은 SHA-256 해시만 DB에 저장. OAuth는 미구현.
- 방 목록, 오리지널 작품 선택, 6자리 코드/링크 초대, 정원 검사.
- 창작마당은 준비 중 버튼만 제공.
- 참가자·방장·접속 상태 실시간 표시. 대기방 명시적 퇴장 시 방장 위임.
- 정원이 모두 접속하면 방장만 시작. 게임 세션 생성·역할 무작위 배정.
- 역할 확인 → 단서/토론 → 투표 → 진상 → 같은 대기방 복귀.
- 역할 비밀은 해당 참가자에게만, 단서는 토론 이후, 투표 상세·결말은 공개 단계 이후에만 전송.
- 게임 중 신규 입장과 명시적 퇴장 차단. 연결 끊김은 퇴장과 구분, 재접속 시 현재 상태 복원.
- 방·세션·역할·투표·게스트 인증은 SQLite에 저장. 서버 재시작 후에도 복원.
- 종료한 세션 기록 유지, 같은 방에서 새 세션 시작 가능.

## 두 명으로 테스트

1. 일반 창과 시크릿 창(또는 다른 브라우저)을 열어 각각 게스트 로그인합니다. 같은 브라우저의 일반 탭끼리는 게스트를 공유합니다.
2. 한 명이 방 만들기 → **사라진 축제 초대장**을 선택합니다.
3. 다른 창에서 코드로 입장합니다.
4. 방장이 시작하고 각 창의 다른 역할지를 확인합니다.
5. 방장이 단서 공개, 투표 시작을 누릅니다.
6. 각자 투표하면 진상이 공개됩니다. 방장이 대기방으로 돌아갑니다.
7. 플레이 도중 새로고침하거나 창을 닫고 다시 열어 재접속을 확인할 수 있습니다.

`사라진 축제 초대장`은 2인·약 5분의 기능 검증용 예제입니다. 실제 살인사건 시나리오가 아닙니다. 오리지널 3부작은 제목만 등록하고 선택을 막았습니다. 해당 작품의 4인·60분 값은 임시 데이터이며 확정 기획이 아닙니다.

## 통신과 권한

HTTP: `POST /api/guest`, `GET /api/state`, `POST /api/rooms`, `POST /api/rooms/join`, `GET /api/health`.

WS: `/ws`, 쿠키 인증 + Origin 검증. 클라이언트 명령은 `start`, `advance`, `vote`, `return`, `leave`이며 requestId를 포함합니다. 서버는 개인화된 `snapshot`, `ack`, `error`를 전달합니다. 서버가 방장 권한·정원·단계·중복 투표를 검증합니다. 시작을 재요청하면 이미 진행 중인 세션을 유지합니다. 클라이언트는 끊긴 연결을 2초 뒤 재연결하고 서버 snapshot으로 화면을 복원합니다. 서버는 30초마다 snapshot을 전송합니다.

## OCI 배포

기존 OCI의 아키텍처·메모리·포트·도메인 정보는 아직 연결하지 않았습니다. 실제 원격 배포는 수행하지 않았습니다.

```sh
APP_ORIGIN=https://your-domain.example docker compose -f deploy/compose.yaml up -d --build
```

- 컨테이너는 호스트의 `127.0.0.1:3000`에만 바인딩됩니다.
- Nginx HTTPS 서버에서 `/`와 `/ws`를 프록시합니다. `deploy/nginx.conf`는 기존 TLS 설정에 합칠 예시이며 그대로 활성화하는 전체 설정이 아닙니다.
- production에서는 정확한 `APP_ORIGIN`이 필수이며 쿠키에 Secure가 적용되므로 HTTPS가 필요합니다.
- 볼륨 `festival-data`를 유지해야 합니다. 삭제하면 데이터가 사라집니다.
- SQLite 파일은 실행 중 단순 복사하지 말고 SQLite online backup 또는 정지 후 백업을 사용하세요.

## CI/CD와 새 인프라 골격

- GitHub Actions의 `.github/workflows/ci.yml`은 PR과 `main` 푸시에서 잠금 파일 설치, 타입·Astro 검사, production build, API·Temporal Worker 이미지 빌드를 실행합니다. 기존 자동 테스트 suite는 이 CI에서 실행하지 않습니다.
- `.github/workflows/deploy-oci.yml`은 저장소 변수 `OCI_REGISTRY`, `OCI_REGISTRY_HOST`, `KUBERNETES_ENABLED=true`, `APP_ORIGIN`이 준비된 경우 OCIR에 이미지를 올리고 k3s에 배포합니다. 필요한 Actions secrets는 `OCIR_USERNAME`, `OCIR_AUTH_TOKEN`, `KUBECONFIG_B64`입니다.
- API의 k3s replicas는 1로 고정했습니다. 현재 SQLite 데이터 파일과 WebSocket 접속 상태가 프로세스 로컬이기 때문입니다. Supabase/Postgres 저장소와 분산 presence·브로커 없이 API replica를 늘리면 데이터 정합성이 깨질 수 있습니다.
- Temporal은 Cloud 또는 별도 운영 중인 Temporal Service에 연결하는 Worker로 구성했습니다. `TEMPORAL_ENABLED=true`일 때 별도 배포하며 `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY`, `TEMPORAL_GATEWAY_TOKEN` secrets가 필요합니다. API가 게임 세션 시작·단계 변경·종료 이벤트를 전달하고 Worker가 세션별 workflow를 유지합니다.
- 방마다 Pod를 띄우지 않습니다. 세션마다 Temporal Workflow Execution을 만들고, 공용 Worker Deployment가 task queue에서 여러 세션을 처리합니다. Worker는 부하에 따라 별도로 scale할 수 있습니다.
- 앱 이미지에는 HTTPS 도메인과 Ingress TLS secret을 반영해야 합니다. `festival.example.com`과 `festival-tls`는 배포 전에 교체·프로비저닝해야 합니다.
- `.pr_agent.toml`은 Qodo PR reviewer가 멀티플레이 권한, 역할 비밀 노출, WebSocket, 데이터 일관성과 배포 안전을 우선 검토하도록 설정합니다. 저장소에 Qodo Merge GitHub App을 설치하면 적용되며, AI 리뷰는 merge gate가 아니라 보조 의견으로 둡니다.
- `.github/workflows/supabase-keepalive.yml`은 매월 1·6·11·16·21·26·31일 UTC 03:17에 Supabase REST API를 요청합니다. `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 Actions secrets에 등록해야 합니다. GitHub 예약 실행은 정확한 분 단위 실행을 보장하지 않습니다.

현재 단계에서 Supabase는 앱의 저장소로 연결하지 않았습니다. Keepalive는 프로젝트의 REST API를 호출할 뿐 SQLite 데이터를 Supabase로 옮기지 않습니다. 또한 Temporal Service 자체는 k3s 안에 설치하지 않습니다. Temporal Cloud 또는 별도 Temporal Service 주소가 있어야 Worker가 준비 상태가 됩니다.

## 범위와 다음 구현 지점

- **Supabase는 아직 연결하지 않았습니다.** 자격 정보 없이 즉시 실행할 수 있도록 SQLite를 사용했습니다. `store.ts`와 `game.ts`가 데이터 접근/도메인 경계이며, Supabase PostgreSQL 전환 시 저장소를 비동기 repository로 교체하고 트랜잭션을 도입해야 합니다. 현재 전체 상태를 JSON 한 행으로 저장하므로 관계형 Supabase 모델은 별도 작업입니다.
- 단일 Bun 프로세스 전용입니다. 여러 서버의 동시 실행·분산 락·브로커는 미구현입니다.
- 예제 콘텐츠만 실행합니다. 일반화된 시나리오 엔진, 창작 편집기, 시나리오 버전 발행/이관은 미구현입니다. 세션은 scenarioId/version, 참가자 이름과 역할 배정을 고정 보관합니다.
- 방장이 연결을 끊으면 자리를 보존하고 재접속을 기다립니다. 게임 중 자동 방장 위임·강제 중단·시간 제한은 미구현입니다.
- 브라우저 쿠키를 지우면 기존 게스트를 복구할 수 없습니다. 로그아웃/계정 연결은 미구현입니다.
- 대화는 대면/디스코드 사용. 음성·채팅·결제·관리자 화면은 없습니다.
- 요청 크기·WS 빈도와 게스트 생성에 기본 제한만 적용했습니다. 게스트 생성은 현재 인스턴스 전체 분당 30회 제한입니다. 공개 운영에는 프록시 단위 속도 제한과 유휴 데이터 정리가 필요합니다.
- UI는 컴파일·타입 검사를 수행했습니다. 실제 브라우저 시각 QA와 Docker 이미지 실행 검증은 수행하지 않았습니다.

## 검증

도메인 테스트: 방장 권한, 정원·접속 조건, 중복 시작·투표, 비밀 정보 분리, 결말 공개, 대기방 복귀·재시작, 방장 위임, 인증 만료, DB 재개방 복원.

통합 테스트: 실제 Hono/Bun HTTP·WebSocket 서버에 두 게스트 연결, Origin 거부, 방 생성·참여, 세션 진행, WebSocket 재접속, 투표·결말·대기방 복귀.
