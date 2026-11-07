# 공개 창작 1인 플레이 (#87)

공개 창작 작품 상세 화면의 `플레이하기`에서 기존 1인 수사 엔진으로 연결합니다. 현재 엔진이 지원하는 시작→조사→결말 3장면, 1인·3개 증거 제출 방식만 허용합니다. 비공개·없는 작품, 손상된 파일, 다인/다른 분기 방식은 서버가 거절하고 화면에서 이유를 알립니다.

플레이 시작 때 검증한 원본 패키지를 `story_runs.package_json`에 비공개로 고정합니다. 같은 버전의 내용 수정이나 비공개 전환·서버 재시작 뒤에도 시작한 플레이는 해당 원본으로 계속됩니다. 비공개 전환 후 새 플레이는 거절합니다. 업로드 파일에 들어 있던 ID 대신 창작마당 저장 ID로 플레이·평점·통계를 연결합니다.

미리보기 API는 작품 메타데이터만 제공합니다. 시작 응답은 수사 UI에 필요한 mechanics를 허용 목록으로 구성하며 solution, revealsTruth, 원본 정보/역할/아이템, 전체 scenes를 포함하지 않습니다. 장면 cues는 현재 장면과 성공한 고발의 결말에서만 전달합니다. 세션 ID는 기존 엔진과 동일한 예측 불가능한 플레이 capability이므로 공개 목록이나 로그에 기록하지 않습니다.

검증:

- `bash scripts/codex/verify.sh --browser`: 타입 검사·빌드와 65 tests / 4,846 assertions 통과 후 기존 `test:e2e` 부재로 exit 1. 자동 브라우저 단계가 성공한 것은 아닙니다.
- 서버 회귀 4개: 공개 응답의 비밀/장면 비노출, 같은 버전 수정·비공개·DB 재개방 후 원본 고정, private/missing/invalid/multiplayer/추가 장면/불가능한 중복 증거 작품 거절, canonical ID와 버전별 플레이·평점 분리.
- 실제 Chromium: 1280px 한국어 공개 카드→시작→조사→결말→평점→창작마당 복귀. 플레이 중 수정·비공개 전환에도 기존 장면 유지, 새 시작 거절, 창작 ID의 플레이 1·평점 5와 원본 파일 ID의 플레이 0 확인.
- 320px 영어 화면에서 수정된 새 버전 시작·조사, 가로 넘침 없음. 지원하지 않는 작품의 안내와 시작 버튼 비활성화도 확인. 런타임 pageerror 0.
- 결과는 `browser-results.json`, 화면은 `desktop-play-entry.png`, `mobile-opening.png`, `mobile-investigation.png`입니다. 결말·수집 증거를 담은 화면과 세션 ID/쿠키는 게시하지 않습니다.

재현 환경:

1. 저장소 루트에서 Bun 1.4.4와 잠금 의존성을 준비하고 `bun run build`를 실행합니다.
2. 테스트 전용 DB와 포트로 서버를 실행합니다: `DATABASE_PATH="${TEST_DB_PATH:-/tmp/workshop-play-verification.sqlite}" PORT=3287 bun apps/server/src/index.ts`. 기존 DB에는 테스트 작품과 계정을 만들므로 운영 DB를 사용하지 않습니다.
3. Playwright와 Chromium을 준비한 뒤 `node docs/verification/issue87/browser.cjs`를 실행합니다. 표준 `playwright` 패키지와 Playwright 브라우저를 기본 사용하며 `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `BASE_URL`, `OUTPUT_DIR`로 환경에 맞출 수 있습니다. 결과/화면 폴더는 자동 생성합니다. 실행마다 임시 테스트 계정·작품을 만듭니다.
4. 서버를 종료하고 테스트 DB·WAL·SHM 파일을 정리합니다.

QA/main 승격과 운영 배포는 포함하지 않습니다. 최신 PR head의 CI·SonarCloud·Qodo와 필요한 사람 승인 확인 후 dev 병합 대상입니다.
