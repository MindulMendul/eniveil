import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { CONSENT_VERSION, CONSENT_MAX_AGE, ANONYMOUS_CONSENT_MAX_AGE, CONSENT_BIND_WINDOW_MS, consentScopes, type ConsentScope, type CollectionConsent } from '@festival/shared/consent';
import type { Store } from '../../store';

type RecordRow = { token: string; owner: string | null; scope: ConsentScope; version: number; updated: number };
type RequestConsent = { token: string; owner: string | null };
const cookieName = 'eniveil_collection';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const expires = (row: RecordRow) => row.updated + (row.owner === null ? ANONYMOUS_CONSENT_MAX_AGE : CONSENT_MAX_AGE) * 1000;

/** Server grants are browser/account scoped. Anonymous grants are deliberately short-lived. */
export class ConsentService {
  private readonly context = new AsyncLocalStorage<RequestConsent>();
  private lastPruned = 0;
  private newChoices = 0;
  private choicesResetAt = 0;
  private readonly retentionTimer: ReturnType<typeof setInterval>;
  constructor(private readonly store: Store, private readonly onRevoke: (token: string) => void = () => {}, private readonly production = false) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS collection_consents(token TEXT PRIMARY KEY,owner TEXT,scope TEXT NOT NULL,version INTEGER NOT NULL,updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS collection_consents_owner ON collection_consents(owner);
      CREATE TABLE IF NOT EXISTS collection_records(id TEXT NOT NULL,kind TEXT NOT NULL,token TEXT NOT NULL,occurred INTEGER NOT NULL,PRIMARY KEY(id,kind));
      CREATE INDEX IF NOT EXISTS collection_records_token ON collection_records(token);
      CREATE INDEX IF NOT EXISTS collection_records_occurred ON collection_records(occurred);`);
    this.retentionTimer = setInterval(() => { try { this.prune(); } catch (error) { console.error('Consent retention cleanup failed',error); } },60000);
    this.retentionTimer.unref();
  }
  dispose() { clearInterval(this.retentionTimer); }
  private lookup(token: string) { return this.store.db.query('SELECT * FROM collection_consents WHERE token=?').get(token) as RecordRow | null; }
  private row(token: string, owner: string | null): RecordRow | null {
    const row = this.lookup(token);
    return row?.owner === owner && row.version === CONSENT_VERSION && expires(row) > Date.now() ? row : null;
  }
  private eraseRecords(token: string) {
    if (this.store.db.query("SELECT 1 FROM sqlite_master WHERE name='story_run_events'").get()) this.store.db.query("DELETE FROM story_run_events WHERE id IN (SELECT id FROM collection_records WHERE token=? AND kind='event')").run(token);
    if (this.store.db.query("SELECT 1 FROM sqlite_master WHERE name='story_rum_vitals'").get()) this.store.db.query("DELETE FROM story_rum_vitals WHERE id IN (SELECT id FROM collection_records WHERE token=? AND kind='vital')").run(token);
    this.store.db.query('DELETE FROM collection_records WHERE token=?').run(token);
  }
  connectionGrant = (c: Context) => {
    const token = hash(getCookie(c,cookieName) ?? '');
    const owner = this.store.authenticateSession(getCookie(c,'festival_guest'))?.id ?? null;
    const row = this.row(token,owner);
    return row?.scope === 'full' ? { key: token, expires: expires(row) } : null;
  };
  allows = () => { const ctx = this.context.getStore(); return !!ctx && this.row(ctx.token,ctx.owner)?.scope === 'full'; };
  acceptsRecord = () => {
    const ctx = this.context.getStore();
    if (!ctx || !this.allows()) return false;
    const own = this.store.db.query('SELECT count(*) AS n FROM collection_records WHERE token=?').get(ctx.token) as {n:number};
    const total = this.store.db.query('SELECT count(*) AS n FROM collection_records').get() as {n:number};
    return own.n < 10000 && total.n < 50000;
  };
  recorded = (id: string, kind: 'event' | 'vital') => {
    const ctx = this.context.getStore();
    if (!ctx || !this.allows()) throw new Error('Collection consent is not active');
    this.store.db.query('INSERT INTO collection_records VALUES(?,?,?,?)').run(id,kind,ctx.token,Date.now());
  };
  private prune() {
    if (Date.now() - this.lastPruned < 60000) return;
    const cutoff = Date.now() - CONSENT_MAX_AGE * 1000;
    const expired = this.store.db.query('SELECT token FROM collection_consents WHERE (owner IS NULL AND updated<=?) OR updated<=?')
      .all(Date.now() - ANONYMOUS_CONSENT_MAX_AGE * 1000,cutoff) as {token:string}[];
    this.store.db.transaction(() => {
      for (const {token} of expired) { this.eraseRecords(token); this.store.db.query('DELETE FROM collection_consents WHERE token=?').run(token); this.onRevoke(token); }
      if (this.store.db.query("SELECT 1 FROM sqlite_master WHERE name='story_run_events'").get()) this.store.db.query("DELETE FROM story_run_events WHERE id IN (SELECT id FROM collection_records WHERE kind='event' AND occurred<=?)").run(cutoff);
      if (this.store.db.query("SELECT 1 FROM sqlite_master WHERE name='story_rum_vitals'").get()) this.store.db.query("DELETE FROM story_rum_vitals WHERE id IN (SELECT id FROM collection_records WHERE kind='vital' AND occurred<=?)").run(cutoff);
      this.store.db.query('DELETE FROM collection_records WHERE occurred<=?').run(cutoff);
    })();
    this.lastPruned = Date.now();
  }
  private canCreate(owner: string | null) {
    if (Date.now() >= this.choicesResetAt) { this.newChoices = 0; this.choicesResetAt = Date.now() + 60000; }
    if (this.newChoices >= 120) return false;
    const total = this.store.db.query('SELECT count(*) AS n FROM collection_consents').get() as {n:number};
    if (total.n >= 50000) return false;
    if (owner !== null) {
      const own = this.store.db.query('SELECT count(*) AS n FROM collection_consents WHERE owner=?').get(owner) as {n:number};
      if (own.n >= 20) return false;
    }
    this.newChoices++; return true;
  }
  private save(ctx: RequestConsent, scope: ConsentScope, raw: string) {
    const previous = this.lookup(ctx.token);
    const matching = this.row(ctx.token,ctx.owner);
    const token = hash(raw);
    this.store.db.transaction(() => {
      if (previous) {
        if (scope === 'full' && matching?.scope === 'full') this.store.db.query('UPDATE collection_records SET token=? WHERE token=?').run(token,ctx.token);
        else this.eraseRecords(ctx.token);
        this.store.db.query('DELETE FROM collection_consents WHERE token=?').run(ctx.token);
      }
      this.store.db.query('INSERT INTO collection_consents VALUES(?,?,?,?,?)').run(token,ctx.owner,scope,CONSENT_VERSION,Date.now());
    })();
    if (previous) this.onRevoke(ctx.token);
    return this.row(token,ctx.owner);
  }
  routes() {
    const app = new Hono();
    const preference = (row: RecordRow | null): CollectionConsent | null => row ? {version:row.version,scope:row.scope,updatedAt:new Date(row.updated).toISOString(),expiresAt:new Date(expires(row)).toISOString(),accountId:row.owner} : null;
    app.get('/consent', c => { const ctx = this.context.getStore(); return c.json({consent:ctx ? preference(this.row(ctx.token,ctx.owner)) : null}); });
    app.post('/consent',async c => {
      const body = await c.req.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.version !== CONSENT_VERSION || !consentScopes.includes(body.scope)) return c.json({error:'Invalid consent choice'},400);
      const ctx = this.context.getStore();
      if (!ctx) return c.json({error:'Consent context unavailable'},503);
      if (!this.lookup(ctx.token) && !this.canCreate(ctx.owner)) { c.header('Retry-After','60'); return c.json({error:'Too many new consent choices; try again shortly'},429); }
      const raw = crypto.randomUUID() + crypto.randomUUID();
      const saved = this.save(ctx,body.scope,raw);
      setCookie(c,cookieName,raw,{httpOnly:true,secure:this.production,sameSite:'Lax',path:'/',maxAge:ctx.owner === null ? ANONYMOUS_CONSENT_MAX_AGE : CONSENT_MAX_AGE});
      return c.json({consent:preference(saved)});
    });
    return app;
  }
  private bindFirstSignIn(c: Context, token: string) {
    const row = this.row(token,null);
    if (row?.scope !== 'full' || Date.now() - row.updated > CONSENT_BIND_WINDOW_MS || c.res.status >= 400) return;
    const credential = c.res.headers.getSetCookie().find(value => value.startsWith('festival_guest='))?.split(';')[0]?.slice('festival_guest='.length);
    const signedIn = credential ? this.store.authenticateSession(decodeURIComponent(credential)) : null;
    if (signedIn) {
      this.store.db.query('UPDATE collection_consents SET owner=? WHERE token=? AND owner IS NULL').run(signedIn.id,token);
      const raw = getCookie(c,cookieName)!;
      setCookie(c,cookieName,raw,{httpOnly:true,secure:this.production,sameSite:'Lax',path:'/',maxAge:CONSENT_MAX_AGE});
    }
  }
  middleware = async (c: Context, next: Next) => {
    c.header('Cache-Control','no-store');this.prune();
    const owner = this.store.authenticateSession(getCookie(c,'festival_guest'))?.id ?? null;
    const token = hash(getCookie(c,cookieName) ?? '');
    await this.context.run({owner,token},async()=>{
      if (c.req.path.endsWith('/analytics/vitals') && !this.allows()) { c.res=c.json({error:'Full collection consent required'},403); return; }
      const path=c.req.path;
      const protectedService=['/api/lobby','/api/friends','/api/game','/api/workshop','/api/platform/guest','/api/platform/auth/google','/api/platform/account/nickname'].some(prefix=>path===prefix||path.startsWith(prefix+'/'));
      const needsAccount=path.startsWith('/api/lobby')||path.startsWith('/api/friends');
      if (protectedService && !this.allows() && (!needsAccount || owner)) { c.res=c.json({code:'FULL_CONSENT_REQUIRED',error:'Full consent for game quality improvement is required to use this service.'},403);return; }
      await next();if (!owner) this.bindFirstSignIn(c,token);
    });
  };
}
