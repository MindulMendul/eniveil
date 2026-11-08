# Issue 124

- 초기 HTML과 앱 경로·언어 갱신 모두 pageSchema를 사용한다. 홈 WebSite, 목록 CollectionPage, 소개 AboutPage, 법적 안내 WebPage만 실제 정보로 표현한다. ID 및 isPartOf는 해당 언어·origin에 연결한다.
- /llms.txt는 한국어·영어 공개 링크와 실제 서비스 요약을 UTF-8 text/plain으로 제공한다. 비표준 /llm.txt 별칭은 추가하지 않는다. UA별 분기 없음.
- 2026-11-08 verify: 82 tests / 5,087 assertions 통과. --browser는 기존 test:e2e 부재로 기본 검사 후 exit 1.
- 빌드된 공개 HTML 10개의 JSON-LD 파싱·canonical 일치, 비공개/404의 스키마 제외, sitemap XML namespace 및 중복 없는 10개 URL을 확인했다. robots의 /api/ 차단과 llms의 소개 링크를 확인했다.
- QA/운영 origin, 공개/비공개 경로와 </script> 특수문자 직렬화를 회귀 테스트한다. 추가 사용자/평점/리뷰 정보는 생성하지 않는다.
- 외부 schema.org Validator는 실행하지 않았으며 로컬 타입·필드·JSON 검증만 통과했다. QA/운영 배포는 포함하지 않는다.
