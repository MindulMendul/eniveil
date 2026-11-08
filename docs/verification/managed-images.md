# 공통 WebP 및 창작 UI 숨김 검증 — 2026-11-08

기본 `bash scripts/codex/verify.sh` exit0. 타입 검사·빌드와 Bun98 tests/5,237 assertions 통과. `--browser` wrapper는 test:e2e 부재로 exit1이며 아래 실제 Chromium 검증으로 보완한다.

자체 `DATABASE_PATH=:memory: PORT=3235 APP_ORIGIN=http://127.0.0.1:3235` 서버와 동일 origin/redirect 차단 guard를 사용했다. QA/운영 데이터에는 접근하지 않았다.

Chromium155, 한국어/영어 × 1440/320px에서 다음6개 상태(총24)를 검증했다. 각 화면은 axe wcag2a/aa, wcag21aa, best-practice 위반0, 가로 넘침0, 파일 입력창0, 작성/수정 버튼0이다.

1. 익명 창작마당.
2. 소유자 창작마당. 소유권이 있는 공개/비공개 작품은 API로 자체 서버에 준비했다. 이전 캐시의 외부 PNG URL을 응답에 주입해도 외부 요청0이고 관리 기본 이미지로 표시됨을 확인했다.
3. 소유자 작품 상세 모달. 플레이와 닫기/Escape는 사용 가능하며 수정 진입은 없다.
4. 소유자 마이페이지. 기존 작품이 보이고 비공개 초안 삭제는 유지되며 수정은 없다.
5. 이전 편집 URL. redirect를 자동으로 따르지 않고302 및 정확한 같은 origin 창작마당 경로를 검사한 뒤 목적지를 브라우저로 열어 확인했다.
6. 방 만들기의 작품 선택. 초대장 이미지는 관리 WebP를 사용한다.

브라우저에서 로드한 image 응답의 MIME=image/webp 및 RIFF/WEBP signature를 검사했다. favicon·초대장·한/영 OG4개도 실제 HTTP 응답으로 확인했다. 빌드의 이미지 파일 목록은 이4개 WebP뿐이고 원본 PNG/SVG는 public 밖에 있다.

공통 변환 모듈을 브라우저 ESM으로 직접 호출했다. PNG/JPEG/GIF/WebP를 인코딩하고 실제 WebP signature·MIME 및 디코딩 결과를 확인했다. 잘못된 형식, 10MiB 초과와 브라우저의 PNG 인코더 fallback은 거절했다. 별도 입력/다운로드 UI는 사용하지 않았다.

익명화 결과: `managed-images/results.json`. 브라우저 코드의 픽셀 제한·형식 헤더·JPEG 메타데이터 스캔과 정적 자산의 실제 인코딩/디코딩·치수·입력 URL 정책은 저장소 테스트에도 포함한다. GIF/애니메이션 입력의 첫 프레임 처리와 향후 자산 관리/제작기 범위는 `docs/workshop-authoring-plan.md`에 기록했다.

추가 통합 검증: 최신 dev의 화면 지연 로딩을 보존해 병합한 뒤 기본98 tests/5,237 assertions와 동일24개 브라우저 상태를 다시 통과했다. OG 생성기는 이제 public 밖의 실제 원본 경로를 갱신한다. 재생성 후 앱 빌드를 수행해 한국어·영어 원본 PNG와 WebP 산출물4개의 SHA256이 모두 변경되는 것을 확인했다(`og-regeneration.json`). 공유 카드의 창작 CTA도 숨김 상태에 맞춰 탐색/플레이로 정리했다.
