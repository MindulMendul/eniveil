import type { MiddlewareHandler } from "hono";

const buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const requests = new Map<string, { count: number; sum: number; buckets: number[] }>();
const routes = new Set([
  "/api/health",
  "/api/guest",
  "/api/state",
  "/api/rooms",
  "/api/rooms/join",
  "/ws",
]);
const spans: object[] = [];
const environment = process.env.APP_ORIGIN?.includes("qa-") ? "qa" : "production";

function enqueueSpan(
  parent: string | undefined,
  method: string,
  route: string,
  status: number,
  start: number,
  duration: number,
) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const match = parent?.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/);
  if (match && match[3] === "00") return;
  if (spans.length >= 256) return;

  const traceId = match?.[1] ?? crypto.randomUUID().replaceAll("-", "");
  spans.push({
    traceId,
    spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    ...(match ? { parentSpanId: match[2] } : {}),
    name: `${method} ${route}`,
    kind: 2,
    startTimeUnixNano: String(BigInt(Math.round(start * 1e6))),
    endTimeUnixNano: String(BigInt(Math.round((start + duration * 1000) * 1e6))),
    attributes: [
      { key: "http.request.method", value: { stringValue: method } },
      { key: "http.route", value: { stringValue: route } },
      { key: "http.response.status_code", value: { intValue: status } },
    ],
    status: { code: status >= 500 ? 2 : 1 },
  });
}

setInterval(() => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || !spans.length) return;

  const batch = spans.splice(0, spans.length);
  void fetch(`${endpoint}/v1/traces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [
          { key: "service.name", value: { stringValue: "murder-parker-api" } },
          { key: "deployment.environment", value: { stringValue: environment } },
          { key: "service.version", value: { stringValue: process.env.APP_RELEASE ?? "local" } },
        ] },
        scopeSpans: [{ scope: { name: "festival-http" }, spans: batch }],
      }],
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}, 5000).unref();

export const observeHTTP: MiddlewareHandler = async (c, next) => {
  if (!c.req.path.startsWith("/api/") && c.req.path !== "/ws") return next();

  const started = performance.now();
  const epoch = Date.now();
  try {
    await next();
  } finally {
    const duration = (performance.now() - started) / 1000;
    const route = routes.has(c.req.path) ? c.req.path : "other";
    const method = ["GET", "POST", "OPTIONS"].includes(c.req.method) ? c.req.method : "OTHER";
    const status = c.res.status;
    const key = JSON.stringify({ route, method, status });
    const metric = requests.get(key) ?? { count: 0, sum: 0, buckets: buckets.map(() => 0) };
    metric.count++;
    metric.sum += duration;
    buckets.forEach((limit, index) => {
      if (duration <= limit) metric.buckets[index]++;
    });
    requests.set(key, metric);

    if (route !== "/api/health") {
      enqueueSpan(c.req.header("traceparent"), method, route, status, epoch, duration);
    }
  }
};

export function metrics(websocketConnections: number) {
  const lines = [
    "# HELP festival_http_requests_total HTTP requests by bounded route, method and status",
    "# TYPE festival_http_requests_total counter",
    "# HELP festival_http_request_seconds HTTP request latency",
    "# TYPE festival_http_request_seconds histogram",
    "# HELP festival_websocket_connections Active WebSocket connections",
    "# TYPE festival_websocket_connections gauge",
    `festival_websocket_connections ${websocketConnections}`,
  ];

  for (const [key, value] of requests) {
    const { route, method, status } = JSON.parse(key);
    const labels = `route="${route}",method="${method}",status="${status}"`;
    lines.push(`festival_http_requests_total{${labels}} ${value.count}`);
    buckets.forEach((limit, index) => {
      lines.push(`festival_http_request_seconds_bucket{${labels},le="${limit}"} ${value.buckets[index]}`);
    });
    lines.push(
      `festival_http_request_seconds_bucket{${labels},le="+Inf"} ${value.count}`,
      `festival_http_request_seconds_sum{${labels}} ${value.sum}`,
      `festival_http_request_seconds_count{${labels}} ${value.count}`,
    );
  }
  return lines.join("\n") + "\n";
}
