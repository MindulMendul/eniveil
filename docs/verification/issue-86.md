# Issue 86 verification

The editor starts with a private, valid fictional solo-investigation template. It edits title, description, scene IDs/connections and dialogue. Advanced package fields remain intact; graph editing and mechanics editing are outside this issue.

- `bash scripts/codex/verify.sh`: passed, 41 tests / 442 assertions, including server owner authorization and new template/roundtrip/reference tests.
- `bash scripts/codex/verify.sh --browser`: its standard checks passed; the wrapper then reported the existing missing `test:e2e` script. Browser evidence below supplies the separate UI check.
- Chromium (Playwright, built static app, mocked account/workshop API): English and Korean; 320px layout without horizontal overflow; keyboard Tab from title to description; scene/dialogue add/delete; broken next-scene reference blocks save; rejected save preserves title; save/reload preserves dialogue; download/import restores edited package; back button discard cancellation preserves input. Screenshots captured locally at `/tmp/issue86-en-320.png` and `/tmp/issue86-ko-320.png`.
- Model tests export/import the full package including assets, choices, wait cues and investigation mechanics without loss. Missing references, duplicate scene IDs and blank dialogue are rejected.

UI requests were mocked for deterministic failure and reload scenarios. Actual source ownership and persistence remain covered by the existing server integration tests. QA/main promotion and deployment were not performed.
