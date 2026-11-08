# Browser verification safety

The issue-specific browser scripts for issues 95, 97, 98, 102, and 110 write test state. Run them only against a local server that you started yourself with `DATABASE_PATH=:memory:`. Each script requires `DISPOSABLE_TEST_SERVER=1` and accepts only an exact `http(s)://localhost`, `127.0.0.1`, or `[::1]` origin without credentials or a path. It rejects remote targets even when the flag is set.

Each browser context blocks service workers and installs request guards before creating pages. The guards allow only the configured origin, refuse every HTTP redirect instead of following it, and allow WebSockets only to that same origin. Playwright API requests use `maxRedirects: 0` and reject redirect responses. These scripts require Playwright WebSocket routing support. If an app route begins redirecting, verification fails until that behavior is reviewed.

The explicit flag acknowledges that a script may create guest sessions, rooms, or delete its disposable account. Stop the owned test server after the run; its in-memory database disappears with the process. The scripts do not clean up data on another server.

Run the pure target checks with:

```sh
node --test docs/verification/tests/*.test.cjs
```

The adversarial test starts two temporary loopback HTTP servers: one returns a browser 302 or API 307 to the other, which records every request and write. It asserts that both redirects are blocked and the destination records zero requests and writes. The source server also serves a dedicated Worker that attempts an off-origin WebSocket. The guard adds a parallel exact-origin `connect-src` CSP to each fetched response (retaining existing response headers and CSP restrictions); the test requires the Worker to report a `connect-src` policy violation and the destination to record zero requests and writes. This covers Workers that bypass page-level WebSocket constructor hooks and the Playwright WebSocket route:

```sh
DISPOSABLE_TEST_SERVER=1 \
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_PATH=/path/to/chromium \
PLAYWRIGHT_NO_SANDBOX=1 \
node docs/verification/tests/redirect-guard-adversarial.cjs
```
