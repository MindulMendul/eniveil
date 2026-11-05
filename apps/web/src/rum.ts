import {
  initializeFaro, ErrorsInstrumentation, WebVitalsInstrumentation,
  SessionInstrumentation, ViewInstrumentation, type Faro,
} from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

let rum: Faro | undefined;
const hosts = new Set(['mindul-murder-mystery.duckdns.org', 'qa-mindul-murder-mystery.duckdns.org']);

export function initRUM() {
  if (rum || !hosts.has(location.hostname)) return;
  const environment = location.hostname.startsWith('qa-') ? 'qa' : 'production';
  try {
    rum = initializeFaro({
      url: `${location.origin}/telemetry/collect`,
      app: { name: 'murder-parker-web', environment, version: import.meta.env.PUBLIC_RELEASE ?? 'local' },
      requestCompression: false,
      sessionTracking: { enabled: true, persistent: false, samplingRate: 1 },
      instrumentations: [
        new ErrorsInstrumentation(), new WebVitalsInstrumentation(),
        new SessionInstrumentation(), new ViewInstrumentation(),
        new TracingInstrumentation({
          resourceAttributes: { 'deployment.environment': environment },
          instrumentationOptions: {
            fetchInstrumentationOptions: { ignoreNetworkEvents: true },
            xhrInstrumentationOptions: { ignoreNetworkEvents: true },
          },
        }),
      ],
      beforeSend(item) {
        // Never attach nicknames, room invitations, form contents, or user identities.
        if (item.type === 'log') return null;
        item.meta = { ...item.meta, user: undefined, page: { url: `${location.origin}/` } };
        return item;
      },
    });
    rum.api.pushEvent('page_view');
  } catch {
    // Observability must not prevent a player from entering the game.
  }
}

export function rumEvent(name: string, attributes: Record<string, string> = {}) {
  try { rum?.api.pushEvent(name, attributes); } catch { /* best effort */ }
}

export function rumAPI(route: string, status: number, duration: number) {
  rumEvent('api_request', { route, status: String(status), duration_ms: String(Math.round(duration)) });
  if (status >= 400 && status !== 401) {
    if (route === '/api/rooms/join') rumEvent('room_join_failed', { status: String(status) });
    if (route === '/api/rooms') rumEvent('room_create_failed', { status: String(status) });
  }
}
