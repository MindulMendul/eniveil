import { CONSENT_VERSION, CONSENT_MAX_AGE, consentScopes, type CollectionConsent, type ConsentScope } from '@festival/shared/consent';
let current: CollectionConsent | null = null;
let generation = 0;
let pending: Promise<CollectionConsent | null> | null = null;
let saving: Promise<CollectionConsent> | null = null;
const signalKey = 'eniveil-consent-v2';
export const collectionConsent = () => current;
const fresh = () => !!current && Date.now() - Date.parse(current.updatedAt) < CONSENT_MAX_AGE * 1000;
export const allowsGA = () => fresh() && (current?.scope === 'basic' || current?.scope === 'full');
export const allowsPlayAnalytics = () => fresh() && current?.scope === 'full';
function publish(pending = false) { window.dispatchEvent(new CustomEvent('consent:changed', {detail:{pending}})); }
function validate(value: unknown): CollectionConsent | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as CollectionConsent;
  return c.version === CONSENT_VERSION && consentScopes.includes(c.scope) && typeof c.updatedAt === 'string' && Number.isFinite(Date.parse(c.updatedAt)) && Date.now() - Date.parse(c.updatedAt) < CONSENT_MAX_AGE * 1000
    && (c.accountId === null || typeof c.accountId === 'string') ? c : null;
}
async function read() {
  const response = await fetch('/api/platform/consent', {credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error('consent-read');
  return validate((await response.json()).consent);
}
export function syncCollectionConsent(force = false) {
  if (saving) return saving;
  if (pending && !force) return pending;
  const request = ++generation;
  current = null; publish(true);
  pending = read().then(value => {
    if (request !== generation) return current;
    current = value; publish(); return current;
  }).catch(error => {
    if (request !== generation) return current;
    current = null; publish();
    throw error;
  }).finally(() => { if (request === generation) pending = null; });
  return pending;
}
export function saveCollectionConsent(scope: ConsentScope) {
  if (saving) return Promise.reject(new Error('consent-busy'));
  saving = persistChoice(scope).finally(() => { saving = null; });
  return saving;
}
async function persistChoice(scope: ConsentScope) {
  pending = null;
  const request = ++generation;
  current = null; publish(true);
  const response = await fetch('/api/platform/consent', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:CONSENT_VERSION,scope})});
  if (!response.ok) throw new Error('consent-save');
  // Verify the HttpOnly preference cookie really persisted, and the account did not change.
  const saved = validate((await response.json()).consent);
  const confirmed = await read();
  if (request !== generation || !saved || !confirmed || confirmed.scope !== scope || saved.accountId !== confirmed.accountId || saved.updatedAt !== confirmed.updatedAt) throw new Error('consent-storage');
  current = confirmed; publish();
  try { localStorage.setItem(signalKey,JSON.stringify({at:Date.now(),scope})); } catch { /* Server preference remains authoritative. */ }
  channel?.postMessage('changed');
  return current;
}
let channel: BroadcastChannel | null = null;
export function watchCollectionConsent() {
  let expiryTimer: number | undefined;
  const refresh = () => { void syncCollectionConsent(true).catch(() => {}); };
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(signalKey); channel.onmessage = refresh;
  }
  window.addEventListener('consent:changed', () => {
    clearTimeout(expiryTimer);
    if (current) expiryTimer = window.setTimeout(refresh, Math.max(1, Math.min(86400000, Date.parse(current.updatedAt) + CONSENT_MAX_AGE * 1000 - Date.now())));
  });
  window.addEventListener('storage', event => { if (event.key === signalKey || event.key === null) refresh(); });
  window.addEventListener('consent:account', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
