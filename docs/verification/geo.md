# GEO 공식 정보 검증 — 2026-11-09

#159. #146 초기 HTML 개선은 별도 PR로 검증·통합한다. #155에서 완료한 명칭 변경은 재구현하지 않는다.

공식 origin 기본값을 eniveil.com으로 통일하고 QA는 QA origin과 PUBLIC_INDEXABLE=false를 빌드에 전달한다. QA의 공개 페이지 canonical은 QA 자기 경로이고 robots meta는 noindex/nofollow, robots.txt는 전체 차단, sitemap은 빈 URL 목록이다. 운영은 정상 공개 설정을 유지한다. 구조화 데이터는 같은 운영자 Person @id와 실제 문의 경로를 사용한다. 공식 SNS가 확인되지 않아 sameAs는 생략했다. 새 회사·연락처·날짜·통계·FAQ는 만들지 않았다.

기본 verify exit0:108 tests/5,341 assertions·타입·빌드 통과. 배포 Python tests13개 통과. --browser는 test:e2e 부재로 exit1이며 아래 실제 Chromium 검증으로 보완한다.

운영·QA 두 빌드를 각각 실제 브라우저에서 ko/en×320/1440px×JS off/on8개씩, 총16개 조합으로 검증했다. 소개 본문·운영자·문의 링크, canonical·OG URL·JSON-LD의 실제 origin/페이지 일치, QA noindex, overflow0, JS-on axe0·페이지 오류0을 확인했다. QA 산출물의 공개10개 경로 canonical/noindex 및 robots 전체 차단·sitemap empty도 확인했다. 모두 자체 memory DB 로컬 서버이며 외부 앱 데이터 변경은 없다. 결과: geo/*.json.

이전 공개 도메인 `/en/about/?geo-check=1`은 HEAD 응답308과 `https://eniveil.com/en/about/?geo-check=1` Location을 반환해 경로·쿼리 보존을 확인했다. 외부 GEO 진단 도구 자체의 점수/본문80% 재측정은 수행하지 않았으며 검색 노출·AI 인용을 보장하지 않는다. QA 배포 후 실측은 승격 PR/이슈에 기록한다.
