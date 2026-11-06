# Issue 86 verification

The editor starts with a private, valid fictional solo-investigation template. It edits title, description, scene IDs/connections and dialogue. Advanced package fields remain intact; graph editing and mechanics editing are outside this issue.

- `bash scripts/codex/verify.sh`: passed, 45 tests / 479 assertions, including server owner authorization and new template/roundtrip/reference tests.
- `bash scripts/codex/verify.sh --browser`: its standard checks passed; the wrapper then reported the existing missing `test:e2e` script. Browser evidence below supplies the separate UI check.
- Chromium (Playwright, built static app, mocked account/workshop API): English and Korean; 320px layout without horizontal overflow; keyboard Tab from title to description; scene/dialogue add/delete; broken next-scene reference blocks save; rejected save preserves title; save/reload preserves dialogue; download/import restores edited package; back button discard cancellation preserves input. Screenshots captured locally at `/tmp/issue86-en-320.png` and `/tmp/issue86-ko-320.png`.
- Model tests export/import the full package including assets, choices, wait cues and investigation mechanics without loss. Missing references, duplicate scene IDs and blank dialogue are rejected.

An additional Chromium run used the real Bun HTTP/WebSocket server and in-memory SQLite on port 3027, without API mocks: guest creation, private save/reload/edit, import cancel/confirm, and two-account source/write isolation all passed. Mocked UI requests were retained for deterministic failure scenarios. Actual source ownership and persistence remain covered by the existing server integration tests. QA/main promotion and deployment were not performed.

Review fixes: import requires discard confirmation; untouched template starts clean; scene renames update start/next/choice/information references; scenes referenced by preserved choices/information cannot be deleted; raw validated imports retain whitespace and omitted defaults; compact JSON gives import/save/export the same 900 KB package policy.

PR: https://github.com/MindulMendul/murder-parker/pull/90. The initial head passed verify, branch-flow, GitGuardian and SonarCloud. Qodo findings were addressed in the following review commit; final head checks and re-review are recorded in the PR before merge.

Final review: scene IDs are staged outside the package and committed on field change only when syntactically valid and unique. Invalid/unfinished renames block save/export without rewriting any links. A duplicate-ID regression checks that correcting the proposed ID preserves other scenes’ targets. Browser tests are owned by `apps/web/tests` and run in the root test command; the server no longer imports web page modules for tests. Latest dev (including #88) was merged and the combined verification passed.
