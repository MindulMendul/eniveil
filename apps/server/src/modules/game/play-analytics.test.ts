import { afterEach,test,expect } from 'bun:test';
import { Hono } from 'hono';
import { Store } from '../../store';
import { Game } from './game';
import { PlayAnalytics } from './play-analytics';
import { createPlayRoutes,playOwner } from './play-routes';
import { createGameRoutes } from './routes';
import { StorySessionService } from './story-session-service';
import { SQLiteStoryRunStore } from '../../infrastructure/sqlite/story-run-store';
import { fileStoryCatalog } from '../platform/stories/file-catalog';
import { storyCatalog } from '../platform/stories/catalog';
import type { PlayEvent } from '@festival/shared';
const stores:Store[]=[];afterEach(()=>{for(const store of stores.splice(0))store.close();});
function setup(){
 const store=new Store(':memory:');stores.push(store);let clock=100000;
 const analytics=new PlayAnalytics(store.db,()=>clock),game=new Game(store,storyCatalog,analytics);
 const users=['Alpha','Bravo','Charlie'].map(n=>store.createGuest(n));for(const user of users)game.online.set(user.id,1);
 const tokens=users.map(user=>store.issue(user.id));
 const app=new Hono();app.onError((e,c)=>c.json({error:e.message},400));
 const runs=new SQLiteStoryRunStore(store.db),sessions=new StorySessionService(fileStoryCatalog,runs);
 app.route('/api/game',createGameRoutes({stories:fileStoryCatalog,runs,sessions,analytics,owner:c=>playOwner(c,store,false)}));
 app.route('/api/play',createPlayRoutes({analytics,store,game,production:false,adminToken:'test-admin'}));
 const request=(path:string,body?:object,user=0)=>app.request(path,{method:body===undefined?'GET':'POST',headers:{cookie:`festival_guest=${tokens[user]}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return{store,analytics,game,users,request,app,setTime:(n:number)=>clock=n};
}
const evt=(sequence:number,stage:PlayEvent['stage']='explore',type:PlayEvent['type']='stage'):PlayEvent=>({id:crypto.randomUUID(),sequence,stage,type});

test('duplicate and late events preserve visits, separate active/unknown time and keep internal MMR private',()=>{
 const{analytics,users,setTime}=setup();const user=users[0].id;
 analytics.start('p','story',1,'solo',null,[{id:user,role:'detective'}],{title:'Story'});
 const first=evt(0);setTime(101000);analytics.events('p',user,[first]);
 setTime(106000);analytics.events('p',user,[evt(1,'explore','heartbeat')]);
 analytics.events('p',user,[first]);analytics.events('p',user,[evt(0,'alibi')]);
 expect(analytics.member('p',user).stage).toBe('explore');
 setTime(160000);analytics.events('p',user,[evt(2,'cross')]);
 const visits=analytics.db.query('SELECT * FROM play_visits WHERE session_id=? ORDER BY id').all('p') as {stage:string;active_ms:number;unmeasured_ms:number}[];
 expect(visits.map(v=>v.stage)).toEqual(['intro','explore','cross']);
 expect(visits[1]!.active_ms).toBe(5000);expect(visits[1]!.unmeasured_ms).toBe(54000);
 expect((analytics.db.query('SELECT count(*) AS n FROM play_events WHERE id=?').get(first.id) as {n:number}).n).toBe(1);
 analytics.finish('p','completed',{message:'Ending'});
 expect(()=>analytics.rate('p',user,5)).toThrow('결말');analytics.ending('p',user);analytics.rate('p',user,5);
 expect(analytics.view('p',user).rating).toBe(5);
 expect(JSON.stringify(analytics.view('p',user))).not.toContain('mmr');
 expect(()=>analytics.view('p',users[1].id)).toThrow('본인');
});

test('solo HTTP session ownership, ending gate, rating and recovery survive the run ending',async()=>{
 const{request,analytics,users}=setup();
 const start=await(await request('/api/game/sessions',{storyId:'deokil-trading-murder'})).json() as {runId:string};
 expect((await request(`/api/game/sessions/${start.runId}/advance`,{},1)).status).toBe(400);
 expect((await request(`/api/play/sessions/${start.runId}`,undefined,1)).status).toBe(400);
 await request(`/api/game/sessions/${start.runId}/advance`,{});
 const end=await request(`/api/game/sessions/${start.runId}/accuse`,{suspectId:'dae',evidenceIds:[]});expect(end.status).toBe(200);
 expect((await request(`/api/play/sessions/${start.runId}/rating`,{rating:5})).status).toBe(400);
 const restored=await(await request(`/api/game/sessions/${start.runId}`)).json() as {outcome:string};expect(restored.outcome).toBe('failed');
 await request(`/api/play/sessions/${start.runId}/ending`,{});
 expect((await request(`/api/play/sessions/${start.runId}/rating`,{rating:4})).status).toBe(200);
 const row=analytics.db.query('SELECT rating FROM story_ratings WHERE run_id=?').get(start.runId) as {rating:number};expect(row.rating).toBe(4);
 expect(analytics.pending(users[0].id)).toBeNull();
 expect((await request('/api/play/admin/stories/deokil-trading-murder')).status).toBe(401);
});

test('anonymous runs use an HttpOnly owner cookie, not possession of a run ID',async()=>{
 const{app}=setup();
 const start=await app.request('/api/game/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'deokil-trading-murder'})});
 const cookie=start.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');const data=await start.json() as {runId:string};
 const path=`/api/game/sessions/${data.runId}/advance`;
 expect((await app.request(path,{method:'POST'})).status).toBe(400);
 expect((await app.request(path,{method:'POST',headers:{cookie:cookie.split(';')[0]!}})).status).toBe(200);
});

test('multiplayer chat and independent endings retain records after the room is destroyed',async()=>{
 const{analytics,game,users,request}=setup();const[a,b,c]=users;
 const room=game.create(a!,'rehearsal');game.join(b!,room.code);game.command(a!,{type:'start',requestId:'s'});const id=room.sessionId!;
 expect((await request(`/api/play/sessions/${id}/chat`,{id:crypto.randomUUID(),text:'단서를 같이 보자'})).status).toBe(200);
 expect((await request(`/api/play/sessions/${id}/chat`,undefined,2)).status).toBe(400);
 game.command(a!,{type:'advance',requestId:'1'});game.command(a!,{type:'advance',requestId:'2'});
 game.command(a!,{type:'vote',requestId:'3',targetId:b!.id});game.command(b!,{type:'vote',requestId:'4',targetId:a!.id});
 expect(game.state.sessions[id]!.endedAt).not.toBeNull();expect(analytics.pending(b!.id)).toBe(id);
 expect(()=>game.command(a!,{type:'return',requestId:'5'})).toThrow();
 await request(`/api/play/sessions/${id}/ending`,{});await request(`/api/play/sessions/${id}/rating`,{rating:5});
 expect(game.roomFor(a!.id)).toBeUndefined();expect(game.roomFor(b!.id)?.id).toBe(room.id);
 expect(analytics.view(id,b!.id).endingComplete).toBe(false);
 await request(`/api/play/sessions/${id}/ending`,{},1);await request(`/api/play/sessions/${id}/rating`,{rating:null},1);
 expect(game.state.rooms[room.id]).toBeUndefined();expect(analytics.chats(id,a!.id)[0]!.text).toBe('단서를 같이 보자');
 expect(analytics.member(id,a!.id).rating).toBe(5);expect(analytics.member(id,b!.id).finished_at).not.toBeNull();
 expect(JSON.stringify(game.snapshot(c!))).not.toContain('mmr');
});

test('abandonment excludes ratings and stale/retention queries distinguish missing activity',()=>{
 const{analytics,users,setTime}=setup();analytics.start('p','story',1,'solo',null,[{id:users[0].id,role:'detective'}],{});
 setTime(2000000);expect(analytics.stale()).toEqual(['p']);analytics.finish('p','abandoned',null);
 expect(()=>analytics.ending('p',users[0].id)).toThrow();expect(analytics.pending(users[0].id)).toBeNull();
 setTime(400*86400000);analytics.pruneRetention();expect(analytics.play('p')).toBeNull();
});

test('failed room persistence rolls back both the rating and room membership',()=>{
 const{analytics,game,store,users}=setup();const[a,b]=users;
 const room=game.create(a!,'rehearsal');game.join(b!,room.code);game.command(a!,{type:'start',requestId:'s'});const id=room.sessionId!;
 game.command(a!,{type:'advance',requestId:'1'});game.command(a!,{type:'advance',requestId:'2'});game.command(a!,{type:'vote',requestId:'3',targetId:b!.id});game.command(b!,{type:'vote',requestId:'4',targetId:a!.id});
 analytics.ending(id,a!.id);const save=store.save;store.save=()=>{throw Error('disk full');};
 expect(()=>game.completeRating(a!.id,id,5)).toThrow('disk full');
 expect(game.roomFor(a!.id)?.memberIds).toHaveLength(2);expect(analytics.member(id,a!.id).finished_at).toBeNull();
 store.save=save;game.completeRating(a!.id,id,5);expect(game.roomFor(a!.id)).toBeUndefined();
});

test('independent client sequences do not discard a second tab and server skill stays out of owner views',()=>{
 const{analytics,users}=setup();const user=users[0].id;
 for(let i=0;i<3;i++){const id=`p${i}`;analytics.start(id,'story',1,'solo',null,[{id:user,role:'detective'}],{});analytics.finish(id,i===2?'failed':'completed',{});}
 analytics.start('next','story',2,'solo',null,[{id:user,role:'detective'}],{});
 const ids=[crypto.randomUUID(),crypto.randomUUID()];analytics.events('next',user,[{...evt(0,'explore'),clientId:ids[0]},{...evt(0,'cross'),clientId:ids[1]}]);
 expect(analytics.member('next',user).stage).toBe('cross');
 const raw=analytics.db.query('SELECT mmr,prior_plays,mmr_version FROM play_members WHERE session_id=?').get('next') as {mmr:number;prior_plays:number;mmr_version:string};
 expect(raw.prior_plays).toBe(3);expect(raw.mmr).toBeCloseTo(800+400*2/3);expect(raw.mmr_version).toBe('performance-v1');
 expect(JSON.stringify(analytics.view('next',user))).not.toContain('mmr');
});

test('a failed game start leaves no partial analytics session or role assignment',()=>{
 const{analytics,game,store,users}=setup();const[a,b]=users;const room=game.create(a!,'rehearsal');game.join(b!,room.code);
 store.save=()=>{throw Error('disk full');};expect(()=>game.command(a!,{type:'start',requestId:'s'})).toThrow('disk full');
 expect(game.needRoom(a!.id).sessionId).toBeNull();expect(Object.keys(game.state.sessions)).toHaveLength(0);
 expect((analytics.db.query('SELECT count(*) AS n FROM play_sessions').get() as {n:number}).n).toBe(0);
});

test('repeated start requests resume the owned active run instead of double-counting a play',async()=>{
 const{request,analytics}=setup();const first=await(await request('/api/game/sessions',{storyId:'deokil-trading-murder'})).json() as {runId:string};
 const retry=await(await request('/api/game/sessions',{storyId:'deokil-trading-murder'})).json() as {runId:string};expect(retry.runId).toBe(first.runId);
 expect((analytics.db.query('SELECT count(*) AS n FROM play_sessions').get() as {n:number}).n).toBe(1);
});

test('an unrated ended solo room expires while its owner can still recover the ending',()=>{
 const{analytics,game,users,setTime}=setup();const user=users[0];const room=game.create(user!,'deokil-trading-murder');game.command(user!,{type:'start',requestId:'s'});
 analytics.start('solo','deokil-trading-murder',1,'solo',room.id,[{id:user!.id,role:'detective'}],{});
 setTime(Date.now()-600001);analytics.finish('solo','completed',{cues:[]});game.cleanupFinishedRooms();
 expect(game.state.rooms[room.id]).toBeUndefined();expect(analytics.pending(user!.id)).toBe('solo');expect(analytics.view('solo',user!.id).endingComplete).toBe(false);
});
