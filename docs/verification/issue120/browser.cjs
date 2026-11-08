const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { assertDisposableTestTarget, installBrowserRequestGuard } = require('../test-target-guard.cjs');
const origin = 'http://127.0.0.1:3210';
assertDisposableTestTarget(origin);
const createLabel = locale => locale === 'en' ? 'Create room' : '방 만들기';
const returnLabel = locale => locale === 'en' ? 'Return to room' : '방으로 돌아가기';

async function login(browser, locale, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await installBrowserRequestGuard(context, origin);
  const page = await context.newPage();
  await page.goto(`${origin}/${locale === 'en' ? 'en/' : ''}`);
  await page.evaluate(async () => {
    const response = await fetch('/api/platform/guest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 't' + crypto.randomUUID().slice(0, 7) }),
    });
    if (!response.ok) throw Error('Guest sign-in failed');
  });
  await page.reload();
  await page.getByRole('button', { name: createLabel(locale), exact: true }).waitFor();
  return page;
}

async function createRoom(page, locale, width) {
  await page.getByRole('button', { name: createLabel(locale), exact: true }).click();
  const dialog = page.getByRole('dialog');
  const card = dialog.locator('article').filter({ has: page.getByRole('heading', { name: '사라진 축제 초대장', exact: true }) });
  await card.waitFor();
  await page.screenshot({ path: path.join(__dirname, `picker-${locale}-${width}.png`), fullPage: true });
  await card.getByRole('button', { name: new RegExp(createLabel(locale)) }).click();
  await page.getByText('ROOM DETAILS', { exact: true }).waitFor();
}

async function checkSolo(page, locale) {
  await page.getByRole('button', { name: /^(1인 모드|Solo mode)/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  await page.getByRole('button', { name: returnLabel(locale), exact: true }).click();
  await page.getByText('ROOM DETAILS', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^(다인 모드|Multiplayer mode)/ }).click();
}

async function checkJoinAndStart(host, guest, locale, width) {
  const room = await host.evaluate(() => fetch('/api/lobby/state').then(r => r.json()).then(s => s.room));
  assert.equal(room.scenario.id, 'rehearsal');
  await guest.locator('summary').click();
  await guest.locator('#code').fill(room.code);
  await guest.locator('details form button').click();
  await guest.getByText('ROOM DETAILS', { exact: true }).waitFor();
  await host.waitForFunction(() => fetch('/api/lobby/state').then(r => r.json()).then(s => s.room.count === 2));
  await host.screenshot({ path: path.join(__dirname, `joined-${locale}-${width}.png`), fullPage: true });
  await host.getByRole('button', { name: /게임 시작/ }).click();
  await host.waitForFunction(() => fetch('/api/lobby/state').then(r => r.json()).then(s => Boolean(s.room.session)));
  assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function checkViewport(browser, locale, width) {
  const host = await login(browser, locale, width);
  const guest = await login(browser, locale, width);
  try {
    await createRoom(host, locale, width);
    await checkSolo(host, locale);
    await checkJoinAndStart(host, guest, locale, width);
    console.log('PASS', locale, width, 'picker/create/solo-return/code-join/multiplayer-start');
  } finally {
    await host.waitForLoadState('networkidle');
    await guest.waitForLoadState('networkidle');
    await host.context().close();
    await guest.context().close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const locale of ['ko', 'en']) {
      for (const width of [1440, 320]) await checkViewport(browser, locale, width);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
