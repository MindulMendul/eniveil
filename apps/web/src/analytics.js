const configuredMeasurementId = import.meta.env.PUBLIC_GA_MEASUREMENT_ID?.trim();
const measurementId = configuredMeasurementId && /^G-[A-Z0-9]+$/i.test(configuredMeasurementId)
  ? configuredMeasurementId
  : undefined;

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

/**
 * Loads GA4 only when a public measurement ID is configured.
 * @returns {boolean} Whether analytics is available in this build.
 */
export function initializeAnalytics() {
  if (initialized) return Boolean(measurementId);
  if (!measurementId || typeof window === 'undefined') return false;

  const browserWindow = /** @type {Window & { dataLayer?: unknown[], gtag?: (...args: unknown[]) => void }} */ (window);
  browserWindow.dataLayer = browserWindow.dataLayer ?? [];
  browserWindow.gtag = (...args) => browserWindow.dataLayer?.push(args);
  browserWindow.gtag('js', new Date());
  browserWindow.gtag('config', measurementId, { send_page_view: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) savePageDwell();
    else if (activePage && !activePage.startedAt) activePage.startedAt = Date.now();
  });
  window.addEventListener('pagehide', () => savePageDwell({ finish: true }));

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);

  initialized = true;
  return true;
}

/** @param {string} locale */
export function trackPageView(locale) {
  if (!measurementId || typeof window === 'undefined') return;
  savePageDwell({ finish: true });
  activePage = {
    locale,
    // Room invite codes are carried in the query string; keep them out of analytics.
    path: window.location.pathname,
    startedAt: document.hidden ? 0 : Date.now(),
    elapsedMs: 0,
  };
  const browserWindow = /** @type {Window & { gtag?: (...args: unknown[]) => void }} */ (window);
  browserWindow.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_path: window.location.pathname,
    language: locale,
  });
}

/** @param {string} eventName @param {Record<string, string | number | boolean>} [parameters] */
export function trackEvent(eventName, parameters = {}) {
  if (!measurementId || typeof window === 'undefined') return;
  const browserWindow = /** @type {Window & { gtag?: (...args: unknown[]) => void }} */ (window);
  browserWindow.gtag?.('event', eventName, parameters);
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
