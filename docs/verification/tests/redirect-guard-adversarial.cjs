const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installBrowserRequestGuard, requestWithoutRedirects } = require('../test-target-guard.cjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function main() {
  assert.equal(process.env.DISPOSABLE_TEST_SERVER, '1', 'Use only the two in-process disposable loopback servers.');
  let recorderRequests = 0;
  let recorderWrites = 0;
  let browserRedirectResponses = 0;
  let apiRedirectResponses = 0;
  const recorder = http.createServer((request, response) => {
    recorderRequests += 1;
    if (request.method === 'POST') recorderWrites += 1;
    if (request.url === '/redirected') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<script>fetch("/write", { method: "POST", body: "would-write" })</script>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('recorded');
  });
  recorder.on('upgrade', (_request, socket) => {
    recorderRequests += 1;
    socket.destroy();
  });

  const recorderPort = await listen(recorder);
  const recorderOrigin = `http://127.0.0.1:${recorderPort}`;
  const redirector = http.createServer((request, response) => {
    if (request.url === '/ws-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<script>try { new WebSocket(${JSON.stringify(`ws://127.0.0.1:${recorderPort}/ws`)}); } catch (error) { window.wsGuardError = error.name; }</script>`);
      return;
    }
    if (request.url === '/worker-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<script>const worker = new Worker('/worker.js'); window.workerSocketMessages = []; worker.onmessage = event => { window.workerSocketMessages.push(event.data); }; worker.onerror = event => { window.workerSocketError = event.message || 'worker-error'; };</script>`);
      return;
    }
    if (request.url === '/worker.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end(`self.addEventListener('securitypolicyviolation', event => postMessage('csp:' + event.effectiveDirective)); postMessage('started'); try { const socket = new WebSocket(${JSON.stringify(`ws://127.0.0.1:${recorderPort}/worker-ws`)}); socket.addEventListener('error', () => postMessage('error')); socket.addEventListener('close', event => postMessage('close:' + event.code)); } catch (error) { postMessage('exception:' + error.name); }`);
      return;
    }
    const destination = request.url === '/api'
      ? `${recorderOrigin}/api-write`
      : `${recorderOrigin}/redirected`;
    if (request.url === '/api' && request.method === 'POST') apiRedirectResponses += 1;
    if (request.url === '/page' && request.method === 'GET') browserRedirectResponses += 1;
    response.writeHead(request.url === '/api' ? 307 : 302, { location: destination });
    response.end();
  });

  let browser;
  let context;
  try {
    const redirectorPort = await listen(redirector);
    const allowedOrigin = `http://127.0.0.1:${redirectorPort}`;
    browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      headless: true,
      args: process.env.PLAYWRIGHT_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
    });
    context = await browser.newContext();
    let offOriginWebSocketBlocks = 0;
    await installBrowserRequestGuard(context, allowedOrigin, { onOffOriginWebSocket: () => { offOriginWebSocketBlocks += 1; } });
    const redirectPage = await context.newPage();
    let browserNavigationStatus = null;
    let browserNavigationError = null;
    try {
      browserNavigationStatus = (await redirectPage.goto(`${allowedOrigin}/page`))?.status() ?? null;
    } catch (error) {
      browserNavigationError = error.message;
    }
    assert.ok(
      browserNavigationStatus === 302 || browserNavigationError?.includes('ERR_BLOCKED_BY_CLIENT'),
      'The browser navigation stopped at the 302 instead of following it.',
    );
    assert.notEqual(new URL(redirectPage.url()).origin, recorderOrigin, 'The browser stayed away from the redirect destination.');
    await redirectPage.close();
    const page = await context.newPage();
    let workerScriptCsp = '';
    page.on('response', async response => {
      if (new URL(response.url()).pathname === '/worker.js') {
        workerScriptCsp = response.headers()['content-security-policy'] || '';
      }
    });
    await page.goto(`${allowedOrigin}/ws-page`);
    await page.waitForFunction(() => window.wsGuardError === 'SecurityError');
    const wsConstructorBlocked = await page.evaluate(() => window.wsGuardError === 'SecurityError');
    assert.equal(wsConstructorBlocked, true, 'Off-origin WebSocket constructor was rejected before connecting.');
    await page.goto(`${allowedOrigin}/worker-page`);
    await page.waitForFunction(() => window.workerSocketMessages?.includes('started'));
    await page.waitForFunction(() => window.workerSocketMessages?.some(message => message.startsWith('csp:') || message === 'error' || message.startsWith('close:') || message.startsWith('exception:')), { timeout: 5000 });
    const workerDiagnostics = await page.evaluate(() => ({ messages: window.workerSocketMessages, error: window.workerSocketError || null }));
    assert.ok(workerScriptCsp.includes(`connect-src ${allowedOrigin} ws://127.0.0.1:${redirectorPort}`), 'The worker response received the exact-origin connect-src policy.');
    assert.equal(workerScriptCsp.includes(recorderOrigin), false, 'The worker CSP does not allow the redirect destination.');
    assert.ok(
      workerDiagnostics.messages.some(message => message === 'csp:connect-src') || offOriginWebSocketBlocks > 0,
      'CSP or the network-level WebSocket route blocked the worker connection.',
    );
    await assert.rejects(requestWithoutRedirects(
      context.request,
      'post',
      `${allowedOrigin}/api`,
      allowedOrigin,
      { data: { wouldWrite: true } },
    ), /API redirects are disabled/);
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(browserRedirectResponses, 1, 'Owned redirect server returned the expected browser 302.');
    assert.equal(apiRedirectResponses, 1, 'Owned redirect server returned the expected API 307.');
    assert.equal(recorderRequests, 0, 'Redirect destination received no browser or API requests.');
    assert.equal(recorderWrites, 0, 'Redirect destination recorded no writes.');
    console.log(JSON.stringify({
      browserRedirectBlocked: true,
      apiRedirectBlocked: true,
      wsConstructorBlocked,
      workerDiagnostics,
      offOriginWebSocketBlocks,
      browserRedirectResponses,
      apiRedirectResponses,
      browserNavigationStatus,
      destinationRequests: recorderRequests,
      destinationWrites: recorderWrites,
    }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await close(redirector);
    await close(recorder);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
