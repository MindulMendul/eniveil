import { CONSENT_VERSION, CONSENT_MAX_AGE, consentScopes, type CollectionConsent, type ConsentScope } from '@festival/shared/consent';
type RefreshReason = 'background' | 'account';
let current: CollectionConsent | null = null;
let checking = true;
let problem: string | null = null;
let documentGranted = false;
let generation = 0;
let pending: Promise<CollectionConsent | null> | null = null;
let saving: Promise<CollectionConsent> | null = null;
let queued: RefreshReason | null = null;
const signalKey = 'eniveil-consent-v2';
const blockKey = 'eniveil-consent-blocked-v2';
let channel: BroadcastChannel | null = null;
function blocked() {
  try { if (localStorage.getItem(blockKey) === 'blocked') return true; } catch { /* Try session storage. */ }
  try { if (sessionStorage.getItem(blockKey) === 'blocked') return true; } catch { /* History is a final local-only restriction. */ }
  return typeof history !== 'undefined' && history.state?.eniveilConsentBlocked === true;
}
function setBlock(value: boolean) {
  try { if (value) localStorage.setItem(blockKey,'blocked'); else localStorage.removeItem(blockKey); } catch { /* Never use a cache to grant consent. */ }
  try { if (value) sessionStorage.setItem(blockKey,'blocked'); else sessionStorage.removeItem(blockKey); } catch { /* History survives reload even when storage is restricted. */ }
  if (typeof history !== 'undefined') history.replaceState({...history.state,eniveilConsentBlocked:value},'');
}
const fresh = () => !!current && Date.now() < Date.parse(current.expiresAt);
export const collectionConsent = () => current;
export const consentProblem = () => problem;
export const allowsService = () => fresh() && !blocked() && current?.scope === 'full';
export const allowsGA = () => !checking && !problem && !blocked() && fresh() && (current?.scope === 'basic' || current?.scope === 'full');
export const allowsPlayAnalytics = () => !checking && !problem && allowsService();
function publish(detail: {pending?: boolean; error?: boolean; forceUnload?: boolean; restricting?: boolean} = {}) {
  if (!detail.pending && !detail.error && current && current.scope !== 'none' && !blocked()) documentGranted = true;
  window.dispatchEvent(new CustomEvent('consent:changed',{detail}));
}
function unloadRestrictedDocument() { if (documentGranted) { documentGranted = false; window.location.reload(); } }
function validate(value: unknown): CollectionConsent | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as CollectionConsent;
  if (typeof c.updatedAt !== 'string' || !Number.isFinite(Date.parse(c.updatedAt))) return null;
  const expiry = c.expiresAt ?? new Date(Date.parse(c.updatedAt) + CONSENT_MAX_AGE * 1000).toISOString();
  return c.version === CONSENT_VERSION && consentScopes.includes(c.scope) && typeof c.updatedAt === 'string' && Number.isFinite(Date.parse(c.updatedAt))
    && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > Date.now() && (c.accountId === null || typeof c.accountId === 'string') ? {...c,expiresAt:expiry} : null;
}
async function read() {
  const response=await fetch('/api/platform/consent',{credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error('consent-read');
  return validate((await response.json()).consent);
}
export function syncCollectionConsent(force = false, reason: RefreshReason = 'background') {
  if (saving !== null) { queued = reason === 'account' ? 'account' : queued ?? reason; return saving; }
  if (pending !== null && !force) return pending;
  const request=++generation;
  if (reason === 'account') current = null;
  checking=true;publish({pending:true});
  pending=read().then(value=>{
    if (request !== generation) return current;
    current=value;checking=false;
    problem=blocked() ? 'unsaved-restriction' : null;
    publish(problem ? {error:true,restricting:true} : {});
    if(problem)unloadRestrictedDocument();
    return current;
  }).catch(error=>{
    if (request !== generation) return current;
    checking=true;problem=blocked()?'unsaved-restriction':'read';publish({error:true,restricting:blocked()});
    if(blocked())unloadRestrictedDocument();
    throw error;
  }).finally(()=>{if(request===generation)pending=null});
  return pending;
}
export function saveCollectionConsent(scope: ConsentScope) {
  if (saving !== null) return Promise.reject(new Error('consent-busy'));
  saving=persistChoice(scope).then(async result=>{
    saving=null;
    const reason=queued;queued=null;
    if (reason !== null) await syncCollectionConsent(true,reason).catch(()=>{});
    return result;
  }).catch(async error=>{
    saving=null;const reason=queued;queued=null;
    if(reason !== null)await syncCollectionConsent(true,reason).catch(()=>{});
    throw error;
  }).finally(()=>{saving=null});
  return saving;
}
async function persistChoice(scope: ConsentScope) {
  pending=null;const request=++generation;
  const restrict=scope !== 'full';
  if (restrict) setBlock(true);
  checking=true;problem=null;publish({pending:true,restricting:restrict});
  try {
    const response=await fetch('/api/platform/consent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:CONSENT_VERSION,scope})});
    if (!response.ok) throw new Error('consent-save');
    const saved=validate((await response.json()).consent),confirmed=await read();
    if (request !== generation || !saved || !confirmed || confirmed.scope !== scope || saved.accountId !== confirmed.accountId || saved.updatedAt !== confirmed.updatedAt) throw new Error('consent-storage');
    setBlock(false);
    if (blocked()) throw new Error('consent-restriction-storage');
    current=confirmed;checking=false;problem=null;publish();
    try{localStorage.setItem(signalKey,JSON.stringify({at:Date.now()}))}catch{/* Broadcast is also available. */}
    channel?.postMessage('changed');return confirmed;
  } catch(error) {
    checking=true;problem='save';publish({error:true,forceUnload:restrict});
    if (restrict) { documentGranted = false; window.location.reload(); }
    throw error;
  }
}
export function watchCollectionConsent() {
  let expiryTimer: number | undefined;
  const refresh=()=>{void syncCollectionConsent(true).catch(()=>{})};
  if (typeof BroadcastChannel !== 'undefined') {channel=new BroadcastChannel(signalKey);channel.onmessage=refresh;}
  window.addEventListener('consent:changed',()=>{
    clearTimeout(expiryTimer);
    if(current)expiryTimer=window.setTimeout(refresh,Math.max(1,Math.min(86400000,Date.parse(current.expiresAt)-Date.now())));
  });
  window.addEventListener('storage',event=>{if(event.key===signalKey||event.key===blockKey||event.key===null)refresh()});
  window.addEventListener('consent:account',()=>{void syncCollectionConsent(true,'account').catch(()=>{})});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
