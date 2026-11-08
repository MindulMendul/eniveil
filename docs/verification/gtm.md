# GTM 검증 — 2026-11-08

사용자가 선택한 동의 전 차단/허용 후 활성화 정책으로 구현했다. 지정 컨테이너 GTM-56Q5K95G를 빌드해 기본 verify exit0: 타입·빌드 및103 tests/5,299 assertions. --browser는 test:e2e 부재로 exit1이며 실제 Chromium 검증으로 보완한다.

Chromium155, ko/en ×320/1440px 네 환경에서 첫 방문 요청0·dataLayer 없음, 거부 후 새로고침 요청0, 허용 후 컨테이너 요청1·초기 page_view1, SPA 언어 이동 시 page_view1 추가와 컨테이너 중복 없음, 쿼리/해시 코드 제외, 철회 후 새로고침 GTM 요청0·dataLayer 없음, 동의 영역 axe 위반0·가로 넘침0을 확인했다. 자체 메모리 DB 서버를 사용하고 Google 요청은 로컬 stub으로 응답하여 외부 분석 전송은 없었다. 결과: gtm/results.json.

GTM 콘솔 접근·태그 수정·컨테이너 게시 및 GA4 실제 수신은 수행하지 않았다. 운영자 설정과 환경별 Preview/DebugView 확인은 docs/gtm-analytics.md를 따른다. 이번 작업은 dev 통합이며 QA/운영 배포는 수행하지 않았다.

## 동의 철회 후속 검증

PR #158 후속 변경에서 허용 저장 실패, 저장소가 기존 허용을 가진 상태에서 철회 저장 실패, 저장 항목 삭제 대안, 다른 탭의 철회 및 철회 직후 pagehide 이벤트를 단위 테스트로 검사했다. 단서·용의자·장소 ID는 이벤트 허용 목록에서 제외했다. 저장과 삭제가 모두 불가능하면 앱의 신규 이벤트는 중단하지만 이미 실행된 외부 스크립트를 완전히 중단할 수 없으므로 오류를 표시한다.

`PUBLIC_GTM_CONTAINER_ID=GTM-56Q5K95G bash scripts/codex/verify.sh`: 106 tests / 5,312 assertions 통과. `--browser`는 같은 기본 단계 통과 후 test:e2e 부재로 종료 1이다. 배포 Python 테스트 13개 통과.

`consent-browser.cjs`를 테스트 전용 메모리 DB 서버에서 실행해 한국어·영어 × 1440·320px 네 조건에서 동의 전 요청 없음, 수락 시 한 번 로드, 페이지 URL 쿼리·해시 제외, 다른 탭 철회 반영, 철회 후 pagehide의 마지막 체류 이벤트 없음, 페이지 오류와 가로 넘침 없음을 확인했다. GTM URL은 로컬로 응답하는 stub이므로 실제 컨테이너·GA4 수신을 검증하지 않는다.

```sh
PUBLIC_GTM_CONTAINER_ID=GTM-56Q5K95G bun run build
PORT=33879 DATABASE_PATH=:memory: bun apps/server/src/index.ts
# 다른 터미널에서, Playwright/Chromium 경로를 환경에 맞게 설정
DISPOSABLE_TEST_SERVER=1 BASE_URL=http://127.0.0.1:33879 CHROMIUM_PATH=/path/to/chromium node docs/verification/gtm/consent-browser.cjs
```

컨테이너의 태그가 브라우저 URL에 직접 접근하는 것을 사이트의 dataLayer 필터가 막지는 못한다. 관리자가 GTM Preview에서 자동 페이지 조회·외부 태그·초대 코드 유출과 실제 GA4 수신을 확인해야 한다.
