// Scenarios share a screen reader, live game or DOM: each action must finish before the next.
async function runSequential(items, action, index = 0) {
 if (index >= items.length) { return; }
 await action(items[index]);
 return runSequential(items, action, index + 1);
}
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { installBrowserRequestGuard } = require('../test-target-guard.cjs');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }); let results = []; try {
    await runSequential([false, true], async (en) => {
        await runSequential([1440, 320], async (width) => { const c = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' }); await installBrowserRequestGuard(c, 'http://127.0.0.1:3211'); const p = await c.newPage(); const base = 'http://127.0.0.1:3211' + (en ? '/en' : ''); await p.goto(base + '/'); await p.locator('#entry-title').waitFor(); await check('entry'); await p.evaluate(async () => { await fetch('/api/platform/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 't' + crypto.randomUUID().slice(0, 7) }) }); }); await runSequential(['/', '/workshop/', '/workshop/editor/', '/mypage/', '/terms/', '/privacy/', '/about/', '/missing-page/'], async (path) => { await p.goto(base + path); if (!/terms|privacy|about|missing/.test(path)) {
            await p.waitForSelector('astro-island[ssr]', { state: 'detached' });
        } await p.waitForLoadState('networkidle'); await check(path); }); async function check(path) { assert.equal(await p.locator('main').count(), 1, path); assert.equal(await p.locator('main h1').count(), 1, path); assert.equal(await p.locator('main main').count(), 0); assert(await p.evaluate(() => [...document.querySelectorAll('ul,ol')].every(list => [...list.children].every(child => ['LI', 'SCRIPT', 'TEMPLATE'].includes(child.tagName))))); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await p.addScriptTag({ path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js') }); const r = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })); results.push({ en, width, path, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })) }); } await p.waitForLoadState('networkidle'); await c.close(); });
    });
    fs.writeFileSync(process.env.AXE_RESULTS_PATH || require('node:path').join(__dirname, 'axe-results.json'), JSON.stringify(results, null, 2));
    assert.equal(results.length, 36, 'Complete language/viewport matrix');
    assert.equal(results.filter(x => x.violations.length).length, 0, 'Axe violations are saved in axe-results.json');
    console.log('PASS: one main/heading, no nested main/overflow, 36 screens inspected');
}
finally {
    await b.close();
} })().catch(e => { console.error(e); process.exitCode = 1; });
