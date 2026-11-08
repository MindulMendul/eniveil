# GTM 검증 — 2026-11-08

사용자가 선택한 동의 전 차단/허용 후 활성화 정책으로 구현했다. 지정 컨테이너 GTM-56Q5K95G를 빌드해 기본 verify exit0: 타입·빌드 및103 tests/5,299 assertions. --browser는 test:e2e 부재로 exit1이며 실제 Chromium 검증으로 보완한다.

Chromium155, ko/en ×320/1440px 네 환경에서 첫 방문 요청0·dataLayer 없음, 거부 후 새로고침 요청0, 허용 후 컨테이너 요청1·초기 page_view1, SPA 언어 이동 시 page_view1 추가와 컨테이너 중복 없음, 쿼리/해시 코드 제외, 철회 후 새로고침 GTM 요청0·dataLayer 없음, 동의 영역 axe 위반0·가로 넘침0을 확인했다. 자체 메모리 DB 서버를 사용하고 Google 요청은 로컬 stub으로 응답하여 외부 분석 전송은 없었다. 결과: gtm/results.json.

GTM 콘솔 접근·태그 수정·컨테이너 게시 및 GA4 실제 수신은 수행하지 않았다. 운영자 설정과 환경별 Preview/DebugView 확인은 docs/gtm-analytics.md를 따른다. 이번 작업은 dev 통합이며 QA/운영 배포는 수행하지 않았다.
