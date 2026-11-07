# Issue 70 검증

최신 dev `b867227`을 기존 PR #107에 통합했습니다. 작품 필터를 기본 접힘으로 제공하고 기존 색상·타이포그래피 토큰으로 요약 행과 활성 조건 배지를 구성합니다. 접힌 필터는 작품 목록을 밀어내지 않습니다.

- `bash scripts/codex/verify.sh --browser`: check/build 및 61 tests / 4,800 assertions 통과. 기존 test:e2e 미구성으로 최종 exit 1. 자동 브라우저 단계 통과를 의미하지 않습니다. 최초 sandbox 실행은 HTTP 소켓 제한으로 실패했고 네트워크 허용 환경에서 재검증했습니다.
- 실제 Chromium/Playwright: 한국어·영어 각각 1440/768/375/320px, 기본 접힘, Enter/Space 펼침·접힘, 검색 조건과 배지 유지, 초기화, 가로 넘침 없음, 런타임 오류 0. `browser-results.json` 참조.
- `browser.cjs`는 로컬 테스트 서버 3170과 설치된 Playwright/Chromium을 사용합니다. 테스트 전용 DB `/tmp/issue70-review.sqlite` 사용. 운영 데이터 접근 없음.
- `ko-1440-*`, `ko-320-*`는 펼침·접힘 실제 화면입니다.

QA 배포와 사용자 확인은 별도 단계이며 수행하지 않았습니다. 최신 PR head의 CI·Qodo 및 필요한 사람 승인이 충족되기 전 병합하지 않습니다.
