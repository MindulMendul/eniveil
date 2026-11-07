const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3215';
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const contexts=[]; const pages=[]; const errors=[];
  try {
    for (let i=0;i<3;i++) {
      const context=await browser.newContext(); contexts.push(context);
      const page=await context.newPage(); pages.push(page);
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
      const guest=await page.evaluate(async n=>{
        const r=await fetch('/api/platform/guest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nickname:n})});
        return {status:r.status,body:await r.json()};
      },`R${Date.now().toString(36).slice(-6)}${i}`);
      assert.equal(guest.status,201,JSON.stringify(guest));
      await page.evaluate(()=>{window.latest=null;window.ws=new WebSocket(`ws://${location.host}/api/lobby/ws`);window.ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.type==='snapshot')window.latest=x.data};});
      await page.waitForFunction(()=>window.latest?.me, null,{timeout:5000});
    }
    const [host,joiner,observer]=pages;
    const created=await host.evaluate(async()=>{const r=await fetch('/api/lobby/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenarioId:'rehearsal'})});return {status:r.status,body:await r.json()}});
    assert.equal(created.status,201,JSON.stringify(created));
    const roomId=created.body.roomId;
    await observer.waitForFunction(id=>window.latest?.rooms.some(r=>r.id===id),roomId,{timeout:5000});
    const code=await host.evaluate(id=>window.latest.room?.code,roomId);
    const joined=await joiner.evaluate(async code=>{const r=await fetch('/api/lobby/rooms/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});return {status:r.status,body:await r.json()}},code);
    assert.equal(joined.status,200,JSON.stringify(joined));
    await observer.waitForFunction(id=>!window.latest?.rooms.some(r=>r.id===id),roomId,{timeout:5000});
    const full=await observer.evaluate(async()=>{const r=await fetch('/api/lobby/state');return (await r.json()).rooms});
    assert.ok(!full.some(r=>r.id===roomId));
    const left=await joiner.evaluate(async()=>new Promise(resolve=>{const requestId=crypto.randomUUID();window.ws.send(JSON.stringify({type:'leave',requestId}));const h=e=>{const x=JSON.parse(e.data);if(x.type==='ack'&&x.requestId===requestId){window.ws.removeEventListener('message',h);resolve(true)}};window.ws.addEventListener('message',h)}));
    assert.equal(left,true);
    await observer.waitForFunction(id=>window.latest?.rooms.some(r=>r.id===id),roomId,{timeout:5000});
    const rejoined=await joiner.evaluate(async code=>{const r=await fetch('/api/lobby/rooms/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});return r.status},code);
    assert.equal(rejoined,200);
    await observer.waitForFunction(id=>!window.latest?.rooms.some(r=>r.id===id),roomId,{timeout:5000});
    const start=await host.evaluate(async()=>new Promise(resolve=>{const requestId=crypto.randomUUID();window.ws.send(JSON.stringify({type:'start',requestId}));const h=e=>{const x=JSON.parse(e.data);if(x.type==='ack'&&x.requestId===requestId){window.ws.removeEventListener('message',h);resolve(x)}};window.ws.addEventListener('message',h)}));
    assert.equal(start.type,'ack',JSON.stringify(start));
    await observer.waitForFunction(id=>!window.latest?.rooms.some(r=>r.id===id),roomId,{timeout:5000});
    const hostState=await host.evaluate(()=>window.latest.room);
    assert.equal(hostState.status,'playing');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({contexts:3,availableRoomVisible:true,fullRoomHidden:true,vacancyRestoresListing:true,refilledRoomHidden:true,playingRoomHidden:true,hostRoomStatus:hostState.status,pageErrors:errors.length},null,2));
  } finally { for (const c of contexts) await c.close(); await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
