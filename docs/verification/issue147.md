# 창작마당 메뉴 임시 숨김

헤더 내비게이션에서 창작마당 링크만 제거했다. `/workshop/`과 `/en/workshop/` 직접 접근과 검색 색인 설정은 유지한다.

메뉴를 복구하려면 `apps/web/src/widgets/app-header/ui/AppHeader.svelte`의 주 메뉴 안에 다음 링크를 다시 추가한다.

```svelte
<a class="text-button" href={localePath(locale, "/workshop")}>{t("workshopNav")}</a>
```

## 검증

- `bash scripts/codex/verify.sh`: 94 tests, 5,176 assertions 통과.
- `bash scripts/codex/verify.sh --browser`: 기본 검증 통과 후 `test:e2e` 미구성으로 종료 코드 1.
- 테스트 전용 메모리 DB와 Chromium에서 한국어·영어 × 1440·320px: 로그인 후 헤더 메뉴에 창작마당 링크가 없고, `/workshop/` 또는 `/en/workshop/` 직접 접근·새로고침이 동작했다. 가로 넘침과 페이지 오류는 없었다.
