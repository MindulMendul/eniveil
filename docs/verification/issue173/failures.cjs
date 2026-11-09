const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { installBrowserRequestGuard } = require('../test-target-guard.cjs');
const origin = process.env.BASE_URL || 'http://127.0.0.1:3273';
async function checkFailure(browser, kind) {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, serviceWorkers: 'block' });
  try {
    await installBrowserRequestGuard(context, origin);
    const page = await context.newPage();
    await page.route('**/api/platform/consent', async route => {
      if (route.request().method() !== 'POST') { return route.fallback(); }
      if (kind === 'network') { return route.fulfill({ status: 503, body: '{}', contentType: 'application/json' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ consent: { version: 2, scope: 'full', updatedAt: new Date().toISOString(), accountId: null } }) });
    });
    await page.goto(origin + '/');
    await page.locator('#collection-dialog[open]').waitFor();
    await page.locator('[data-collection-choice=full]').click();
    await page.locator('[data-collection-error]:not([hidden])').waitFor();
    assert(await page.locator('#collection-dialog').isVisible());
    assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 0);
    const status = await page.evaluate(async () => (await fetch('/api/platform/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 'BlockedTest' }) })).status);
    assert.equal(status, 403);
  } finally { await context.unrouteAll({ behavior: 'wait' }); await context.close(); }
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    await Promise.all(['cookie', 'network'].map(kind => checkFailure(browser, kind)));
    console.log('PASS blocked cookie and failed consent save: no grant, no GA, service blocked');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
