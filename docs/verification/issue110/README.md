# Issue 110 검증

## 변경 이유와 결과

첫 플레이 화면의 큰 안내 제목·게임 모드 패널을 제거하고 왼쪽 위 작은 방 만들기 버튼 아래 실제 서버 snapshot의 작품 목록을 바로 배치했습니다. 데스크톱은 네 열, 좁은 화면은 한 열로 표시합니다. 코드 입장은 접을 수 있으며 초대 URL의 코드가 있으면 자동으로 펼쳐집니다. 방 만들기는 기존 작품 선택 모달을 열고, 작품 카드에서는 해당 작품의 방을 생성합니다. 1인/다인 모드 선택은 기존대로 방 안에서 진행합니다.

카드는 snapshot.scenarios의 네 작품만 표시하며 가짜·중복 작품을 추가하지 않습니다. 서버의 준비 중 상태를 유지하고, 아직 확정되지 않은 준비 중 작품의 임시 인원·시간을 첫 화면에서 강조하지 않습니다.

## 검증

- Bun 1.4.4, `bash scripts/codex/verify.sh`: 타입 검사·빌드·61 tests / 4,800 assertions 통과.
- `bash scripts/codex/verify.sh --browser`: 같은 check/build/test 통과 후 기존 test:e2e 미구성으로 exit 1. 자동 브라우저 단계 통과로 보고하지 않습니다.
- 실제 Playwright/Chromium: 한국어·영어, 1440/768/375/320px에서 실제 작품 수·제목과 카드 일치, 카드의 빠른 노출(데스크톱 y214 / 320px y286), 작은 방 만들기 버튼, 기존 모달 열기·닫기, 작품 선택→방 생성→퇴장, 준비 중 버튼 비활성화, 코드 길이 검증, 가로 넘침 없음, pageerror 0을 확인했습니다.
- 독립된 실제 게스트 두 명: 방 생성→초대 URL 진입→코드 자동 입력·입장 폼 자동 펼침→같은 방 입장(2명)→퇴장 성공.
- `before-1440.png`, `before-320.png`은 변경 전, `after-ko-1440.png`, `after-ko-320.png`은 변경 후 실제 화면입니다. 상세 결과는 `browser-results.json`, 재현 스크립트는 `browser.cjs`입니다.
- `git diff --check` 통과. 기존 Astro pages 디렉터리/Svelte unused CSS 경고가 남아 있습니다.

로컬 테스트 전용 DB `/tmp/ready-110.sqlite`, 포트 3210을 사용했습니다. `browser.cjs`는 해당 서버와 환경의 Playwright(`/opt/codex/cua_node/lib/node_modules/playwright`), Chromium(`/usr/bin/chromium`)을 사용합니다. QA/main 승격·운영 배포는 수행하지 않았습니다.
