import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { friendAccountIdSchema, friendRequestSchema, nicknameSchema, type Guest } from '@festival/shared';
import type { Store } from '../../store';

type Connection = { sender_id: string; recipient_id: string; status: 'pending' | 'accepted' };
export function createFriendRoutes(store: Store, options: { isOnline?: (id: string) => boolean } = {}) {
  const app = new Hono<{ Variables: { me: Guest } }>();
  store.db.exec(`CREATE TABLE IF NOT EXISTS friend_connections (
    low_id TEXT NOT NULL, high_id TEXT NOT NULL,
    sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
    PRIMARY KEY(low_id, high_id), CHECK(sender_id <> recipient_id)
  ); CREATE INDEX IF NOT EXISTS friend_sender ON friend_connections(sender_id);
     CREATE INDEX IF NOT EXISTS friend_recipient ON friend_connections(recipient_id);`);
  const member = (id: string) => {
    const guest = store.state.guests[id];
    return guest?.nickname && store.accountType(id) === 'google' ? { id, nickname: guest.nickname } : null;
  };
  const pair = (a: string, b: string) => [a, b].sort((left, right) => left < right ? -1 : left > right ? 1 : 0) as [string, string];
  const connection = (a: string, b: string) => store.db.query('SELECT sender_id,recipient_id,status FROM friend_connections WHERE low_id=? AND high_id=?').get(...pair(a, b)) as Connection | null;
  const count = (id: string) => (store.db.query('SELECT count(*) AS n FROM friend_connections WHERE sender_id=? OR recipient_id=?').get(id,id) as { n:number }).n;
  const attempts = new Map<string, { count: number; until: number }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const me = store.authenticate(getCookie(c, 'festival_guest'));
    if (!me) return c.json({ error: '계정 로그인이 필요해요.' }, 401);
    if (store.accountType(me.id) !== 'google') return c.json({ error: '계정 로그인이 필요해요.' }, 403);
    const expectedAccount = c.req.header('x-account-id');
    if (expectedAccount && expectedAccount !== me.id) return c.json({ error: '로그인 계정이 변경됐어요. 다시 로그인해 주세요.' }, 401);
    c.set('me', me);
    await next();
  });
  app.get('/', c => {
    const me = c.get('me');
    const rows = store.db.query('SELECT sender_id,recipient_id,status FROM friend_connections WHERE sender_id=? OR recipient_id=? LIMIT 500').all(me.id, me.id) as Connection[];
    const friends: {id:string;nickname:string;online?:boolean}[] = [], incoming: typeof friends = [], outgoing: typeof friends = [];
    for (const row of rows) {
      const other = member(row.sender_id === me.id ? row.recipient_id : row.sender_id);
      if (!other) continue;
      if (row.status === 'accepted') friends.push({ ...other, ...(options.isOnline ? {online: options.isOnline(other.id)} : {}) });
      else if (row.recipient_id === me.id) incoming.push(other);
      else outgoing.push(other);
    }
    return c.json({ friends, incoming, outgoing });
  });
  app.get('/search', c => {
    const me = c.get('me'), now = Date.now();
    for (const [id,bucket] of attempts) if (bucket.until <= now) attempts.delete(id);
    const bucket = attempts.get(me.id) ?? { count: 0, until: now + 60000 };
    if (attempts.size >= 4096 && !attempts.has(me.id)) return c.json({ error: '잠시 후 다시 시도해 주세요.' }, 429);
    attempts.set(me.id, bucket);
    if (++bucket.count > 30) { c.header('Retry-After', '60'); return c.json({ error: '잠시 후 다시 시도해 주세요.' }, 429); }
    const nickname = nicknameSchema.parse(c.req.query('nickname'));
    return c.json({ items: store.accountsNamed(nickname).map(guest => ({ id: guest.id, nickname: guest.nickname })) });
  });
  app.post('/requests', async c => {
    const me = c.get('me'), target = friendRequestSchema.parse(await c.req.json()).accountId;
    if (!member(target)) return c.json({ error: '사용자를 찾을 수 없어요.' }, 404);
    if (target === me.id) return c.json({ error: '자기 자신은 추가할 수 없어요.' }, 409);
    const created = store.db.transaction(() => {
      if (connection(me.id,target)) return false;
      if (count(me.id) >= 500 || count(target) >= 500) return false;
      store.db.query("INSERT INTO friend_connections VALUES(?,?,?,?,'pending')").run(...pair(me.id,target),me.id,target);
      return true;
    })();
    return created ? c.json({ requested: true }, 201) : c.json({ error: '이미 친구이거나 대기 중인 요청이 있어요. 목록과 요청 한도를 확인해 주세요.' }, 409);
  });
  const act = (c: Context<{ Variables: { me: Guest } }>, accept: boolean) => {
    const me = c.get('me'), sender = friendAccountIdSchema.parse(c.req.param('id'));
    const changed = store.db.transaction(() => {
      const row = connection(me.id,sender);
      if (!row || row.status !== 'pending' || row.recipient_id !== me.id || !member(sender)) return false;
      if (accept) store.db.query("UPDATE friend_connections SET status='accepted' WHERE low_id=? AND high_id=?").run(...pair(me.id,sender));
      else store.db.query('DELETE FROM friend_connections WHERE low_id=? AND high_id=?').run(...pair(me.id,sender));
      return true;
    })();
    return changed ? c.json({ updated: true }) : c.json({ error: '받은 요청을 찾을 수 없어요.' }, 404);
  };
  app.post('/requests/:id/accept', c => act(c, true));
  app.post('/requests/:id/reject', c => act(c, false));
  return app;
}
