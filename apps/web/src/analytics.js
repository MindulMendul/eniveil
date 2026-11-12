import { allowsGA } from './shared/analytics/consent';
const configuredContainerId = import.meta.env.PUBLIC_GTM_CONTAINER_ID?.trim();
const containerId = configuredContainerId && /^GTM-[A-Z0-9]+$/.test(configuredContainerId)
  ? configuredContainerId : undefined;
// Legacy analytics-consent-v1 is deliberately not imported as an expanded grant.
export { syncCollectionConsent, saveCollectionConsent, collectionConsent } from './shared/analytics/consent';
export const analyticsConsent = () => allowsGA() ? 'granted' : 'denied';
const allowedParameters = new Set(['story_id','language','question_type','selected','outcome','clue_count','play_duration_seconds','stage','hint_number','page_path','dwell_time_seconds']);

/** @param {Record<string, string | number | boolean>} event */
function pushEvent(event) {
  const browserWindow = /** @type {Window & { dataLayer?: unknown[] }} */ (window);
  browserWindow.dataLayer?.push(event);
}

/** @type {boolean} */
let initialized = false;
/** @type {{ locale: string, path: string, startedAt: number, elapsedMs: number } | null} */
let activePage = null;

/** @param {{ finish?: boolean }} [options] */
function savePageDwell({ finish = false } = {}) {
  if (!activePage) return;
  const now = Date.now();
  if (activePage.startedAt) {
    activePage.elapsedMs += now - activePage.startedAt;
    activePage.startedAt = 0;
  }
  if (finish) {
    if (activePage.elapsedMs >= 1000) {
      trackEvent('page_dwell', {
        page_path: activePage.path,
        language: activePage.locale,
        dwell_time_seconds: Math.round(activePage.elapsedMs / 1000),
      });
    }
    activePage = null;
  }
}

/** Load GTM once, only after explicit analytics consent. */
export function initializeAnalytics() {
  if (initialized) return analyticsConsent() === 'granted';
  if (!containerId || typeof window === 'undefined' || analyticsConsent() !== 'granted') return false;
  const browserWindow = /** @type {Window & { dataLayer?: unknown[] }} */ (window);
  browserWindow.dataLayer ??= [];
  /** @param {...unknown} _args */
  function googleConsent(..._args) { browserWindow.dataLayer?.push(arguments); }
  googleConsent('consent', 'default', {analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  browserWindow.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) savePageDwell();
    else if (allowsGA() && activePage && !activePage.startedAt) activePage.startedAt = Date.now();
  });
  window.addEventListener('pagehide', () => savePageDwell({ finish: true }));
  window.addEventListener('consent:changed', (event) => {
    const detail = (/** @type {CustomEvent} */ (event)).detail;
    googleConsent('consent','update',{analytics_storage:allowsGA()?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    if (detail?.pending || detail?.error) { savePageDwell(); return; }
    if (!allowsGA()) { activePage = null; window.location.reload(); }
    else if (activePage && !activePage.startedAt && !document.hidden) activePage.startedAt = Date.now();
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.append(script);
  initialized = true;
  trackPageView(window.location.pathname.startsWith('/en') ? 'en' : 'ko');
  return true;
}

/** @param {string} locale */
export function trackPageView(locale) {
  if (!initialized || typeof window === 'undefined' || analyticsConsent() !== 'granted') return;
  if (activePage?.path === window.location.pathname) return;
  savePageDwell({ finish: true });
  activePage = {
    locale,
    // Room invite codes are carried in the query string; keep them out of analytics.
    path: window.location.pathname,
    startedAt: document.hidden ? 0 : Date.now(),
    elapsedMs: 0,
  };
  pushEvent({
    event: 'page_view',
    page_title: window.location.pathname,
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_path: window.location.pathname,
    page_referrer: '',
    language: locale,
  });
}

/** @param {string} eventName @param {Record<string, string | number | boolean>} [parameters] */
export function trackEvent(eventName, parameters = {}) {
  if (!initialized || typeof window === 'undefined' || analyticsConsent() !== 'granted') return;
  if (!/^(page_dwell|story_start|story_abandon|story_attempt_end|case_location_open|case_clue_open|case_question|case_evidence_present|case_accusation_evidence_select|case_hint_view)$/.test(eventName)) return;
  const safe = Object.fromEntries(Object.entries(parameters).filter(([key]) => allowedParameters.has(key)));
  pushEvent({ ...safe, event: eventName });
}

// Advertising collection is not included in either consent scope.
