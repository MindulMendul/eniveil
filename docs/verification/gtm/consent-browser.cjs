const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { assertDisposableTestTarget } = require('../test-target-guard.cjs');
const origin = process.env.BASE_URL || 'http://127.0.0.1:33879';
assertDisposableTestTarget(origin);
const launch = { headless: true };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
if (process.env.PLAYWRIGHT_NO_SANDBOX === '1') launch.args = ['--no-sandbox'];

async function check(browser, locale, width) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } });
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort('blockedbyclient');
      return route.continue();
    });
    let requests = 0;
    // Never execute or contact the real GTM container during this test.
    await context.route(url => url.origin === 'https://www.googletagmanager.com'
      && url.pathname === '/gtm.js' && url.search === '?id=GTM-56Q5K95G', route => {
      requests++;
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* local stub */' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const prefix = locale === 'en' ? '/en' : '';
    await page.goto(`${origin}${prefix}/?room=SECRET#SECRET`);
    await page.locator('[data-analytics-choice]').waitFor();
    assert.equal(requests, 0);
    assert.match(await page.locator('[data-analytics-message]').innerText(), locale === 'en' ? /advertising/ : /광고/);
    await page.locator('[data-analytics-allow]').click();
    await page.waitForFunction(() => window.dataLayer?.some(event => event.event === 'page_view'));
    assert.equal(requests, 1);
    const views = await page.evaluate(() => window.dataLayer.filter(event => event.event === 'page_view'));
    assert.equal(views.length, 1);
    assert(!views[0].page_location.includes('?') && !views[0].page_location.includes('#'));

    const other = await context.newPage();
    await other.goto(`${origin}${prefix}/`);
    await other.waitForFunction(() => window.dataLayer?.some(event => event.event === 'page_view'));
    assert.equal(requests, 2);
    await page.waitForTimeout(1100);
    const sent = [];
    page.on('console', message => { if (message.text().startsWith('DL:')) sent.push(message.text()); });
    await page.evaluate(() => {
      const original = window.dataLayer.push;
      window.dataLayer.push = function (...args) { console.log(`DL:${JSON.stringify(args)}`); return original.apply(this, args); };
    });
    await page.locator('[data-analytics-settings]').click();
    const otherReload = other.waitForEvent('load');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.locator('[data-analytics-deny]').click()]);
    await otherReload;
    assert.equal(requests, 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('analytics-consent-v1')), 'denied');
    assert.equal(await other.evaluate(() => localStorage.getItem('analytics-consent-v1')), 'denied');
    assert(!sent.some(message => message.includes('page_dwell')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    return { locale, width, consentGate: true, sanitizedUrl: true, otherTabRevoked: true, noDwellAfterRevoke: true };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch(launch);
  try {
    for (const locale of ['ko', 'en']) {
      for (const width of [1440, 320]) console.log(JSON.stringify(await check(browser, locale, width)));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
