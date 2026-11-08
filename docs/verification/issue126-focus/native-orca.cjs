const nativeLabels = {en: {details: 'Details', title: 'Title', save: 'Save story', settings: 'Account settings', signout: 'Sign out', delete: 'Delete account', return: 'Return to room'}, ko: {details: '자세히 보기', title: '제목', save: '스토리 저장', settings: '계정 설정', signout: '로그아웃', delete: '회원탈퇴', return: '방으로 돌아가기'}};

const nativePatterns = {en: {nickname: /^Nickname entry required/, google: /^Sign in with Google \(test\) button/, code: /^6-character invite code entry/i, filter: /^Story filters .*collapsed/, search: /^Title \/ description entry/, title: /^Title entry/, details: /^Details button/, save: /^Save story button/, settings: /^Account settings heading 2/, signout: /^Sign out button/, delete: /^Delete account button/, return: /^Return to room button/}, ko: {nickname: /^닉네임 entry required/, google: /^구글로 로그인 \(테스트\) button/, code: /^6자리 초대 코드 entry/, filter: /^작품 필터 .*collapsed/, search: /^제목·설명 entry/, title: /^제목 entry/, details: /^자세히 보기 button/, save: /^스토리 저장 button/, settings: /^계정 설정 heading 2/, signout: /^로그아웃 button/, delete: /^회원탈퇴 button/, return: /^방으로 돌아가기 button/}};
// Scenarios share a screen reader, live game or DOM: each action must finish before the next.
async function runSequential(items, action, index = 0) {
 if (index >= items.length) { return; }
 await action(items[index]);
 return runSequential(items, action, index + 1);
}
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { installBrowserRequestGuard, assertDisposableTestTarget } = require('../test-target-guard.cjs');
const origin = 'http://127.0.0.1:3211';
assertDisposableTestTarget(origin);
const log = process.env.ORCA_DEBUG_LOG;
if (!log) {
    throw new Error('ORCA_DEBUG_LOG is required');
}
const results = [];
async function post(p, path, body) { return p.evaluate(async ({ path, body }) => { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) {
    throw new Error('Setup ' + r.status);
} return r.json(); }, { path, body }); }
async function waitForSpeech(p, start, expected, attempt = 0) {
    await p.waitForTimeout(300);
    const utterances = fs.readFileSync(log).subarray(start).toString('utf8').split('\n').map(line => line.match(/SPEECH OUTPUT: '(.*)' \{/)).filter(Boolean).map(match => match[1]);
    const spoken = utterances.find(text => expected.test(text));
    if (spoken) { return spoken; }
    if (attempt >= 19) {
        return false;
    }
    return waitForSpeech(p, start, expected, attempt + 1);
}
async function speech(p, label, action, expected) {
    const start = fs.statSync(log).size;
    await action();
    const spoken = await waitForSpeech(p, start, expected);
    assert(spoken, label + ' missing native speech');
    results.push({ language: await p.locator('html').getAttribute('lang'), width: p.viewportSize().width, checkpoint: label, spoken, pass: true });
    console.log('PASS native Orca', label);
    await p.waitForTimeout(600);
}
(async () => {
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: false, args: ['--no-sandbox', '--force-renderer-accessibility', '--disable-features=Translate,TranslateUI', '--disable-translate', '--accept-lang=ko,en-US,en'] });
    try {
        await runSequential([false, true], async (en) => {
            await runSequential([1440, 320], async (width) => {
                const locale = en ? 'en' : 'ko';
                const copy = nativeLabels[locale];
                const expected = nativePatterns[locale];
                const c = await b.newContext({ viewport: { width, height: 900 }, locale: en ? 'en-US' : 'ko-KR', serviceWorkers: 'block' });
                await installBrowserRequestGuard(c, origin);
                const p = await c.newPage();
                const prefix = en ? '/en' : '';
                const go = async (path) => { await p.goto(origin + prefix + path); await p.locator('main h1').waitFor(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500); assert.equal(await p.locator('html').getAttribute('lang'), en ? 'en' : 'ko'); };
                await go('/');
                await p.bringToFront();
                const originalTitle = await p.title();
                const marker = 'Orca-' + crypto.randomUUID();
                await p.evaluate(title => { document.title = title; }, marker);
                await p.waitForTimeout(500);
                const tree = execFileSync('/usr/bin/xwininfo', ['-root', '-tree'], { encoding: 'utf8' });
                const matches = tree.split('\n').filter(x => x.includes(marker));
                assert.equal(matches.length, 1, 'Only the launched test window may receive focus');
                const win = matches[0];
                execFileSync('/usr/bin/python3', [require('node:path').join(__dirname, 'focus-window.py'), win.match(/0x[0-9a-f]+/i)[0]]);
                await p.evaluate(title => { document.title = title; }, originalTitle);
                await p.waitForTimeout(1000);
                await p.locator('.skip-link').focus();
                await p.waitForTimeout(600);
                await speech(p, 'nickname name and entry role', () => p.locator('#nickname').focus(), expected.nickname);
                await speech(p, 'Google login button', () => p.getByRole('button', { name: /Google|구글/ }).focus(), expected.google);
                await post(p, '/api/platform/guest', { nickname: 'o' + crypto.randomUUID().slice(0, 7) });
                await go('/');
                await p.locator('details summary').focus();
                await p.keyboard.press('Enter');
                await speech(p, 'room code input', () => p.locator('#code').focus(), expected.code);
                const source = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../../apps/server/stories/deokil-trading-murder.mstory'), 'utf8'));
                source.story.title = 'NativeReader ' + crypto.randomUUID().slice(0, 5);
                await post(p, '/api/workshop/drafts', { package: source, published: true });
                await go('/workshop/');
                await speech(p, 'filter collapsed state', () => p.locator('details summary').focus(), expected.filter);
                await speech(p, 'filter expanded state', async () => { assert(await p.locator('details summary').evaluate(node => document.activeElement === node)); await p.keyboard.press('Enter'); assert(await p.locator('details').evaluate(node => node.open)); }, /^expanded$/);
                await speech(p, 'search field name', () => p.keyboard.press('Tab'), expected.search);
                const card = p.locator('article').filter({ has: p.getByRole('heading', { name: source.story.title, exact: true }) });
                await card.getByRole('button', { name: copy.details, exact: true }).focus();
                await p.waitForTimeout(1000);
                await speech(p, 'named story dialog', () => p.keyboard.press('Enter'), new RegExp('^' + source.story.title + ' heading'));
                await speech(p, 'dialog close restores opener', () => p.keyboard.press('Escape'), expected.details);
                await go('/workshop/editor/');
                await speech(p, 'story title field', () => p.getByLabel(copy.title, { exact: true }).focus(), expected.title);
                await speech(p, 'save story button', async () => { const save = p.getByRole('button', { name: copy.save, exact: true }); await save.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); assert(await save.isEnabled()); await save.focus(); }, expected.save);
                await go('/mypage/');
                await p.getByRole('button', { name: copy.settings, exact: true }).focus();
                await p.waitForTimeout(1000);
                await speech(p, 'account settings heading', async () => { await p.getByRole('button', { name: copy.settings, exact: true }).click(); await p.locator('#account-settings-title').waitFor(); await p.locator('#language').focus(); await p.waitForTimeout(600); await p.locator('#account-settings-title').focus(); }, expected.settings);
                await speech(p, 'sign out button', () => p.getByRole('button', { name: copy.signout, exact: true }).focus(), expected.signout);
                await speech(p, 'delete account button', () => p.getByRole('button', { name: copy.delete, exact: true }).focus(), expected.delete);
                await go('/');
                await post(p, '/api/lobby/rooms', { scenarioId: 'deokil-trading-murder' });
                const start = p.getByRole('button', { name: /게임 시작/ });
                await start.waitFor();
                await speech(p, 'start game control', () => start.focus(), /^게임 시작 → button/);
                await p.keyboard.press('Enter');
                const back = p.getByRole('button', { name: copy.return, exact: true });
                await back.waitFor();
                await speech(p, 'in-game return control', () => back.focus(), expected.return);
                await c.unrouteAll({ behavior: 'wait' });
                await c.close();
            });
        });
        assert.equal(results.length, 60, 'All language/viewport checkpoints must run');
    }
    finally {
        await b.close();
        fs.writeFileSync(process.env.ORCA_RESULTS_PATH || require('node:path').join(__dirname, 'orca-results.json'), JSON.stringify(results, null, 2));
    }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
