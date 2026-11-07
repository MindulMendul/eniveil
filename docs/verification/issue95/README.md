# Issue 95 room-list verification

The list uses the same `joinError` rule as room admission: a room must still be waiting and below its current capacity. A participant continues to receive their own room in the private `room` snapshot even when it is absent from the public `rooms` list. Solo mode uses its one-player capacity and an active solo attempt remains hidden after its member disconnects.

## Results

- `bash scripts/codex/verify.sh --browser`: check/build succeeded; 63 tests and 4,811 assertions passed. The wrapper exits 1 because the repository does not configure `test:e2e`; this is not reported as a passing automated browser run.
- Actual Chromium with three isolated guest contexts and the running test server: an available waiting room appeared; filling the final seat hid it in the WebSocket snapshot and fresh HTTP state; a guest leaving restored it; filling it again hid it; starting the game kept it hidden. No page errors occurred. See [`browser-results.json`](browser-results.json).
- `git diff --check` passed.

## Reproduce the browser check

Build the web app, start a server with a clean test database, and run the Playwright script in a second terminal. The browser script creates three guest sessions, exercises room listing and joining through HTTP/WebSocket, and closes all browser contexts on completion.

```sh
PORT=3215 DATABASE_PATH=/tmp/issue95-browser.sqlite APP_ORIGIN=http://127.0.0.1:3215 bun apps/server/src/index.ts
BASE_URL=http://127.0.0.1:3215 node docs/verification/issue95/browser.cjs
```
