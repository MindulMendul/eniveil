# Issue 88 verification

Private drafts can be deleted individually from My page. The server checks the authenticated owner and rejects published drafts. An IMMEDIATE SQLite transaction deletes the draft and its favorites together; quotas derive from retained rows, so count and bytes are restored without separate counters. Historical play data is left intact.

- `bash scripts/codex/verify.sh`: passed, 41 tests / 451 assertions.
- New integration coverage: anonymous/other owner rejected, public draft rejected, draft source/detail/update absent after deletion, retries return 404, unrelated owner/public records retained, favorites removed, count and byte capacity recovered. A SQLite failure trigger verifies draft/favorites rollback and continued quota enforcement before a successful retry.
- Playwright Chromium against built app with mocked APIs: ko/en, 320px without horizontal scrolling, confirmation includes title, Cancel and Escape preserve data and restore button focus, network failure remains in dialog, retry succeeds, 404 retry reconciles list, deletion of last item on page 2 returns to page 1, empty list appears after final deletion, focus moves to My stories heading, published story has no delete button.
- Local screenshots: `/tmp/issue88-en-320.png`, `/tmp/issue88-ko-dialog.png`.

The repository does not configure `test:e2e`; browser verification was run separately. UI requests were mocked, with actual authorization/transaction/quota behavior covered by server tests. QA/main deployment was not performed.
