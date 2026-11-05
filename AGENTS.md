# 저장소 작업 규칙

## 브랜치 흐름

- `main`은 운영 기준, `dev`는 통합 기준, `qa`는 QA 배포 기준이다.
- 짧은 작업 브랜치는 최신 `dev`에서 만들고 `dev` 대상으로 PR을 연다. 이름은 `feat/<kebab-case>`, `fix/<kebab-case>`, `refactor/<kebab-case>`, `docs/<kebab-case>`, `chore/<kebab-case>` 형식을 쓴다.
- QA 승격은 `dev → qa` PR, 운영 승격은 QA 확인 후 `qa → main` PR로 한다. 환경 브랜치에 직접 push하거나 강제 push하지 않는다.
- QA 승격 전에 `dev`가 최신 `main`을 포함하는지 확인한다. 포함하지 않으면 별도 `main → dev` 동기화 PR을 먼저 열어 충돌을 해결하고 검증한다. 브랜치를 초기화하거나 덮어써서 이력을 맞추지 않는다.
- 작업 PR은 한 가지 목적을 다루고 스쿼시 병합한다. 환경 승격 PR은 검증된 커밋 이력을 보존하도록 병합 커밋을 사용한다.

## 커밋과 검증

- 커밋 및 PR 제목은 `<type>(<scope>): <요약>` 형식으로 쓴다. 예: `feat(workshop): add story catalog`.
- 타입은 `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore` 중에서 고른다. 요약에는 변경 목적을 짧게 쓴다.
- 병합 전에 `bun run verify`를 통과해야 한다. SonarCloud Quality Gate가 실패하면 기본적으로 승격을 보류하고 원인을 해결한다. 예외는 저장소 관리자가 범위와 사유를 확인해 명시적으로 승인하고 PR에 기록한다.
- 완료 보고에는 변경 이유, 검증 결과, 남은 제약을 적는다.

## 저장소 설정

- `dev`, `qa`, `main`의 보호 규칙과 필수 체크는 GitHub 설정에서 별도로 관리한다. 이 문서나 코드 변경만으로 브랜치 보호가 적용되지는 않는다.
- 보호 설정은 PR 병합을 사용하고, `verify`를 필수 체크로 지정하는 것을 기본으로 한다. SonarCloud를 필수 체크로 둘지는 저장소 설정에서 명시한다.
