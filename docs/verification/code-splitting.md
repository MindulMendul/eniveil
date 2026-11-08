# Screen code splitting

## Change

The App shell keeps entry, lobby, waiting room, account/session state, header and navigation available immediately. Workshop browsing, the workshop editor, account page, solo investigation and multiplayer game use dynamic imports. The floating friends drawer imports its panel when opened. Shared `LazyContent` renders localized loading/error states; an import failure offers a full refresh so deployments with missing old chunk URLs can recover.

No manual vendor chunk configuration or server/API behavior changes are required. Shared schema validation and telemetry still load separately; this is a screen boundary change, not a claim that all initial JavaScript has been deferred.

## Bundle measurement

Production builds with Bun 1.4.4, same dependencies and configuration; baseline dev `a372845`:

| App entry module | Before | After |
| --- | ---: | ---: |
| Uncompressed bytes | 244,262 | 54,613 |
| gzip bytes | 73,118 | 18,377 |

These figures describe the App entry module, not total first-load traffic. Vite also extracts shared dependencies, and telemetry is unchanged. The browser request checks below confirm that screen chunks themselves are absent until used.

## Verification

- `bash scripts/codex/verify.sh --browser`: type checks, production build and 94 tests / 5,176 assertions pass. The wrapper exits 1 because the repository has no `test:e2e` command; it was not reported as passing.
- Separate real Chromium/Playwright checks used a dedicated SQLite database and local server on port 3088 with development demo accounts. No production account, database or deployment was used.
- Korean at 1440px and English at 320px: home requests no workshop/editor/account/solo/game/friends screen chunk. Workshop loads its chunk on entry, opens the selected story, loads the solo chunk only when playing, and returns to workshop. One main landmark and no horizontal overflow.
- Signed-in account page and editor each load their own chunks. Editor unsaved-change cancellation preserves the input; accepting navigation opens the account page.
- Friends panel chunk is absent before opening the floating drawer; opening loads it and closing restores focus to the friends button.
- Two authenticated browser contexts join a room and start a multiplayer game. Both request and render the game chunk after start.
- Delaying an account chunk shows the loading status. Navigating back before it completes prevents the old account screen from mounting afterwards.
- Aborting a workshop chunk shows the localized error and refresh action. Restoring the request and refreshing recovers the workshop.
- No uncaught browser exceptions in the successful flows or the handled import failure.
