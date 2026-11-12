import { allowsPlayAnalytics } from './shared/analytics/consent';
import {
  ErrorsInstrumentation,
  initializeFaro,
  SessionInstrumentation,
  ViewInstrumentation,
  WebVitalsInstrumentation,
  type Faro,
} from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

let faro: Faro | undefined;
let watchingConsent = false;
const allowedHosts = new Set([
  "eniveil.com",
  "mindul-murder-mystery.duckdns.org",
  "qa-mindul-murder-mystery.duckdns.org",
]);

export function initRUM() {
  if (!watchingConsent) {
    watchingConsent = true;
    window.addEventListener('consent:changed', event => {
      const detail = (event as CustomEvent).detail;
      const transient = detail?.pending || detail?.error;
      if (!allowsPlayAnalytics()) {
        faro?.pause();
        if (faro && !transient) window.location.reload();
      } else if (faro) faro.unpause();
      else initRUM();
    });
  }
  if (!allowsPlayAnalytics()) return;
  const collectorUrl = (import.meta.env.PUBLIC_FARO_COLLECTOR_URL as string | undefined) || `${location.origin}/telemetry/collect`;
  if (
    faro ||
    !collectorUrl ||
    !allowedHosts.has(location.hostname)
  ) return;

  const environment = location.hostname.startsWith("qa-") ? "qa" : "production";
  try {
    faro = initializeFaro({
      url: collectorUrl,
      app: {
        name: "murder-parker-web",
        environment,
        version: import.meta.env.PUBLIC_RELEASE ?? "local",
      },
      requestCompression: false,
      sessionTracking: { enabled: true, persistent: false, samplingRate: 1 },
      instrumentations: [
        new ErrorsInstrumentation(),
        new WebVitalsInstrumentation(),
        new SessionInstrumentation(),
        new ViewInstrumentation(),
        new TracingInstrumentation({
          resourceAttributes: { "deployment.environment": environment },
          instrumentationOptions: {
            fetchInstrumentationOptions: { ignoreNetworkEvents: true },
            xhrInstrumentationOptions: { ignoreNetworkEvents: true },
          },
        }),
      ],
      beforeSend(item) {
        if (!allowsPlayAnalytics()) return null;
        // Strip user identity and all path/query data: room URLs may contain invite codes.
        const { user: _user, page: _page, ...meta } = item.meta ?? {};
        item.meta = { ...meta, page: { url: `${location.origin}/` } };
        return item;
      },
    });
    faro.api.pushEvent("page_view");
  } catch {
    // Observability must not prevent a player from entering the game.
  }
}

export function rumEvent(name: string, attributes: Record<string, string> = {}) {
  if (!allowsPlayAnalytics()) return;
  try {
    faro?.api.pushEvent(name, attributes);
  } catch {
    // Best effort only.
  }
}

export function rumAPI(route: string, status: number, duration: number) {
  rumEvent("api_request", {
    route,
    status: String(status),
    duration_ms: String(Math.round(duration)),
  });
  if (status >= 400 && status !== 401) {
    if (route === "/api/lobby/rooms/join") rumEvent("room_join_failed", { status: String(status) });
    if (route === "/api/lobby/rooms") rumEvent("room_create_failed", { status: String(status) });
  }
}
