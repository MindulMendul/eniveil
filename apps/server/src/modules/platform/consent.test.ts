import { afterEach, expect, test, setSystemTime } from 'bun:test';
import { Hono } from 'hono';
import { Store } from '../../store';
import { ConsentService } from './consent';
import { createAccountRoutes } from './account-routes';
import { SQLiteStoryRunStore } from '../../infrastructure/sqlite/story-run-store';
const stores: Store[] = [], services: ConsentService[] = [];
afterEach(() => { setSystemTime(); for (const s of services.splice(0)) s.dispose(); for (const s of stores.splice(0)) s.close(); });
function fixture() {
 const store=new Store(':memory:');stores.push(store);const service=new ConsentService(store);services.push(service);
 const runs=new SQLiteStoryRunStore(store.db,{collection:{allows:service.acceptsRecord,recorded:service.recorded}});
 const app=new Hono();app.use('*',service.middleware);app.route('/',service.routes(false));app.route('/api/platform',createAccountRoutes({store,production:false,googleDemo:true}));
 app.post('/event',c=>{runs.record({id:crypto.randomUUID(),runId:null,storyId:'story',type:'story_impression',occurredAt:new Date().toISOString(),value:null,metadata:{}});return c.body(null,204)});
 app.post('/api/game/test',c=>c.body(null,204));
 const req=(path:string,cookie='',body?:unknown)=>app.request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const count=(table:string)=>(store.db.query(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n;
 return{store,runs,req,count};
}
const cookie=(r:Response)=>r.headers.get('set-cookie')!.split(';')[0]!;
const read=async(r:Response)=>await r.json() as {consent:{scope:string;accountId:string|null}|null};

test('default/basic store no extra events; full records and downgrade deletes them',async()=>{
 const f=fixture();expect((await read(await f.req('/consent'))).consent).toBeNull();await f.req('/event','',{});expect(f.count('story_run_events')).toBe(0);
 const id=cookie(await f.req('/consent','',{version:2,scope:'basic'}));await f.req('/event',id,{});expect(f.count('story_run_events')).toBe(0);
 await f.req('/consent',id,{version:2,scope:'full'});await f.req('/event',id,{});expect(f.count('collection_records')).toBe(1);expect(f.count('story_run_events')).toBe(1);
 await f.req('/consent',id,{version:2,scope:'basic'});expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
 expect((await f.req('/analytics/vitals',id,{})).status).toBe(403);
});

test('preferences cannot transfer between accounts or versions; account deletion removes extra data',async()=>{
 const f=fixture();const anon=cookie(await f.req('/consent','',{version:2,scope:'full'}));const a=f.store.createGuest('OwnerOne'),b=f.store.createGuest('OwnerTwo');const auth=(id:string)=>`festival_guest=${f.store.issue(id)}`;
 const signed=anon+'; '+auth(a.id);expect((await read(await f.req('/consent',signed))).consent).toBeNull();await f.req('/event',signed,{});expect(f.count('collection_records')).toBe(0);
 const owned=cookie(await f.req('/consent',signed,{version:2,scope:'full'}));const aCookie=owned+'; '+auth(a.id);await f.req('/event',aCookie,{});expect(f.count('collection_records')).toBe(1);
 expect((await read(await f.req('/consent',owned))).consent).toBeNull();expect((await read(await f.req('/consent',owned+'; '+auth(b.id)))).consent).toBeNull();
 for(const body of [{version:1,scope:'full'},{version:2,scope:'forged'},null])expect((await f.req('/consent',aCookie,body)).status).toBe(400);
 f.store.deleteAccount(a);expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
});

test('withdrawal stops other requests while preserving operational gameplay state',async()=>{
 const f=fixture();const id=cookie(await f.req('/consent','',{version:2,scope:'full'}));f.runs.create({id:'operational',storyId:'story',storyVersion:1,currentSceneId:'start',startedAt:new Date().toISOString(),lastActiveAt:new Date().toISOString(),endedAt:null,outcome:null,foundEvidenceIds:[]});
 await Promise.all([f.req('/event',id,{}),f.req('/event','',{})]);expect(f.count('collection_records')).toBe(1);
 await f.req('/consent',id,{version:2,scope:'none'});await f.req('/event',id,{});expect(f.count('collection_records')).toBe(0);expect((await read(await f.req('/consent',id))).consent?.scope).toBe('none');expect(f.count('story_runs')).toBe(1);
});

test('service API requires full consent regardless of client controls',async()=>{
 const f=fixture();expect((await f.req('/api/game/test','',{})).status).toBe(403);const id=cookie(await f.req('/consent','',{version:2,scope:'basic'}));expect((await f.req('/api/game/test',id,{})).status).toBe(403);
 await f.req('/consent',id,{version:2,scope:'full'});expect((await f.req('/api/game/test',id,{})).status).toBe(204);await f.req('/consent',id,{version:2,scope:'none'});expect((await f.req('/api/game/test',id,{})).status).toBe(403);
});

test('expired preferences stop collection and remove expired records',async()=>{
 const f=fixture();const id=cookie(await f.req('/consent','',{version:2,scope:'full'}));await f.req('/event',id,{});expect(f.count('collection_records')).toBe(1);setSystemTime(Date.now()+31*86400000);
 expect((await read(await f.req('/consent',id))).consent).toBeNull();expect(f.count('collection_records')).toBe(0);expect(f.count('story_run_events')).toBe(0);
});

test('first explicit full choice binds to Google demo sign-in without a second grant',async()=>{
 const f=fixture();const pref=cookie(await f.req('/consent','',{version:2,scope:'full'}));const login=await f.req('/api/platform/auth/google/demo',pref,{});expect(login.status).toBe(200);
 const auth=login.headers.getSetCookie().find(v=>v.startsWith('festival_guest='))!.split(';')[0]!;const choice=(await read(await f.req('/consent',pref+'; '+auth))).consent;expect(choice?.scope).toBe('full');expect(choice?.accountId).toBeTruthy();
});

test('renewal preserves newer records but does not extend older records',async()=>{
 const f=fixture();const id=cookie(await f.req('/consent','',{version:2,scope:'full'}));await f.req('/event',id,{});setSystemTime(Date.now()+29*86400000);await f.req('/consent',id,{version:2,scope:'full'});await f.req('/event',id,{});expect(f.count('collection_records')).toBe(2);
 setSystemTime(Date.now()+2*86400000);expect((await read(await f.req('/consent',id))).consent?.scope).toBe('full');expect(f.count('collection_records')).toBe(1);expect(f.count('story_run_events')).toBe(1);
});
