const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installBrowserRequestGuard } = require('../test-target-guard.cjs');
const origin = process.env.BASE_URL || 'http://127.0.0.1:3273';
const output = process.env.OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'eniveil-consent-173-')); 
fs.mkdirSync(output, { recursive: true });
async function request(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, body });
}
async function stub(page) {
  await page.route('https://www.googletagmanager.com/**', route => route.fulfill({ body: '/* local test stub; no analytics delivery */', contentType: 'text/javascript' }));
}
async function checkInitial(page, en, width) {
  await page.locator('#collection-dialog[open]').waitFor();
  assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'collection-title');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.addScriptTag({ path: process.env.AXE_PATH });
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations);
  assert.equal(violations.length, 0, JSON.stringify(violations));
  await page.screenshot({ path: `${output}/modal-${en ? 'en' : 'ko'}-${width}.png`, fullPage: true });
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.collectionChoice), 'full');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.collectionPrivacy !== undefined), true);
}
async function checkBasic(page, en) {
  await page.locator('[data-collection-choice=basic]').click();
  await page.locator('#collection-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.dataLayer?.some(event => event.event === 'page_view'));
  assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 1);
  assert(!JSON.stringify(await page.evaluate(() => window.dataLayer)).includes('SECRET'));
  assert.equal((await request(page, '/api/platform/guest', { nickname: 'NoConsent' })).status, 403);
  assert.equal((await request(page, '/api/game/sessions', { storyId: 'deokil-trading-murder' })).status, 403);
  await page.getByRole('button', { name: en ? 'Sign in with Google' : '구글로 로그인', exact: true }).click();
  await page.locator('#collection-dialog[open]').waitFor();
  assert(new URL(page.url()).origin === origin && !new URL(page.url()).pathname.startsWith('/api/'));
  await page.keyboard.press('Escape');
}
async function grantAndLogin(page, en) {
  await page.locator('[data-collection-settings]').click();
  await page.locator('[data-collection-choice=full]').click();
  await page.locator('#collection-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 1);
  await page.locator('#nickname').fill('C' + randomUUID().replaceAll('-', '').slice(0, 18));
  await page.getByRole('button', { name: en ? 'Check availability' : '중복 확인', exact: true }).click();
  await page.getByRole('button', { name: en ? 'Continue as a guest' : '게스트로 시작하기', exact: true }).click();
  await page.getByRole('button', { name: en ? 'Create room' : '방 만들기', exact: true }).waitFor();
  assert(!(await page.locator('#collection-dialog').isVisible()));
  const choice = (await request(page, '/api/platform/consent')).body.consent;
  assert.equal(choice.scope, 'full');
  assert(choice.accountId);
  assert.equal((await request(page, '/api/game/stories/deokil-trading-murder')).status, 200);
}
async function checkOtherTab(context, page, en, socket) {
  const closed = socket.waitForEvent('close', { timeout: 10000 });
  const tab = await context.newPage();
  await stub(tab);
  await tab.goto(origin + (en ? '/en/' : '/'));
  await tab.getByRole('button', { name: en ? 'Create room' : '방 만들기', exact: true }).waitFor();
  assert(!(await tab.locator('#collection-dialog').isVisible()));
  await tab.locator('[data-collection-settings]').click();
  await tab.locator('[data-collection-choice=basic]').click();
  await tab.locator('#collection-dialog').waitFor({ state: 'hidden' });
  await closed;
  await page.waitForFunction(async () => (await fetch('/api/game/stories/deokil-trading-murder')).status === 403);
  assert.equal((await request(page, '/api/platform/consent')).body.consent.scope, 'basic');
}
async function checkWithdrawal(page, en) {
  await page.bringToFront();
  await page.locator('[data-collection-settings]').click();
  await Promise.all([page.waitForEvent('load'), page.locator('[data-collection-choice=none]').click()]);
  await page.locator('[data-collection-settings]').waitFor();
  assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 0);
  await page.goto(origin + (en ? '/en' : '') + '/mypage/');
  if (await page.locator('#collection-dialog').isVisible()) { await page.keyboard.press('Escape'); }
  await page.getByRole('button', { name: en ? 'Account settings' : '계정 설정', exact: true }).waitFor();
  assert.equal((await request(page, '/api/lobby/state')).status, 403);
}
async function lifecycle(browser, { en, width }) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  try {
    await installBrowserRequestGuard(context, origin);
    await context.addInitScript(() => localStorage.setItem('analytics-consent-v1', 'granted'));
    const page = await context.newPage();
    await stub(page);
    await page.route('**/api/platform/auth/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ google: true, demo: false }) }));
    const errors = [], sockets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => sockets.push(socket));
    await page.goto(origin + (en ? '/en/' : '/') + '?room=SECRET');
    await checkInitial(page, en, width);
    await checkBasic(page, en);
    await grantAndLogin(page, en);
    assert(sockets.length > 0);
    await checkOtherTab(context, page, en, sockets.at(-1));
    await checkWithdrawal(page, en);
    assert.deepEqual(errors, []);
    return { en, width, firstVisitModal: true, axe: 0, basicBlocksService: true, googleSignInBlockedUntilFull: true, fullAllowsLogin: true, noSecondConsentOnLogin: true, crossTabDowngrade: true, withdrawal: true, accountSettingsAccessible: true };
  } finally { await context.unrouteAll({ behavior: 'wait' }); await context.close(); }
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const cases = [false, true].flatMap(en => [320, 1440].map(width => ({ en, width })));
    const results = await Promise.all(cases.map(options => lifecycle(browser, options)));
    fs.writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
    console.log('PASS 4 locale/viewport consent lifecycles including server gates, account binding, cross-tab, withdrawal, axe0');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
