# 공개 홈 초기 HTML 검증 — 2026-11-09

#146. 공개 홈은 Astro 빌드 시 서비스명·핵심 소개·소개/약관/개인정보/언어 링크를 렌더링한다. client-only 앱의 fallback이며 앱 준비 후 제거된다. 로그인 화면은 동일 EntryIntro를 사용해 내용이 유지되고 중복 본문은 없다. 비공개 화면에는 홈 fallback을 넣지 않는다.

기본 verify exit0:108 tests/5,341 assertions 및 타입·빌드 통과. --browser는 test:e2e 부재로 exit1이며 실제 Chromium 검증으로 보완한다.

자체 memory DB 서버에서 ko/en ×320/1440px ×JS off/on 총8개 환경을 검증했다. 각 환경의 h1/핵심 소개는 각각1개, JS-off 및 CSS-off에서도 본문·공개 링크 유지, overflow0, JS-on axe WCAG2/2.1 A/AA 위반0, 페이지 오류0. 고유한 테스트 닉네임으로 게스트 로그인 후 방 만들기 진입을 확인했다. 일반·Googlebot·GPTBot HTTP 요청은 한/영 각각 동일 공개 HTML을 반환한다. 결과는 public-home/*.json.

QA/운영에는 이 검증 시점에 배포하지 않았다. 배포 후 검증은 승격 PR과 이슈에 별도로 기록한다.

리뷰 보완: 인증 API와 entry 청크 응답을 각각 보류한 실제 브라우저에서도 한/영 소개와 단일 main/h1을 유지했다. LazyContent의 pending/error 슬롯과 최초 로딩에서 같은 소개를 사용한다. HTML 검증은 apps/web/integration으로 분리했다. 기존 HTTP 테스트도 실제 404 산출물을 필요로 하므로 `bun run test` 자체가 먼저 앱을 빌드한다. dist 없는 시작 상태에서도107 tests/5,326 assertions를 검증하며, `bun run test:html`은 빌드 후 HTML 통합 테스트를 실행한다. 기본 verify는 빌드→단위 테스트→HTML 통합 테스트(1 test/15 assertions) 순서로 총108 tests/5,341 assertions를 검증한다.
