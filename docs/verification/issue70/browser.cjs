const { chromium } = require('/opt/codex/cua_node/lib/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 try {
 for(const locale of ['ko','en']) for(const width of [1440,768,375,320]) {
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:3170/${locale==='en'?'en/':''}workshop`);
 const disclosure=page.locator('.filter-disclosure'); await disclosure.waitFor();
 assert.equal(await disclosure.getAttribute('open'),null);
 const summary=disclosure.locator('summary');await summary.focus();await page.keyboard.press('Enter');await page.locator('.workshop-filters').waitFor({state:'visible'});
 const search=page.locator('.workshop-filters input[type=search]').first();await search.fill('nonexistent-verification');await page.waitForTimeout(400);
 await page.locator('.filter-count').waitFor();assert.equal(await page.locator('.filter-count').innerText(),'1');
 await summary.focus();await page.keyboard.press('Space');assert.equal(await disclosure.getAttribute('open'),null);
 await summary.click();assert.equal(await search.inputValue(),'nonexistent-verification');
 await page.getByRole('button',{name:locale==='en'?'Reset filters':'필터 초기화',exact:true}).click();await page.waitForTimeout(400);assert.equal(await search.inputValue(),'');assert.equal(await page.locator('.filter-count').count(),0);
 await summary.click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`docs/verification/issue70/${locale}-${width}-collapsed.png`,fullPage:true});
 await summary.click();await page.screenshot({path:`docs/verification/issue70/${locale}-${width}-expanded.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 results.push({locale,width,defaultCollapsed:true,keyboardToggle:true,conditionPreserved:true,reset:true,noOverflow:true,pageErrors:errors});await context.close();
 }
 require('node:fs').writeFileSync('docs/verification/issue70/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
