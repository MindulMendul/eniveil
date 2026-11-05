# RUM and API observability

The browser uses Grafana Faro Web SDK for errors, Web Vitals, sessions, views,
and fetch traces. The collector URL defaults to
`/telemetry/collect` on the app origin; set the public build variable
`PUBLIC_FARO_COLLECTOR_URL` to override it. The ingress or reverse proxy must
forward this route to a Faro-compatible collector. Use HTTPS and configure the
collector to accept the production and QA app origins. Telemetry errors do not
block the game.

RUM is limited to the two production/QA hostnames. It strips user and page
identity metadata and records only allowlisted API route names, status codes,
durations, and technical events. Do not add nicknames, room invite codes,
story text, or votes to telemetry attributes.

The API exposes bounded Prometheus metrics at `/metrics` and sends OTLP/HTTP
traces when `OTEL_EXPORTER_OTLP_ENDPOINT` is available. Configure the
`festival-observability` ConfigMap in each namespace with its
`otlp-endpoint` key. The endpoint must be reachable from the API Pod and
accept OTLP/HTTP traces on `/v1/traces`.

The metrics endpoint returns 404 unless the `festival-metrics` Secret contains
a `bearer-token` key and the caller sends it as a Bearer token. Keep the
scrape path private to the cluster.
