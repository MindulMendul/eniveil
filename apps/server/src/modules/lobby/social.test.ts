import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { Store } from '../../store';
import { Game } from '../game/game';
import { storyCatalog } from '../platform/stories/catalog';
import { createFriendRoutes } from '../platform/friend-routes';
import { socialRoutes } from './social';
import type { ApiEnv } from '../http/env';

function setup(inLobby: (id: string) => boolean = () => true) {
  const store = new Store(':memory:');
  createFriendRoutes(store);
  const people = ['Host', 'Friend', 'Other'].map(n => store.createGuest(n));
  const [host, friend, other] = people;
  for (const target of [friend, other]) {
    const pair = [host.id, target.id].sort();
    store.db.query("INSERT INTO friend_connections VALUES(?,?,?,?,'accepted')").run(pair[0],pair[1],host.id,target.id);
  }
  const game = new Game(store, storyCatalog);
  for (const p of people) game.online.set(p.id, 1);
  const app = new Hono<ApiEnv>();
  app.use('*', async (c,next) => { c.set('guest', store.state.guests[c.req.header('x-user')!]!); await next(); });
  app.onError((e,c) => c.json({ error: e.message }, 400));
  app.route('/', socialRoutes(store,game,()=>{},inLobby));
  const req = (user: typeof host, path: string, body?: object) => app.request(path, { method: body ? 'POST' : 'GET', headers: { 'x-user': user.id, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { store,game,host,friend,other,req };
}

test('PIN preserves leading zeroes and never leaks; friends-only checks all joins', () => {
  const {store,game,host,friend,other} = setup();
  try {
    const secret = game.create(host,'rehearsal','secret','1234');
    expect(() => game.join(friend,secret.code,'1')).toThrow();
    expect(() => game.join(friend,secret.code,'0002')).toThrow();
    expect(JSON.stringify(game.snapshot(friend))).not.toContain('pinHash');
    game.join(friend,secret.code,'1234');
    expect(secret.memberIds.length).toBe(2);
    game.command(friend,{type:'leave',requestId:'leave'});
    game.command(host,{type:'leave',requestId:'leave'});
    const room = game.create(host,'rehearsal','friends');
    store.db.query('DELETE FROM friend_connections WHERE recipient_id=?').run(other.id);
    expect(game.snapshot(other).rooms).toHaveLength(0);
    expect(() => game.join(other,room.code)).toThrow();
    game.join(friend,room.code);
  } finally { store.close(); }
});

test('only host can invite available friends; duplicate rejection notifies once', async () => {
  const {store,game,host,friend,other,req} = setup();
  try {
    game.create(host,'rehearsal');
    expect((await req(friend,'/invitations',{targetId:other.id})).status).toBe(400);
    game.online.set(friend.id,0);
    expect((await req(host,'/invitations',{targetId:friend.id})).status).toBe(400);
    game.online.set(friend.id,1);
    const invite = await (await req(host,'/invitations',{targetId:friend.id})).json() as { id: string };
    expect((await (await req(host,'/invitations',{targetId:friend.id})).json() as {id:string}).id).toBe(invite.id);
    expect((await req(other,`/invitations/${invite.id}/respond`,{accept:false})).status).toBe(400);
    await req(friend,`/invitations/${invite.id}/respond`,{accept:false});
    await req(friend,`/invitations/${invite.id}/respond`,{accept:false});
    const state = await (await req(host,'/social')).json() as { notices: {text:string}[] };
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].text).toContain(friend.nickname);
  } finally { store.close(); }
});

test('simultaneous accepts cannot overfill; expired host invites cannot move users', async () => {
  const {store,game,host,friend,other,req} = setup();
  try {
    const room = game.create(host,'rehearsal');
    const a = await (await req(host,'/invitations',{targetId:friend.id})).json() as { id: string };
    const b = await (await req(host,'/invitations',{targetId:other.id})).json() as { id: string };
    const results = await Promise.all([req(friend,`/invitations/${a.id}/respond`,{accept:true}),req(other,`/invitations/${b.id}/respond`,{accept:true})]);
    expect(results.map(r=>r.status).sort()).toEqual([200,400]);
    expect(room.memberIds).toHaveLength(2);
    const remaining = game.roomFor(friend.id) ? other : friend;
    game.command(host,{type:'leave',requestId:'leave'});
    expect((await req(remaining,`/invitations/${game.roomFor(friend.id) ? b.id : a.id}/respond`,{accept:true})).status).toBe(400);
    expect(game.roomFor(remaining.id)).toBeUndefined();
  } finally { store.close(); }
});

test('secret invitations require PIN; leaving lobby invalidates pending invitations', async () => {
  const {store,game,host,friend,other,req} = setup();
  try {
    const room = game.create(host,'rehearsal','secret','0000');
    const invite = await (await req(host,'/invitations',{targetId:friend.id})).json() as {id:string};
    expect((await req(friend,`/invitations/${invite.id}/respond`,{accept:true})).status).toBe(400);
    expect(game.roomFor(friend.id)).toBeUndefined();
    expect((await req(friend,`/invitations/${invite.id}/respond`,{accept:true,pin:'0000'})).status).toBe(200);
    game.command(friend,{type:'leave',requestId:'leave'});
    const next = await (await req(host,'/invitations',{targetId:other.id})).json() as {id:string};
    game.online.set(other.id,0);
    expect((await req(other,`/invitations/${next.id}/respond`,{accept:false})).status).toBe(400);
    const state = await (await req(host,'/social')).json() as {notices: unknown[]};
    expect(state.notices).toHaveLength(0);
    expect(room.memberIds).toEqual([host.id]);
  } finally { store.close(); }
});


test('online users outside the common lobby cannot receive invitations', async () => {
  const lobby = new Set<string>();
  const {store,game,host,friend,req} = setup(id => lobby.has(id));
  try {
    game.create(host,'rehearsal');
    expect((await req(host,'/invitations',{targetId:friend.id})).status).toBe(400);
    lobby.add(friend.id);
    expect((await req(host,'/invitations',{targetId:friend.id})).status).toBe(201);
    lobby.delete(friend.id);
    const state = await (await req(friend,'/social')).json() as {invitations: unknown[]};
    expect(state.invitations).toHaveLength(0);
  } finally { store.close(); }
});

test('friend presence distinguishes lobby, room waiting, playing, and offline without room details', async () => {
  const {store,game,host,friend,other,req} = setup();
  try {
    const status = async (id: string) => {
      const social = await (await req(host, '/social')).json() as { friends: { id: string; presence: string }[] };
      return social.friends.find(item => item.id === id)?.presence;
    };
    expect(await status(friend.id)).toBe('lobby');
    const room = game.create(friend, 'rehearsal');
    expect(await status(friend.id)).toBe('room_waiting');
    game.join(other, room.code);
    game.command(friend, { type: 'start', requestId: 'start' });
    expect(await status(friend.id)).toBe('playing');
    game.online.set(friend.id, 0);
    expect(await status(friend.id)).toBe('offline');
  } finally { store.close(); }
});

test('shared game count includes completed games once and excludes unfinished ones', async () => {
  const {store,game,host,friend,req} = setup();
  try {
    game.create(host,'rehearsal');
    game.join(friend,game.needRoom(host.id).code);
    game.command(host,{type:'start',requestId:'start'});
    const before = await (await req(host,'/social')).json() as {friends:{id:string;gamesTogether:number}[]};
    expect(before.friends.find(f=>f.id===friend.id)?.gamesTogether).toBe(0);
    game.command(host,{type:'advance',requestId:'advance1'});
    game.command(host,{type:'advance',requestId:'advance2'});
    game.command(host,{type:'advance',requestId:'advance3'});
    game.command(host,{type:'advance',requestId:'advance4'});
    game.command(host,{type:'vote',requestId:'vote1',targetId:friend.id});
    game.command(friend,{type:'vote',requestId:'vote2',targetId:host.id});
    game.command(host,{type:'return',requestId:'return'});
    for (let i=0;i<2;i++) {
      const after = await (await req(host,'/social')).json() as {friends:{id:string;gamesTogether:number}[]};
      expect(after.friends.find(f=>f.id===friend.id)?.gamesTogether).toBe(1);
    }
  } finally { store.close(); }
});

test('secret room PIN throttling is per guest, so an attack cannot lock out a correct entrant', () => {
  const {store,game,host,friend} = setup();
  try {
    const room = game.create(host,'rehearsal','secret','0001');
    const attacker = store.createGuest('Attacker');
    for (let i=0;i<10;i++) expect(() => game.join(attacker,room.code,'9999')).toThrow('PIN을 확인');
    expect(room.pinFailures?.[attacker.id]?.count).toBe(10);
    expect(() => game.join(attacker,room.code,'9999')).toThrow('잠겼어');
    game.join(friend,room.code,'0001');
    expect(room.memberIds).toHaveLength(2);
    // A correct PIN is always accepted; a previous typo must not block entry.
    game.command(friend,{type:'leave',requestId:'leave'});
    game.join(attacker,room.code,'0001');
    expect(room.memberIds).toHaveLength(2);
  } finally { store.close(); }
});
