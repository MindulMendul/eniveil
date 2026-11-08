# Issue 123

- `/about/`·`/en/about/`에 정적 설명 본문을 제공한다. 일반 사용자는 푸터로 접근하며, sitemap·canonical·hreflang에 같은 공개 경로를 사용한다. UA 분기·별도 캐시 정책은 없다.
- 내용: 실제 작품 탐색, 방 참가·플레이, 초안 편집·공개 흐름. 계정 정보나 비공개 작품은 포함하지 않는다.
- 2026-11-08 기본 verify 80 tests / 4,943 assertions 통과. --browser는 test:e2e 부재로 기본 검사 후 exit 1.
- 자체 메모리 DB 서버에서 실제 Chromium의 JavaScript를 끄고 스타일시트 요청을 차단했다. 한국어·영어 본문의 h1/h2·목록·문단을 확인하고 모든 공개 본문 링크가 HTTP 200임을 확인했다.
- Mozilla/5.0, GPTBot, ClaudeBot, Google-Extended의 각 언어별 HTML이 동일하다. 초기 JSON-LD의 언어·URL과 본문 경로가 일치한다.
- QA/운영 배포 및 AI 검색 순위 검증은 포함하지 않는다.
