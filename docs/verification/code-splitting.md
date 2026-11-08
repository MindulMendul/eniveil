# Screen code splitting

## Change

The App shell keeps entry, lobby, waiting room, account/session state, header and navigation available immediately. Workshop browsing, the workshop editor, account page, solo investigation and multiplayer game use dynamic imports. The floating friends drawer imports its panel when opened. Shared `LazyContent` renders localized loading/error states; an import failure offers a full refresh so deployments with missing old chunk URLs can recover.

An eager solo-room lifecycle wrapper registers exit/recovery handlers before the solo chunk loads. The deferred game retains gameplay abandonment tracking, without duplicating room exits.

No manual vendor chunk configuration or server/API behavior changes are required. Shared schema validation and telemetry still load separately; this is a screen boundary change, not a claim that all initial JavaScript has been deferred.

## Bundle measurement

Production builds with Bun 1.4.4, same dependencies and configuration; baseline dev `a372845`:

| App entry module | Before | After |
| --- | ---: | ---: |
| Uncompressed bytes | 244,262 | 55,527 |
| gzip bytes | 73,118 | 18,685 |

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

- Solo-room regression: held the solo chunk pending, then navigated to the account page or reloaded. Both restored the same room to waiting, and instrumentation confirmed one exit beacon. A normally loaded solo screen also returns to its room.

## Further entry reduction

The follow-up starts at dev `70bb8a3` (PR #145). Entry, lobby, waiting room, header/footer, story picker, friends drawer and nickname onboarding now have separate navigation/visibility boundaries. Core account/socket ownership and the eager solo exit lifecycle remain in the shell. The picker is only mounted when opened.

`pendingSoloExit` no longer imports the shared schema runtime just to check tab storage. It only restores a record whose room ID and attempt ID exactly match the active server-provided room, and returns those canonical server fields. Server-side request validation is unchanged. Added regression tests for malformed/missing/mismatched records, canonical field projection and legacy null attempts.

All follow-up sizes below use Node `gzipSync` at its default level 6, consistently for both builds. The earlier entry measurement used Python's default level 9.

| Measurement | PR #145 baseline | Follow-up |
| --- | ---: | ---: |
| App entry bytes | 55,527 | 28,241 |
| App entry gzip bytes | 18,816 | 9,976 |
| Home-requested JS bytes | 429,587 | 308,246 |
| Home-requested JS per-file gzip sum | 141,463 | 107,603 |

Home figures come from actual Chromium response bodies in fresh browser contexts on disposable local servers, waiting for the entry screen to render and recording its JavaScript requests. gzip is computed per downloaded file, not inferred from an uncompressed HTTP transfer size. Telemetry and the Svelte runtime are included and unchanged. The entire initial payload is therefore **not** under 10 KB; the App entry is.

Follow-up checks:

- `verify.sh --browser`: check/build and 95 tests / 5,193 assertions pass. As before, the wrapper exits 1 because `test:e2e` is absent; separate real Chromium checks supply the browser evidence.
- Korean desktop and English mobile home omit lobby/room/picker/drawer/schema chunks. Workshop, solo and editor navigation, dirty-editor cancellation, account settings, friends panel focus and two-player game start pass.
- Opening the story picker loads its chunk and its close action works. Nickname onboarding loads its own chunk, saves the nickname and reaches the lobby.
- Delayed-import navigation, failed-import refresh recovery, and solo-room navigation/reload while the game chunk is blocked all pass. Solo exits remain single-shot and restore the same room.
- No uncaught browser exceptions. No QA/main promotion or production deployment.
