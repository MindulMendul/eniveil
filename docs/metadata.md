# 검색·공유 메타데이터

홈, 창작마당, 이용약관, 개인정보 처리방침의 한국어·영어 페이지는 빌드된 HTML에
설명, canonical, hreflang, Open Graph, Twitter large image와 JSON-LD를 포함한다.
로그인한 사람의 닉네임, 방 코드, 초안 본문은 메타데이터에 넣지 않는다.
마이페이지·편집 화면·404는 noindex이며 sitemap에 포함하지 않는다.
검색 봇이 noindex를 읽을 수 있도록 해당 HTML은 robots.txt로 차단하지 않는다.
클라이언트 경로·언어 전환에도 메타 태그를 갱신한다. 접근 권한은 서버가 검사한다.

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
대표 공유 이미지는 직접 제작한 한국어·영어 1200×630 PNG다. 현재 브랜드명과
디자인 토큰의 색상, 선택지가 갈라지는 책 삽화를 사용하며 외부 사진에 의존하지 않는다.
`apps/web/public/og/story-archive-{ko,en}-v1.png`를 정적 파일로 제공한다.
공개 페이지에만 og:image(타입·크기·대체 설명 포함)와 twitter:image를 넣으며,
이미지의 절대 URL은 PUBLIC_SITE_URL을 따른다. 언어 전환 시 이미지도 교체한다.

이미지 재생성은 Pillow와 Noto Sans CJK 폰트가 설치된 환경에서 다음 명령으로 한다.
앱 빌드는 체크인한 PNG를 사용하므로 이미지 제작 도구를 요구하지 않는다.

```sh
python3 scripts/seo/generate-og.py /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

이미지가 변경되면 파일명 버전과 metadata.ts의 경로를 함께 올려 공유 캐시를 구분한다.
배포 후 공유 서비스의 기존 미리보기는 재수집 전까지 이전 캐시를 표시할 수 있다.
