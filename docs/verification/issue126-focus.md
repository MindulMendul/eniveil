# Issue 126 — focus recovery and accessibility regression

PR #138의 포커스 리뷰 3건과 추가 회귀 검사에서 발견한 문제를 보완한다.

- 서버 단계·스냅샷 갱신 중 연결된 조작 요소의 포커스를 유지한다. 화면/조작 요소 제거로 포커스를 잃었을 때만 새 main으로 복구한다.
- 경로·언어 이동은 최종 본문으로 이동한다. 계정 조회 중 언어를 바꿔도 요청을 보존하며 임시 로딩 main은 사용하지 않는다.
- 로그인 초기화, 1인 시작·다른 탭의 소유권 안내·복귀를 처리한다. 열린 dialog를 존중하고 관찰자는 앱 종료 시 해제한다.
- 게임 단계 글자는 기존 고대비 muted 토큰을 사용하고 현재 단계의 gold를 명시한다. 실제 게임 화면의 axe color-contrast 위반을 수정했다.
- 다른 탭에서 열린 1인 수사 안내에도 h1을 제공한다. page-has-heading-one 위반을 수정했다.
- 창작마당 상세 모달은 제목에 초기 포커스를 둔다. Orca가 첫 버튼만 읽고 제목을 생략하던 경우를 보완했다. 닫기 버튼의 primary/secondary 중복도 제거해 color-contrast 위반을 수정했다.

## 2026-11-08 검증

- 최종 `bash scripts/codex/verify.sh`: 91 tests, 5,162 assertions, 실패0. 정책 단위 테스트 5개/13 assertions 포함. 타입 검사 오류0(기존 CSS 경고1), Astro 빌드 통과.
- `--browser` wrapper는 기본 검사 후 test:e2e 부재로 exit1이었다. 이를 통과로 표시하지 않으며 아래 실제 Chromium 시나리오와 axe 검사로 보완했다.
- 한국어·영어 × 1440/320 CSS px에서 실제 포커스 시나리오 12건 통과: 로그인 상태 새로고침, 다른 참가자의 단계 변경, 투표 집계/버튼 제거, 1인 시작/소유권/복귀, 계정 로딩 중 언어 변경.
- 같은 4개 조합에서 건너뛰기, 필드 오류 연결/값 보존, SPA 이동, 상세 모달 Tab 순환/Escape/호출자 복귀/호출자 제거 시 본문 복귀, 200% 글자/간격/동작 감소/320px 재배치 통과.
- axe-core wcag2a, wcag2aa, wcag21aa, best-practice: 일반 화면 36개(`axe-results.json`), 게임·투표·1인·언어 변경 상태 32개(`axe-focus.json`), 열린 상세 모달 4개(`axe-dialog.json`), 총72개 상태에서 최종 위반0.

재현 파일은 `issue126-focus/`에 있다. 자체 메모리 DB 서버를 `DATABASE_PATH=:memory: PORT=3211 APP_ORIGIN=http://127.0.0.1:3211 GOOGLE_AUTH_DEMO=true`로 실행한다. 외부 요청 차단과 disposable-test guard를 유지한다. 외부 인증이나 QA 데이터를 쓰지 않는다.

```sh
DISPOSABLE_TEST_SERVER=1 PLAYWRIGHT_MODULE=/path/to/playwright AXE_PATH=/path/to/axe.min.js node docs/verification/issue126-focus/browser.cjs
DISPOSABLE_TEST_SERVER=1 PLAYWRIGHT_MODULE=/path/to/playwright AXE_PATH=/path/to/axe.min.js node docs/verification/issue126-focus/keyboard.cjs
DISPOSABLE_TEST_SERVER=1 PLAYWRIGHT_MODULE=/path/to/playwright AXE_PATH=/path/to/axe.min.js node docs/verification/issue126-focus/audit.cjs
```

## 실제 스크린리더 조합과 범위

Debian 13, 실제 Orca 48.1 + AT-SPI 2.56.2 + Speech Dispatcher 0.12/espeak-ng + headed Chromium 155.0.8059.79를 사용했다. DOM/ARIA 모의 응답이 아니라 AT-SPI 이벤트를 읽는 실제 Orca의 SPEECH OUTPUT을 확인했다. `native-orca.cjs`와 `orca-results.json`에 시나리오와 익명화된 결과를 남긴다.

한국어·영어 × 1440/320 CSS px에서 각15개, 총60개 실제 낭독 checkpoint가 통과했다: 닉네임/로그인 버튼, 코드 입력, 필터 접힘/펼침과 검색, 상세 제목/닫기 복귀, 창작 제목/저장 버튼, 계정 설정/로그아웃/탈퇴 버튼, 방 시작/1인 플레이 복귀 버튼. 키보드 전체 동작 검증과 구분해 실제 읽기 문자열을 확인한 범위를 기록했다.

환경은 시스템 패키지를 변경하지 않고 공식 Debian 패키지를 작업 경로에 추출했다. 추출 경로를 맞추고, 종료된 zombie 프로세스를 실행 중인 reader로 오인하지 않도록 launcher의 liveness 확인을 보정하고, debug 파일을 line-buffered로 열었다. 읽기·포커스·음성 생성 로직은 변경하지 않았다. 전용 D-Bus/X11/Xauthority, 자체 브라우저 창과 로컬 메모리 DB만 사용했다.

일반 설치 Orca로 재현하려면 전용 데스크톱에서 `orca --debug-file /tmp/orca-debug.out`를 실행한 후 같은 DISPLAY/D-Bus에서 다음을 사용한다. debug 파일은 줄 단위로 flush되어야 한다. 창 관리자 없는 테스트 X11에서는 동봉한 focus-window.py로 자체 Chromium 창에만 native focus를 준다.

```sh
DISPOSABLE_TEST_SERVER=1 ORCA_DEBUG_LOG=/tmp/orca-debug.out PLAYWRIGHT_MODULE=/path/to/playwright node docs/verification/issue126-focus/native-orca.cjs
```

제약: 합성 음성은 ALSA null 출력으로 보내고 생성된 낭독 문자열을 검사했다. 사람의 청취·한국어 발음/원어민 이해도, NVDA/VoiceOver, 실제 iOS/Android 보조기기, 모든 WCAG 2.2 항목의 완전한 적합성 인증을 의미하지 않는다. OAuth 제공자 화면은 외부 인증 없이 버튼 이름까지만 확인했다. 이 Orca 시나리오에서 계정 삭제·로그아웃은 버튼 이름·역할까지만 검사했고 실제 삭제는 수행하지 않았다. 게임 규칙/시간제한과 QA/운영 배포는 변경하지 않았다. 역할 비밀·토큰이 포함될 수 있는 원시 Orca 로그는 업로드하지 않는다.

재현 스크립트는 한 줄로 압축하지 않고 조건문·오류 생성을 명시했다. 스크린리더/실시간 게임의 순서를 유지하는 runSequential을 사용하며, X11 조회 실행 파일은 /usr/bin/xwininfo로 고정해 PATH 검색을 제거했다. 분석 규칙 제외나 Quality Gate 우회는 하지 않았다.

최종 재현기는 60개 전체 행렬을 강제하며 부분 실행 스위치를 두지 않는다. 고유한 문서 제목으로 자체 Chromium 창을 찾아 정확히 하나일 때만 native focus를 준다. 각 action 이후 로그 오프셋에서 언어별 실제 이름·역할을 확인하고 spoken 문자열을 결과에 남긴다. Orca의 역할·접힘/펼침 상태 어휘는 reader 설정인 영어이며 UI 이름은 각각 한국어·영어다. 펼침은 직전에 이름이 확인된 summary의 포커스와 open 상태를 함께 확인한 뒤 상태만 읽는 Orca 출력을 검사한다. 일반 axe 감사도 JSON 저장 뒤 위반0 및 화면36개를 assert하고 성공을 출력한다.

엄격 검증 최종 실행은 부분 합산 없이 한 세션에서 한·영 × 두 화면 폭의 60개 checkpoint를 모두 통과했다. 최종 이름/역할 패턴 표도 그 실제 spoken 60개 전체에 다시 대조해 통과했다.
