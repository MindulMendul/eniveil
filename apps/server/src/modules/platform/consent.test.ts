import { afterEach, expect, test, setSystemTime } from 'bun:test';
import { Hono } from 'hono';
import { resetRestoredConsent } from '../../infrastructure/sqlite/reset-restored-consent';
import { Store } from '../../store';
import { ConsentService } from './consent';
import { createAccountRoutes } from './account-routes';
import { SQLiteStoryRunStore } from '../../infrastructure/sqlite/story-run-store';
const stores: Store[] = [], services: ConsentService[] = [];
afterEach(()=>{setSystemTime();for(const s of services.splice(0))s.dispose();for(const s of stores.splice(0))s.close()});
const queries={collection_records:'SELECT count(*) AS n FROM collection_records',collection_consents:'SELECT count(*) AS n FROM collection_consents',story_run_events:'SELECT count(*) AS n FROM story_run_events',story_runs:'SELECT count(*) AS n FROM story_runs',story_ratings:'SELECT count(*) AS n FROM story_ratings'};
function cookies(jar:string,response:Response){const map=new Map(jar.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0]!;const i=pair.indexOf('=');map.set(pair.slice(0,i),pair.slice(i+1))}return[...map].map(([k,v])=>`${k}=${v}`).join('; ')}
const read=async(r:Response)=>await r.json() as {consent:{scope:string;accountId:string|null}|null};
function fixture(){
 const store=new Store(':memory:');stores.push(store);const revoked:string[]=[];const service=new ConsentService(store,key=>revoked.push(key));services.push(service);
 const runs=new SQLiteStoryRunStore(store.db,{collection:{allows:service.acceptsRecord,recorded:service.recorded}});
 const app=new Hono();app.use('*',service.middleware);app.route('/',service.routes());app.route('/api/platform',createAccountRoutes({store,production:false,googleDemo:true}));
 app.post('/event',c=>{runs.record({id:crypto.randomUUID(),runId:null,storyId:'story',type:'story_impression',occurredAt:new Date().toISOString(),value:null,metadata:{}});return c.body(null,204)});
 app.post('/api/game/test',c=>c.body(null,204));
 const req=(path:string,cookie='',body?:unknown)=>app.request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const choose=async(scope:string,jar='')=>{const response=await req('/consent',jar,{version:2,scope});expect(response.status).toBe(200);return cookies(jar,response)};
 const account=(name='OwnerOne')=>{const me=store.createGuest(name);return{me,auth:`festival_guest=${store.issue(me.id)}`}};
 const count=(table:keyof typeof queries)=>(store.db.query(queries[table]).get() as {n:number}).n;
 return{store,runs,service,req,choose,account,count,revoked};
}

test('default/basic store no extra events; full records and downgrade deletes them',async()=>{
 const f=fixture();expect((await read(await f.req('/consent'))).consent).toBeNull();await f.req('/event','',{});expect(f.count('story_run_events')).toBe(0);
 let jar=await f.choose('basic');await f.req('/event',jar,{});expect(f.count('story_run_events')).toBe(0);
 jar=await f.choose('full',jar);await f.req('/event',jar,{});expect(f.count('collection_records')).toBe(1);expect(f.count('story_run_events')).toBe(1);
 const old=jar;jar=await f.choose('basic',jar);expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
 expect((await read(await f.req('/consent',old))).consent).toBeNull();expect((await f.req('/analytics/vitals',jar,{})).status).toBe(403);
});

test('account/version boundaries never transfer grants; deletion removes linked data',async()=>{
 const f=fixture();const anon=await f.choose('full');const a=f.account(),b=f.account('OwnerTwo');
 expect((await read(await f.req('/consent',anon+'; '+a.auth))).consent).toBeNull();
 const owned=await f.choose('full',anon+'; '+a.auth);await f.req('/event',owned,{});expect(f.count('collection_records')).toBe(1);
 const withoutAuth=owned.split('; ').filter(x=>!x.startsWith('festival_guest=')).join('; ');
 expect((await read(await f.req('/consent',withoutAuth))).consent).toBeNull();expect((await read(await f.req('/consent',withoutAuth+'; '+b.auth))).consent).toBeNull();
 for(const body of [{version:1,scope:'full'},{version:2,scope:'forged'},null])expect((await f.req('/consent',owned,body)).status).toBe(400);
 f.store.deleteAccount(a.me);expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
});

test('withdrawal preserves operational state but removes browser grant even after logout',async()=>{
 const f=fixture();const a=f.account();const jar=await f.choose('full',a.auth);
 f.runs.create({id:'operational',storyId:'story',storyVersion:1,currentSceneId:'start',startedAt:new Date().toISOString(),lastActiveAt:new Date().toISOString(),endedAt:null,outcome:null,foundEvidenceIds:[]});
 await f.req('/event',jar,{});expect(f.count('collection_records')).toBe(1);
 const anonymous=jar.split('; ').filter(x=>!x.startsWith('festival_guest=')).join('; ');const declined=await f.choose('none',anonymous);
 expect((await read(await f.req('/consent',declined))).consent?.scope).toBe('none');expect(f.count('collection_records')).toBe(0);expect(f.count('story_runs')).toBe(1);
 expect(f.revoked.length).toBe(1);
});

test('service API requires full consent regardless of client controls',async()=>{
 const f=fixture();expect((await f.req('/api/game/test','',{})).status).toBe(403);let jar=await f.choose('basic');expect((await f.req('/api/game/test',jar,{})).status).toBe(403);
 jar=await f.choose('full',jar);expect((await f.req('/api/game/test',jar,{})).status).toBe(204);jar=await f.choose('none',jar);expect((await f.req('/api/game/test',jar,{})).status).toBe(403);
});

test('expired account preferences stop collection and remove expired records',async()=>{
 const f=fixture();const a=f.account();const jar=await f.choose('full',a.auth);await f.req('/event',jar,{});setSystemTime(Date.now()+31*86400000);
 expect((await read(await f.req('/consent',jar))).consent).toBeNull();expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
});

test('first recent choice binds to Google sign-in but a stale anonymous choice does not',async()=>{
 const f=fixture();const jar=await f.choose('full');const login=await f.req('/api/platform/auth/google/demo',jar,{});expect(login.status).toBe(200);
 const choice=(await read(await f.req('/consent',cookies(jar,login)))).consent;expect(choice?.scope).toBe('full');expect(choice?.accountId).toBeTruthy();
 const other=await f.choose('full');setSystemTime(Date.now()+6*60000);const staleLogin=await f.req('/api/platform/auth/google/demo',other,{});expect(staleLogin.status).toBe(200);
 expect((await read(await f.req('/consent',cookies(other,staleLogin)))).consent).toBeNull();
});

test('renewal preserves newer records without extending older records',async()=>{
 const f=fixture();const a=f.account();let jar=await f.choose('full',a.auth);await f.req('/event',jar,{});setSystemTime(Date.now()+29*86400000);
 jar=jar.replace(a.auth,`festival_guest=${f.store.issue(a.me.id)}`);jar=await f.choose('full',jar);await f.req('/event',jar,{});expect(f.count('collection_records')).toBe(2);setSystemTime(Date.now()+2*86400000);
 expect((await read(await f.req('/consent',jar))).consent?.scope).toBe('full');expect(f.count('collection_records')).toBe(1);
});

test('no-cookie creation is rate limited and short-lived; existing users can still withdraw',async()=>{
 const f=fixture();const existing=await f.choose('full');
 const statuses=await Promise.all(Array.from({length:150},async()=> (await f.req('/consent','',{version:2,scope:'none'})).status));
 expect(statuses).toContain(429);expect(f.count('collection_consents')).toBeLessThanOrEqual(120);
 expect((await f.req('/consent',existing,{version:2,scope:'none'})).status).toBe(200);
 setSystemTime(Date.now()+16*60000);await f.req('/consent');expect(f.count('collection_consents')).toBe(0);
});

test('revoking one browser does not revoke another browser for the same account',async()=>{
 const f=fixture();const a=f.account();const first=await f.choose('full',a.auth),second=await f.choose('full',a.auth);
 await f.choose('basic',first);expect((await read(await f.req('/consent',second))).consent?.scope).toBe('full');expect(f.revoked.length).toBe(1);
});


test('cookie rotation prevents old backup grants from reviving and restore cleanup removes old analytics',async()=>{
 const f=fixture();const old=await f.choose('full');await f.req('/event',old,{});
 f.runs.create({id:'keep',storyId:'story',storyVersion:1,currentSceneId:'start',startedAt:new Date().toISOString(),lastActiveAt:new Date().toISOString(),endedAt:null,outcome:null,foundEvidenceIds:[]});f.runs.rate('keep','story',5,new Date().toISOString());
 f.store.db.exec('CREATE TEMP TABLE backup_grants AS SELECT * FROM collection_consents; CREATE TEMP TABLE backup_events AS SELECT * FROM story_run_events; CREATE TEMP TABLE backup_records AS SELECT * FROM collection_records');
 const latest=await f.choose('none',old);
 f.store.db.exec('DELETE FROM collection_consents; INSERT INTO collection_consents SELECT * FROM backup_grants; INSERT INTO story_run_events SELECT * FROM backup_events; INSERT INTO collection_records SELECT * FROM backup_records');
 expect((await read(await f.req('/consent',latest))).consent).toBeNull();
 expect(f.count('collection_records')).toBe(1);resetRestoredConsent(f.store.db);
 expect((await read(await f.req('/consent',old))).consent).toBeNull();expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);expect(f.count('story_runs')).toBe(1);expect(f.count('story_ratings')).toBe(1);
});
