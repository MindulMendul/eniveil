# 브랜치 이름 규칙

일반 작업은 최신 `dev`에서 `<유형>/<짧은-목적>` 브랜치를 만들고 `dev`로 PR을 연다. 목적은 비워 둘 수 없으며, 소문자 영문·숫자와 하이픈으로 짧게 쓰는 것을 권장한다.

| 유형 | 용도 | 예시 |
| --- | --- | --- |
| `feat` | 새 기능 | `feat/room-invite` |
| `fix` 또는 `bugfix` | 버그 수정. 두 이름은 같은 의미 | `bugfix/reconnect-timeout` |
| `style` | 버튼·색상·간격 등 UI 디자인, 또는 코드 서식 정리 | `style/lobby-buttons` |
| `chore` | 의존성 갱신, 개발 도구 등 유지보수 | `chore/update-dependencies` |
| `refactor` | 동작을 유지하는 코드 구조 개선 | `refactor/room-state` |
| `docs` | 문서 수정 | `docs/cloud-setup` |
| `test` | 테스트 추가·개선 | `test/guest-session` |
| `ci` | CI 워크플로·자동화 변경 | `ci/branch-prefixes` |
| `build` | 빌드 설정·번들링 변경 | `build/astro-config` |
| `perf` | 성능 개선. 로딩 속도, 메모리 사용량, 쿼리 비용 등 | `perf/lobby-rendering` |

화면 디자인 작업은 `style/*`로 통일하며 `design/*`는 허용하지 않는다. UI 디자인과 코드 서식 변경이 각각 별도 목적이면 PR도 나눈다.

브랜치 접두사는 팀의 규칙이며 Git 자체의 표준은 아니다. 이 목록은 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)에서 사용하는 변경 유형을 참고한다. Conventional Commits는 커밋 메시지 규약이므로 브랜치 이름을 강제하지 않는다. `fix`와 `feat` 이외의 타입은 팀에서 선택한다.

커밋 및 PR 제목은 `AGENTS.md`의 `<type>(<scope>): <요약>`을 따른다. `bugfix/*`의 커밋 타입은 `fix`를 사용한다. 이 저장소의 `style/*` 브랜치는 UI 디자인도 포함하지만, 커밋 타입 `style`은 동작에 영향을 주지 않는 코드 서식을 뜻한다. UI 변경은 목적에 따라 `feat` 또는 `fix`를 사용한다. 예: `style/lobby-buttons`의 버그 수정 제목은 `fix(lobby): improve button contrast`로 쓴다.

`hotfix/*`(긴급 수정), `release/*`(릴리스 준비)도 다른 팀에서 사용하는 이름이다. 현재 저장소는 `dev → qa → main` 승격을 사용하므로 별도 흐름이 필요한 이 두 유형은 허용 목록에 포함하지 않는다. 긴급 수정도 현재는 `fix/*` 또는 `bugfix/*`에서 시작해 같은 검증·승격 절차를 따른다.

모든 일반 작업 유형은 `dev`만 대상으로 한다. `qa`는 같은 저장소의 `dev`에서, `main`은 같은 저장소의 `qa`에서만 승격한다. 필수 검증·리뷰·승인 후 일반 작업 PR은 병합 커밋(merge commit)으로 병합하고, 병합을 확인한 해당 작업 브랜치만 삭제한다. 환경 브랜치와 미병합 브랜치는 보존한다.

브랜치 유형만으로 미리보기 배포가 실행되지는 않는다. 미리보기 배포는 별도 설정이 필요하다.
