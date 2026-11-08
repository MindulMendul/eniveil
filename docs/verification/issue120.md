# Issue 120 검증

- 기준: dev 68497ff, 구현 577cbe0. 로비의 작품 중복 목록을 제거하고 작품 선택은 모달에서만 제공한다.
- `bash scripts/codex/verify.sh`: 80 tests / 4,943 assertions, exit 0.
- `--browser`: 기존 PR 실행에서 기본 검사 성공 후 test:e2e 부재로 exit 1. 자동 e2e 통과로 취급하지 않는다.
- 2026-11-08 실제 Chromium, 자체 실행한 127.0.0.1:3210 서버, DATABASE_PATH=:memory: 사용.
- 한국어/영어 × 1440/320px: 작품 선택 모달에서 리허설 선택 후 생성, 1인 모드 시작·방 복귀, 다인 모드 전환, 별도 브라우저 세션의 코드 참가, 두 참가자의 게임 시작을 확인했다. 가로 넘침 없음.
- 기존 방 내부 모드 선택과 작품의 지원 인원 정책은 #121에서 별도로 정리한다. 운영·QA 서버 및 DB에 접근하지 않았다.
- 사용자 후속 댓글 https://github.com/MindulMendul/murder-parker/issues/120#issuecomment-6715653009 에서 "모달창에서만 볼 수 있도록" 지정했으므로 본문의 기존 카드/섹션 헤더 배치 후보보다 이 방향을 적용했다.
- 재현 스크립트: issue120/browser.cjs. 한국어·영어 × 1440/320px의 picker-*.png(작품 선택)와 joined-*.png(코드 참가 후 대기 화면)를 같은 디렉터리에 기록한다. 비공개 역할이 나오는 게임 화면은 캡처하지 않는다.
- 실행: 자체 메모리 DB 서버 3210을 띄운 뒤 DISPOSABLE_TEST_SERVER=1 PLAYWRIGHT_MODULE=/path/to/playwright node docs/verification/issue120/browser.cjs.
- CI 이미지의 zlib 보안 업데이트는 별도 PR에서 처리하며 이 PR은 해당 수정 병합 후 동일 Trivy 검사를 통과해야 한다.
