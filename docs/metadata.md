# 검색·공유 메타데이터

홈, 창작마당, 이용약관, 개인정보 처리방침의 한국어·영어 페이지는 빌드된 HTML에
설명, canonical, hreflang, Open Graph, Twitter summary와 JSON-LD를 포함한다.
로그인한 사람의 닉네임, 방 코드, 초안 본문은 메타데이터에 넣지 않는다.
마이페이지·편집 화면·404는 noindex이며 sitemap에 포함하지 않는다.
robots.txt의 제외 규칙은 접근 권한 검사를 대체하지 않는다.

`PUBLIC_SITE_URL`은 빌드 시 사용할 공개 origin이다. 기본값은 운영 도메인이다.
로컬/별도 미리보기는 빌드 전에 실제 origin을 지정한다. 쿼리·경로·사용자정보가 들어간
값은 허용하지 않는다. OCI 배포는 대상 origin을 Docker build argument로 전달하므로
QA의 canonical과 sitemap은 QA 도메인을 사용한다. 런타임 APP_ORIGIN 변경만으로
이미 빌드된 HTML 메타데이터가 바뀌지는 않는다.

```sh
PUBLIC_SITE_URL=https://qa-mindul-murder-mystery.duckdns.org bun run build
```

GEO는 검색 시스템이 읽을 수 있는 구조화된 페이지 정보를 제공하는 범위다.
검색 노출·순위·AI 답변 채택을 보장하지 않으며 실제 색인은 서비스 배포 후 확인한다.
대표 공유 이미지는 별도 콘텐츠가 정해지지 않아 임의의 외부 이미지를 지정하지 않았다.
