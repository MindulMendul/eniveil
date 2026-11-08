import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { Store } from '../../store';
import { createFriendRoutes } from './friend-routes';
const cleanup: (() => void)[] = [];
const read = async (response: Response) => await response.json() as {friends: {id:string;nickname:string}[];incoming: unknown[];outgoing:unknown[]};
afterEach(() => { for (const run of cleanup.splice(0).reverse()) run(); });
function fixture(path = ':memory:') {
  const store = new Store(path);
  cleanup.push(() => store.close());
  const app = new Hono(); app.route('/api/friends', createFriendRoutes(store));
  app.onError((_error,c) => c.json({error:'Invalid input'},400));
  const account = (name: string) => { const me = store.googleAccount('google:' + name); store.rename(me,name); return {me,cookie:'festival_guest=' + store.issue(me.id)}; };
  const request = (path: string, cookie = '', body?: object) => app.request('http://localhost/api/friends' + path, {
    method: body ? 'POST' : 'GET', headers: {Cookie:cookie,'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}),
  });
  return {store,request,account};
}
test('friend requests require accounts and recipient consent; protect against self, duplicates and third parties', async () => {
  const {store,request,account} = fixture(); const a=account('Alice'),b=account('Bobby'),c=account('Carol');
  expect((await request('')).status).toBe(401);
  const guest=store.createGuest('Guest');
  expect((await request('', 'festival_guest='+store.issue(guest.id))).status).toBe(403);
  const search=await (await request('/search?nickname=ＡＬＩＣＥ',b.cookie)).json();
  expect(search).toEqual({items:[{id:a.me.id,nickname:'Alice'}]});
  expect((await request('/requests',a.cookie,{accountId:guest.id})).status).toBe(404);
  expect((await request('/requests',a.cookie,{accountId:a.me.id})).status).toBe(409);
  expect((await request('/requests',a.cookie,{accountId:b.me.id})).status).toBe(201);
  expect((await read(await request('',a.cookie))).friends).toEqual([]);
  expect((await request('/requests',b.cookie,{accountId:a.me.id})).status).toBe(409);
  expect((await request(`/requests/${a.me.id}/accept`,c.cookie,{})).status).toBe(404);
  expect((await request(`/requests/${b.me.id}/accept`,a.cookie,{})).status).toBe(404);
  expect((await request(`/requests/${a.me.id}/accept`,b.cookie,{})).status).toBe(200);
  expect((await read(await request('',a.cookie))).friends).toEqual([{id:b.me.id,nickname:'Bobby'}]);
  expect((await read(await request('',b.cookie))).friends).toEqual([{id:a.me.id,nickname:'Alice'}]);
  expect((await request('/requests',a.cookie,{accountId:b.me.id})).status).toBe(409);
  expect((await request(`/requests/${a.me.id}/accept`,b.cookie,{})).status).toBe(404);
  store.rename(b.me,'NewName');
  expect((await read(await request('',a.cookie))).friends[0]).toEqual({id:b.me.id,nickname:'NewName'});
  store.logout(b.me);
  expect((await request('',b.cookie)).status).toBe(401);
  expect((await read(await request('',a.cookie))).friends.length).toBe(1);
  store.deleteAccount(b.me);
  expect((await read(await request('',a.cookie))).friends).toEqual([]);
});
test('rejection remains private and relationships persist across process restarts', async () => {
  const dir=mkdtempSync(join(tmpdir(),'friend-test-')); cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));
  const db=join(dir,'test.sqlite');const first=fixture(db),a=first.account('Alice'),b=first.account('Bobby');
  await first.request('/requests',a.cookie,{accountId:b.me.id});
  expect((await first.request(`/requests/${a.me.id}/reject`,b.cookie,{})).status).toBe(200);
  expect((await read(await first.request('',a.cookie))).outgoing).toEqual([]);
  await first.request('/requests',a.cookie,{accountId:b.me.id});
  await first.request(`/requests/${a.me.id}/accept`,b.cookie,{});
  const second=fixture(db);
  expect((await read(await second.request('',a.cookie))).friends).toEqual([{id:b.me.id,nickname:'Bobby'}]);
});
