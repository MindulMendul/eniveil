# 프런트엔드 공통 UI와 반응형 기준

## 구조와 의존성

이슈 #76에서 `apps/web`의 모든 소스 파일과 설정을 확인했다. Astro 진입점은 `layouts/AppLayout.astro` → `app/App.svelte`를 사용한다. 구 진입점 `src/App.svelte`도 같은 앱을 사용하며, 사용되지 않던 `features/platform/PlatformApp.svelte`와 `features/game/MultiplayerGame.svelte` 복제본은 제거했다.

| 계층 | 책임과 현재 슬라이스 |
| --- | --- |
| app | 인증·WebSocket·내비게이션과 페이지 조립 |
| pages | entry, lobby, room, game, solo, workshop, workshop editor, 404 |
| widgets | app-header, app-footer, error-notice, story-picker |
| features | guest-login, room-join, game의 플레이·평점·연출 |
| entities | member, room, scenario, session의 공개 모델과 표시 |
| shared | 통신·게임 도메인을 모르는 UI, i18n, 전역 스타일 |

상위 계층은 하위 계층의 공개 `index.ts`를 통해 재사용한다. 공유 UI는 entities/features/pages/widgets/app을 import하지 않는다. Astro 라우트와 Svelte 페이지 슬라이스가 같은 `pages` 폴더에 있는 기존 배치는 유지했다. 이에 따른 Astro의 Unsupported file type 경고는 이번 변경 이전에도 존재한다. `.mstory` 검증·파일 업로드·즐겨찾기·시나리오 선택·게임 비밀과 서버 권한 처리는 각 도메인에 남긴다.

## 토큰

`apps/web/design-tokens.tokens.json`이 단일 소스다. UnoCSS 테마와 `:root` CSS 변수를 같은 변환기로 생성한다. 별도 생성 파일을 수동으로 동기화하지 않는다.

- color.festival / color.workshop: 기존 화면 색상과 선택·경고·배경·경계 색상
- spacing: padding, margin, gap의 공통 간격
- typography: 글꼴, 크기, 굵기, 행간, 자간
- radius / border / shadow: 모서리, 선 두께, 그림자
- layout: 콘텐츠·카드·필터·터치 타깃 크기
- motion: 로딩·전환 주기
- breakpoint: mobile/tablet 및 기존 sm/md/lg/xl/2xl 클래스의 명시적 기준

예: `var(--color-festival-text)`, `var(--spacing-4)`, `var(--border-thin)`. 기존 게임의 cue duration은 스토리 데이터에서 전달하는 값이므로 디자인 상수로 바꾸지 않는다. 기존 숫자 기반 UnoCSS 유틸리티도 동일 간격 테마를 사용한다.

## 공유 UI API

`shared/ui` 공개 진입점에서 가져온다. Svelte 5 `children` snippet을 사용한다.

| 컴포넌트 | 사용 |
| --- | --- |
| Button / CallToAction | 동작 버튼 / href가 있는 링크 CTA. Button 기본 type은 button이며 폼은 submit을 지정 |
| Text / Badge | 일반·보조·제목·eyebrow 텍스트 / 기본·gold 배지 |
| TextInput / TextArea / Select | bind:value와 네이티브 속성·이벤트, 부모의 label과 연결 |
| Panel / Card | section / article 의미를 갖는 공통 컨테이너 |
| FilterBar | 화면 크기에 맞춰 재배치하는 필터 그룹, label 필수 |
| Modal / Offcanvas | 네이티브 dialog의 포커스 제한, Escape, 동적 뷰포트 높이, 스크롤 |
| Toast | 상태 알림 또는 오류, 선택적 닫기 동작 |
| Spinner / Skeleton | 보이는 로딩 메시지 / 보조 shimmer, reduced motion 지원 |
| StateMessage / PageState | 섹션 / main 영역의 loading·empty·error, 추가 동작을 children으로 전달 |

Modal은 `open`과 `onClose`로 제어하거나 기존 로그인·상세 화면처럼 `bind:element`로 네이티브 showModal/close API를 사용한다. `labelledby`는 실제 제목 id를 가리켜야 한다. 제어형 모달이 제거되면 실행 버튼으로 포커스를 복구한다. Offcanvas도 닫기 버튼을 children으로 제공한다. 기존 header/footer 위젯에는 앱 데이터가 필요하므로 shared로 이동하지 않는다.

## 반응형

280px 커버 화면부터 1280px 데스크톱까지 실제 Chromium에서 확인했다. 헤더·페이지 제목·버튼 행을 줄바꿈하고, 폼의 최소 폭을 제한하며, 필터와 카드 열은 가용 폭으로 결정한다. 520px 이하의 입력 글자는 16px이며 터치 영역은 최소 44px다. 모달은 `dvh`로 높이를 제한한다. 이중 세그먼트 API를 지원하는 폴더블은 한 세그먼트 안에 콘텐츠를 배치하고, 미지원 브라우저는 일반 반응형 레이아웃을 사용한다. 실제 폴더블 하드웨어의 힌지·회전은 별도 기기 QA 대상이다.

## 검증 기록

- `bash scripts/codex/verify.sh`: 타입 검사·정적 빌드·서버 테스트 27개 통과. 네트워크 실행 권한이 있는 환경에서 HTTP/WebSocket 통합 테스트 포함.
- `bash scripts/codex/verify.sh --browser`: 기본 검증 이후 `test:e2e` 미설정 오류를 그대로 반환한다. 자동 E2E 통과로 보고하지 않는다.
- 실제 Chromium + Python Playwright: 한국어·영어 홈에서 280/320/360/520/717/850/1280px 가로 넘침 없음.
- 창작마당 280/360/717/1280px: 필터 배치, 로그인 모달 입력과 Escape 닫기 확인.
- 게스트 로그인 → 로비 → 작품 선택: 280/360/717/1280px에서 검색, Tab 포커스 제한, Escape, 실행 버튼 포커스 복귀 확인. 솔로 플레이 진입과 런타임 오류 없음 확인.
- 임시 Chromium 픽스처: 280px Offcanvas 열기·닫기, TextArea/Select 양방향 바인딩, reduced-motion에서 spinner/shimmer 애니메이션 중지 확인. 픽스처는 검증 후 제거.
- CSS 변수 참조 전수 대조: 데이터 기반 `--cue-duration` 외 미정의 토큰 없음.

### Qodo 리뷰 후 회귀 검증

- imperative Modal의 Escape는 네이티브 close 이벤트 한 곳에서만 onClose를 호출한다. controlled Modal은 기본 닫기를 막고 부모 상태 변경을 요청한다. 실제 Chromium에서 imperative Escape·버튼 close 및 controlled Escape의 콜백이 각각 정확히 한 번 실행됨을 확인했다.
- 정적 404는 빌드 시 URL 대신 브라우저 pathname에서 언어를 판별한다. 빌드 산출물을 누락 URL로 제공하는 HTTP 서버에서 `/missing` → `/`, `/en/missing` → `/en/`, `/english/missing` → `/`와 문서 언어를 확인했다.
