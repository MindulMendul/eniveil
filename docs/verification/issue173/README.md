# #173 동의 범위 검증 — 2026-11-09

최종 정책은 **전체 동의 후 로그인·플레이**, 목적은 **게임 품질·난이도·개인 실력 지표만**이다. 기본은 GA만 허용하고 서비스 이용은 제한한다. 광고 이벤트는 전송하지 않고 Google 광고 관련 consent는 denied다. 난이도/MMR 계산·표시 자체는 이번 작업에 포함하지 않았다.

타입·빌드·기본 verify, 단위129 tests/5,480 assertions + HTML 통합1 test/15 assertions, 합계130 tests/5,495 assertions 통과. 배포 설정 Python13 tests 통과. `--browser` 래퍼는 test:e2e 부재로 exit1이며 실제 Chromium 검증으로 보완했다.

## 실제 브라우저

자체 메모리 DB 서버에서 ko/en ×320/1440px 네 환경의 전체 동의 수명주기를 검증했다. 첫 방문·v1 허용 사용자 재안내, 큰 모달·버튼 고정·제목 포커스·Tab/Shift+Tab·모달 axe WCAG2/2.1 A/AA 위반0, 기본 선택의 GA1개와 로그인/게임403, 전체 선택 후 게스트 로그인·첫 계정 바인딩·새 탭에서 불필요한 재동의 없음, 다른 탭에서 기본으로 축소 시 실제 게임 WebSocket 종료·새 게임 요청403, 철회 후 GA 제거, 동의 없이 계정 설정 접근을 확인했다. 구글 설정이 활성화된 경우에도 기본 선택에서 OAuth API로 페이지 이동하지 않고 동의창을 연다.

별도 실패 검증은 전체 동의 문서에서 배경 조회503에도 문서가 유지되는지, 철회 POST503 후 새 문서에서 GA가 차단되고 재시도 가능한지도 확인했다. 초기 저장 실패 두 사례는 선택 쿠키가 반영되지 않는 응답과 서버 저장503을 재현했다. 모두 모달에 오류를 표시하고 GA를 시작하지 않으며 서비스 요청을403으로 거절한다. 서버 단위 테스트는 실제 SQLite 기록 수와 축소/철회/계정 삭제·만료·갱신 시 삭제 경계, 인증된 계정 간 자동 이전 방지를 확인한다. Faro는 SDK를 격리한 단위 테스트로 기본/미동의 시 시작0, 전체에서만 시작, 사용자/페이지 메타 제거, 철회 후 전송 차단을 검증했다.

브라우저 Google 요청은 로컬 stub 응답이며 실제 Google 전송은 없었다. 모든 데이터 변경은 자체 메모리 DB에서만 했다. QA·운영 데이터는 읽거나 수정하지 않았으며 이번 작업의 배포도 하지 않았다. 결과는 results.json(식별자 없는 판정값)이며 스크린샷은 작업 환경에 보관했다.

## 재현

1. `PUBLIC_GTM_CONTAINER_ID=GTM-56Q5K95G bun run build`.
2. 별도 터미널에서 `DATABASE_PATH=:memory: PORT=3273 APP_ORIGIN=http://127.0.0.1:3273 GOOGLE_AUTH_DEMO=true bun apps/server/src/index.ts`로 본인이 소유한 폐기 가능한 서버를 시작한다.
3. Playwright/Chromium/axe가 설치된 환경에서 다음 명령을 실행한다. 클라우드 기본 Playwright 모듈은 `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`이며 다른 환경에서는 설치 경로를 지정한다.

```sh
DISPOSABLE_TEST_SERVER=1 BASE_URL=http://127.0.0.1:3273 \
PLAYWRIGHT_MODULE=/path/to/playwright AXE_PATH=/path/to/axe.min.js \
node docs/verification/issue173/browser.cjs
DISPOSABLE_TEST_SERVER=1 BASE_URL=http://127.0.0.1:3273 \
PLAYWRIGHT_MODULE=/path/to/playwright node docs/verification/issue173/failures.cjs
```

BASE_URL은 로컬 origin만 허용하며 리디렉션·외부 요청·외부 WebSocket은 차단한다. GTM은 페이지 경로에서 로컬 응답으로 대체한다. 출력은 기본 시스템 임시 디렉터리의 무작위 전용 폴더이며 OUTPUT_DIR로 변경할 수 있다. QA/운영 URL에는 실행하지 않는다.

GTM 콘솔의 태그/게시 상태·GA/Faro 과거 데이터 삭제를 이 검증으로 완료했다고 보고하지 않는다. 상세 보관/목적과 #172/#174 연계 범위는 docs/collection-consent.md를 따른다.
