# 로그인과 마이페이지

게스트와 구글 계정은 같은 닉네임 공간을 사용한다. 닉네임은 NFC로 저장하고 NFKC·소문자로 비교한다. 문자·숫자·밑줄을 허용하며 일반 이름은 2~10자, ASCII 영문·숫자·밑줄만 사용하는 이름은 4~20자다. 사용 가능 여부를 확인한 뒤에도 등록·변경 시 서버가 다시 검사한다. 기존 SQLite 사용자 데이터와 세션은 유지한다.

## 구글 설정

Google Cloud Console에서 OAuth 웹 클라이언트를 만들고 다음 값을 서버 환경에 설정한다. 저장소에는 비밀 값을 넣지 않는다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_ORIGIN`: 사용자에게 공개된 정확한 origin
- 승인된 리디렉션 URI: `${APP_ORIGIN}/api/platform/auth/google/callback`

서버는 Authorization Code와 PKCE를 사용한다. 로그인 state는 브라우저의 HttpOnly 쿠키에 결합하고 10분 후 만료되며 한 번만 사용한다. Google의 토큰 및 userinfo endpoint에서 확인한 `sub`를 계정 식별자로 사용한다. 이메일·Google 표시 이름·토큰은 앱의 사용자 응답에 넣거나 저장하지 않는다. 서버 재시작 중 진행하던 인증은 다시 시작해야 한다.

이슈 #73의 임시 구현 요청을 위해 개발 환경에서 `GOOGLE_AUTH_DEMO=true`를 명시하면 구글 버튼이 `(테스트)`로 표시되고 가상 계정으로 로그인한다. Google 서버와 통신하지 않으며 실제 구글 인증을 검증한 것으로 간주하지 않는다. `NODE_ENV=production`에서는 이 옵션이 무시되고 임시 로그인 endpoint가 503을 반환한다. 실제 OAuth 설정이 있으면 실제 인증을 우선한다. 설정이 없으면 구글 버튼에 설정 필요 오류를 표시하고 게스트 로그인을 제공한다.

## 세션과 데이터

서버가 발급한 30일 세션을 HttpOnly·SameSite=Lax 쿠키로 보관하고, 운영에서는 Secure도 적용한다. DB에는 세션 토큰의 SHA-256만 저장한다. 첫 구글 로그인에서 닉네임을 저장하기 전에는 대기방·창작 API를 사용할 수 없다.

로그아웃은 해당 계정의 모든 세션을 폐기한다. 게스트는 닉네임·작품·즐겨찾기를 삭제하고 UI에서 확인을 받는다. 구글 계정은 자료를 유지하고 같은 Google 계정으로 다시 접근한다. 게임 집계에 필요한 과거 참가 기록은 유지한다. 진행 중인 방에서 닉네임 변경·로그아웃은 409를 반환하므로 먼저 방에서 나와야 한다. 기존 WebSocket은 인증 만료 시 메시지 처리 및 다음 정기 broadcast에서 닫힌다.

`/mypage`, `/en/mypage`에서 닉네임 변경·로그아웃·본인 작품의 페이지별 목록과 편집 링크를 제공한다. 공개 창작마당의 접근 정책은 유지하며 제작은 로그인해야 가능하다.

## API

| 경로 | 기능 |
| --- | --- |
| `GET /api/platform/account` | 세션 복원, 계정 종류, 닉네임 필요 여부 |
| `GET /api/platform/auth/config` | 실제 인증·개발 임시 로그인 활성 상태 |
| `GET /api/platform/nicknames/availability?nickname=...` | 닉네임 사용 가능 여부 |
| `POST /api/platform/guest` | 게스트 생성 |
| `POST /api/platform/account/nickname` | 본인 닉네임 최초 설정·변경 |
| `POST /api/platform/account/logout` | 세션 폐기 및 게스트 자료 삭제 |
| `GET /api/platform/auth/google?locale=ko` | 구글 인증 시작 |
| `GET /api/platform/auth/google/callback` | state 확인·코드 교환·세션 발급 |
| `POST /api/platform/auth/google/demo` | 개발 환경에서만 임시 인증 |

닉네임은 게스트 등록·변경 모두 `{ "nickname": "새닉네임" }`으로 전달한다. 중복은 409, 입력 오류는 400, 인증 누락은 401이다. 마이페이지 작품은 기존 `GET /api/workshop/stories?view=mine`을 사용하며 소유권은 서버에서 판정한다.
