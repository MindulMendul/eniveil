# Story catalog and analytics

The Supabase schema is introduced by `supabase/migrations/20261105000000_story_analytics.sql`.

## Data boundaries

- `stories` stores the catalog identity and publishing state.
- `story_versions` stores immutable version snapshots: public metadata and private story content. A game play always references the version it started with.
- `story_plays` stores one server-owned record per game session, including elapsed duration, active duration, completion/abandonment and furthest phase.
- `story_events` is the append-only event ledger for impressions, clicks, starts, phase progression and outcomes. `event_id` makes retries idempotent.
- `story_ratings` stores one 1–5 rating per participant per play. The backend must accept ratings only from an authenticated participant after the reveal.
- `story_rum_vitals` stores allowlisted Web Vitals and page-load timing. It deliberately has no IP address, full user-agent, free-form text, or arbitrary URL query string.

The `story_metrics` view reports impression and click counts, impression-attributed CTR, play starts, completion/abandonment, elapsed and active play duration, and average rating. CTR is attributed clicks divided by impressions; clients should send the server-issued impression ID with the click. Do not interpret a raw play start as a catalog click.

## Measurement contract

Use one random navigation ID per page load and one event ID per event. A catalog impression is recorded when a story card is actually visible; a click uses that impression ID. The backend creates the play record when the server accepts the game start command, and closes it when the host returns from the reveal. Phase transitions update the furthest phase. A heartbeat may update `last_active_at`; derive active duration from bounded foreground heartbeats rather than counting the full elapsed wall time. Expire stale active plays as abandoned in a scheduled job.

Collect LCP, INP, CLS, FCP and TTFB using the Web Vitals library when it is added to the frontend. Until then, `page_load_ms` can be sent from Navigation Timing. Report p50/p75/p95 by metric, route, device class and release; do not store high-cardinality or identifying fields in metadata.

## Environment

When the API is wired to this schema, it should use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep these in the server's secret store and GitHub environment secrets; never put the service role key in `apps/web`, a public `VITE_` variable, or the repository. Apply the migration with the Supabase CLI or SQL editor. This migration defines the data model; API ingestion and app instrumentation are a separate implementation step. Existing gameplay state remains in SQLite.
