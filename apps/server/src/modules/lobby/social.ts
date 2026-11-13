import { inviteFriendSchema, invitationResponseSchema } from '@festival/shared';
import { Hono } from 'hono';
import type { ApiEnv } from '../http/env';
import type { Game } from '../game/game';
import type { Store } from '../../store';

type Invite = { id: string; roomId: string; hostId: string; targetId: string; expires: number; status: 'pending' | 'accepted' | 'declined' };
export function socialRoutes(store: Store, game: Game, broadcast: () => void, inLobby: (id: string) => boolean = () => true, changed: (ids: string[]) => void = () => {}) {
  const app = new Hono<ApiEnv>();
  const invites = new Map<string, Invite>();
  const notices = new Map<string, { id: string; text: string; expires: number }[]>();
  const waiting = (id: string) => (game.online.get(id) ?? 0) > 0 && !game.roomFor(id) && inLobby(id);
  const presence = (id: string) => {
    if (!(game.online.get(id) ?? 0)) return 'offline' as const;
    if (waiting(id)) return 'lobby' as const;
    const room = game.roomFor(id);
    return room?.sessionId || room?.soloStarted ? 'playing' as const : 'room_waiting' as const;
  };
  function prune() {
    for (const [hostId, items] of notices) {
      const remaining = items.filter(item => item.expires > Date.now());
      if (!game.state.guests[hostId] || !remaining.length) notices.delete(hostId);
      else notices.set(hostId, remaining);
    }
    for (const [id, invite] of invites) {
      const room = game.state.rooms[invite.roomId];
      if (invite.expires <= Date.now() || !room || room.hostId !== invite.hostId || room.sessionId || room.soloStarted || !store.areFriends(invite.hostId, invite.targetId) || (invite.status === 'pending' && !waiting(invite.targetId))) invites.delete(id);
    }
  }
  app.get('/social', c => {
    prune();
    const me = c.get('guest');
    const counts = new Map<string, number>();
    for (const session of Object.values(game.state.sessions)) {
      if (!session.endedAt || session.phase !== 'reveal' || !session.participants.some(p => p.id === me.id)) continue;
      for (const id of new Set(session.participants.map(p => p.id))) if (id !== me.id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const friends = store.friendIds(me.id).map(id => game.state.guests[id]).filter((other): other is NonNullable<typeof other> => !!other).map(other => ({
      ...other, online: (game.online.get(other.id) ?? 0) > 0, available: waiting(other.id), presence: presence(other.id),
      gamesTogether: counts.get(other.id) ?? 0,
    }));
    return c.json({ friends, invitations: [...invites.values()].filter(i => i.targetId === me.id && i.status === 'pending').map(i => ({ id: i.id, host: game.state.guests[i.hostId]?.nickname, room: game.summary(game.state.rooms[i.roomId]), expires: i.expires })), notices: notices.get(me.id) ?? [] });
  });
  app.post('/invitations', async c => {
    const me = c.get('guest');
    const { targetId } = inviteFriendSchema.parse(await c.req.json());
    prune();
    const room = game.needRoom(me.id);
    if (room.hostId !== me.id || room.sessionId || room.soloStarted) throw Error('방 대기방의 방장만 초대할 수 있어.');
    if (!store.areFriends(me.id, targetId) || !waiting(targetId)) throw Error('로비에서 대기 중인 온라인 친구만 초대할 수 있어.');
    if (game.summary(room).count >= game.summary(room).capacity) throw Error('방이 가득 찼어.');
    if (invites.size >= 4096) throw Error('잠시 후 다시 초대해 줘.');
    const existing = [...invites.values()].find(i => i.roomId === room.id && i.targetId === targetId && i.status === 'pending');
    if (existing) return c.json({ id: existing.id });
    const invite: Invite = { id: crypto.randomUUID(), roomId: room.id, hostId: me.id, targetId, status: 'pending', expires: Date.now() + 120000 };
    invites.set(invite.id, invite);
    changed([me.id, targetId]);
    return c.json({ id: invite.id }, 201);
  });
  app.post('/invitations/:id/respond', async c => {
    const me = c.get('guest');
    const { accept, pin } = invitationResponseSchema.parse(await c.req.json());
    // Validate after the asynchronous body read; room/presence may have changed.
    prune();
    const invite = invites.get(c.req.param('id'));
    if (!invite || invite.targetId !== me.id) throw Error('만료되었거나 유효하지 않은 초대야.');
    if (invite.status !== 'pending') return c.json({ ok: true });
    if (!waiting(me.id)) throw Error('로비에서 대기 중일 때만 응답할 수 있어.');
    if (accept) {
      const room = game.state.rooms[invite.roomId];
      game.join(me, room.code, pin);
      invite.status = 'accepted';
    } else {
      invite.status = 'declined';
      const list = notices.get(invite.hostId) ?? [];
      notices.set(invite.hostId, [...list.slice(-19), { id: invite.id, text: `${me.nickname}님이 초대를 거절했습니다.`, expires: Date.now() + 300000 }]);
    }
    if (accept) broadcast();
    changed([me.id, invite.hostId, ...store.friendIds(me.id)]);
    return c.json({ ok: true });
  });
  app.post('/notices/:id/dismiss', c => {
    const me = c.get('guest');
    notices.set(me.id, (notices.get(me.id) ?? []).filter(n => n.id !== c.req.param('id')));
    changed([me.id]);
    return c.json({ ok: true });
  });
  return app;
}
