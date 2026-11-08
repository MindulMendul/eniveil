const configuredContainerId = import.meta.env.PUBLIC_GTM_CONTAINER_ID?.trim();
const containerId = configuredContainerId && /^GTM-[A-Z0-9]+$/.test(configuredContainerId)
  ? configuredContainerId : undefined;
const consentKey = 'analytics-consent-v1';

/** @returns {'granted' | 'denied' | null} */
export function analyticsConsent() {
  try {
    const value = localStorage.getItem(consentKey);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch { return null; }
}

/** @param {'granted' | 'denied'} value */
export function setAnalyticsConsent(value) {
  try {
    localStorage.setItem(consentKey, value);
  } catch {
    // Stop app events immediately; never reload into a previously saved grant.
    if (value === 'denied') {
      sessionConsent = 'denied';
      try {
        localStorage.removeItem(consentKey);
        if (localStorage.getItem(consentKey) === null) {
          if (initialized) window.location.reload();
          return true;
        }
      } catch { /* The UI reports that the choice could not be saved. */ }
    }
    return false;
  }
  sessionConsent = value;
  if (value === 'denied' && initialized) {
    // Unloading a script cannot stop tags that already executed. Reload without GTM.
    window.location.reload();
    return true;
  }
  if (value === 'granted') initializeAnalytics();
  return true;
}

/** @type {'granted' | 'denied' | null} */
let sessionConsent = null;
const allowedParameters = new Set(['story_id','language','question_type','selected','outcome','clue_count','play_duration_seconds','stage','hint_number','page_path','dwell_time_seconds','placement_id','campaign_id','creative_id']);

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
  if (initialized) return (sessionConsent ?? analyticsConsent()) === 'granted';
  if (!containerId || typeof window === 'undefined' || (sessionConsent ?? analyticsConsent()) !== 'granted') return false;
  const browserWindow = /** @type {Window & { dataLayer?: unknown[] }} */ (window);
  browserWindow.dataLayer ??= [];
  browserWindow.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) savePageDwell();
    else if (activePage && !activePage.startedAt) activePage.startedAt = Date.now();
  });
  window.addEventListener('pagehide', () => savePageDwell({ finish: true }));
  window.addEventListener('storage', (event) => {
    if ((event.key === consentKey && event.newValue !== 'granted') || event.key === null) {
      sessionConsent = 'denied';
      window.location.reload();
    }
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
  if (!initialized || typeof window === 'undefined' || (sessionConsent ?? analyticsConsent()) !== 'granted') return;
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
  if (!initialized || typeof window === 'undefined' || (sessionConsent ?? analyticsConsent()) !== 'granted') return;
  const safe = Object.fromEntries(Object.entries(parameters).filter(([key]) => allowedParameters.has(key)));
  pushEvent({ ...safe, event: eventName });
}

/** @param {string} placementId @param {string} [campaignId] @param {string} [creativeId] */
export function trackAdImpression(placementId, campaignId = '', creativeId = '') {
  trackEvent('ad_impression', {
    placement_id: placementId,
    ...(campaignId ? { campaign_id: campaignId } : {}),
    ...(creativeId ? { creative_id: creativeId } : {}),
  });
}

/** @param {string} placementId @param {string} [campaignId] @param {string} [creativeId] */
export function trackAdClick(placementId, campaignId = '', creativeId = '') {
  trackEvent('ad_click', {
    placement_id: placementId,
    ...(campaignId ? { campaign_id: campaignId } : {}),
    ...(creativeId ? { creative_id: creativeId } : {}),
  });
}
