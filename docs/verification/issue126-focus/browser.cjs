const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { installBrowserRequestGuard, assertDisposableTestTarget } = require('../test-target-guard.cjs');
const origin = 'http://127.0.0.1:3211';
assertDisposableTestTarget(origin);
async function post(page,path,body) { return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Test setup failed: '+r.status);return r.json()},{path,body}); }
async function signedIn(browser,en,width) {
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await installBrowserRequestGuard(context,origin);
 const page=await context.newPage();await page.goto(origin+(en?'/en/':'/'));await page.locator('#nickname').waitFor();
 await post(page,'/api/platform/guest',{nickname:'f'+crypto.randomUUID().slice(0,7)});await page.reload();
 await page.getByRole('button',{name:en?'Create room':'방 만들기',exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement.id==='main-content');return page;
}
async function phase(page,value) { await page.waitForFunction(value=>fetch('/api/lobby/state').then(r=>r.json()).then(s=>s.room?.session?.phase===value),value); }
async function close(page) { await page.context().unrouteAll({behavior:'wait'});await page.context().close(); }
async function gameFocus(browser,en,width) {
 const host=await signedIn(browser,en,width),guest=await signedIn(browser,en,width);
 try {
  await post(host,'/api/lobby/rooms',{scenarioId:'rehearsal'});
  const room=await host.evaluate(()=>fetch('/api/lobby/state').then(r=>r.json()).then(s=>s.room));
  await post(guest,'/api/lobby/rooms/join',{code:room.code});
  await host.getByRole('button',{name:/게임 시작/}).click();await phase(guest,'briefing');
  await guest.locator('#language').focus();await host.getByRole('button',{name:/단서 공개하기/}).click();await phase(guest,'discussion');
  assert.equal(await guest.evaluate(()=>document.activeElement.id),'language');
  await host.getByRole('button',{name:/투표 시작하기/}).click();await guest.locator('.votes button').first().waitFor();
  await guest.locator('.votes button').first().focus();await host.locator('.votes button').first().click();
  await guest.waitForFunction(()=>fetch('/api/lobby/state').then(r=>r.json()).then(s=>s.room.session.voteCount===1));
  assert(await guest.evaluate(()=>document.activeElement.matches('.votes button')));
  await guest.keyboard.press('Enter');await phase(guest,'reveal');await guest.waitForFunction(()=>document.activeElement.id==='main-content');
  console.log('PASS',en?'en':'ko',width,'signed-in reload, background phase keeps valid focus, removed vote control recovers focus');
 } finally { await close(host);await close(guest); }
}
async function soloFocus(browser,en,width) {
 const page=await signedIn(browser,en,width);let second;
 try {
  await post(page,'/api/lobby/rooms',{scenarioId:'deokil-trading-murder'});
  const start=page.getByRole('button',{name:/게임 시작/});await start.focus();await page.keyboard.press('Enter');
  const back=page.getByRole('button',{name:en?'Return to room':'방으로 돌아가기',exact:true});await back.waitFor();
  await page.waitForFunction(()=>document.activeElement.id==='main-content');
  second=await page.context().newPage();await second.goto(origin+(en?'/en/':'/'));
  const end=second.getByRole('button',{name:en?'End investigation and return to room':'수사 종료하고 방으로 돌아가기',exact:true});await end.waitFor();
  await second.waitForFunction(()=>document.activeElement.id==='main-content');await end.focus();await second.keyboard.press('Enter');
  await second.getByText('ROOM DETAILS',{exact:true}).waitFor();await second.waitForFunction(()=>document.activeElement.id==='main-content');
  await page.getByText('ROOM DETAILS',{exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement.id==='main-content');
  console.log('PASS',en?'en':'ko',width,'solo start/ownership and return recover focus after actual screen replacement');
 } finally { await close(page); }
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});try{for(const en of [false,true])for(const width of [1440,320]){await gameFocus(browser,en,width);await soloFocus(browser,en,width);}}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
