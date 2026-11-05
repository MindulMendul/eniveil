-- Story catalog, play analytics, ratings, and privacy-conscious RUM.
-- Server writes with the Supabase service role key. Never expose that key to the browser.

create extension if not exists pgcrypto;

create table if not exists public.stories (
  id text primary key,
  kind text not null check (kind in ('original', 'demo')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_versions (
  story_id text not null references public.stories(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  subtitle text not null default '',
  player_count integer not null check (player_count > 0),
  estimated_minutes integer not null check (estimated_minutes > 0),
  locale text not null default 'ko',
  content jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (story_id, version)
);

alter table public.stories
  drop constraint if exists stories_current_version_fk;
alter table public.stories
  add constraint stories_current_version_fk
  foreign key (id, current_version)
  references public.story_versions(story_id, version)
  deferrable initially deferred;

create table if not exists public.story_plays (
  id uuid primary key default gen_random_uuid(),
  game_session_id text unique,
  story_id text not null,
  story_version integer not null,
  visitor_id uuid,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('completed', 'abandoned', 'expired')),
  elapsed_ms bigint check (elapsed_ms is null or elapsed_ms >= 0),
  active_ms bigint check (active_ms is null or active_ms >= 0),
  phase_reached text check (phase_reached is null or phase_reached in ('briefing', 'discussion', 'voting', 'reveal')),
  created_at timestamptz not null default now(),
  foreign key (story_id, story_version)
    references public.story_versions(story_id, version)
);

create index if not exists story_plays_story_started_idx
  on public.story_plays (story_id, story_version, started_at desc);
create index if not exists story_plays_end_reason_idx
  on public.story_plays (end_reason, ended_at desc);

create table if not exists public.story_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  story_id text not null references public.stories(id),
  story_version integer,
  play_id uuid references public.story_plays(id) on delete set null,
  visitor_id uuid,
  event_type text not null check (event_type in (
    'story_impression', 'story_click', 'play_started', 'phase_reached',
    'play_completed', 'play_abandoned', 'rating_submitted', 'rum_vital'
  )),
  occurred_at timestamptz not null default now(),
  impression_id uuid,
  value numeric,
  metric_name text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists story_events_story_type_time_idx
  on public.story_events (story_id, event_type, occurred_at desc);
create index if not exists story_events_play_time_idx
  on public.story_events (play_id, occurred_at);
create index if not exists story_events_impression_idx
  on public.story_events (impression_id) where impression_id is not null;

create table if not exists public.story_ratings (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.story_plays(id) on delete cascade,
  story_id text not null,
  story_version integer not null,
  visitor_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (story_id, story_version)
    references public.story_versions(story_id, version),
  unique (play_id, visitor_id)
);

create index if not exists story_ratings_story_idx
  on public.story_ratings (story_id, story_version);

create table if not exists public.story_rum_vitals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  story_id text references public.stories(id),
  play_id uuid references public.story_plays(id) on delete set null,
  visitor_id uuid,
  navigation_id text not null,
  metric_name text not null check (metric_name in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'page_load_ms')),
  metric_value numeric not null check (metric_value >= 0),
  rating text,
  route text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists story_rum_vitals_name_time_idx
  on public.story_rum_vitals (metric_name, occurred_at desc);
create index if not exists story_rum_vitals_story_time_idx
  on public.story_rum_vitals (story_id, occurred_at desc);

-- Seed the catalog currently represented by the application. Draft originals stay unavailable.
insert into public.stories (id, kind, status)
values
  ('rehearsal', 'demo', 'published'),
  ('detective-x', 'original', 'draft'),
  ('murder-festival', 'original', 'draft'),
  ('final-murder', 'original', 'draft')
on conflict (id) do nothing;

insert into public.story_versions
  (story_id, version, title, subtitle, player_count, estimated_minutes, locale, content, published_at)
values
  ('rehearsal', 1, '사라진 축제 초대장', '연결과 게임 진행을 확인하는 2인용 테스트 시나리오', 2, 5, 'ko',
   '{"roles":[{"name":"축제 안내원","secret":"너는 오후 6시에 매표소를 떠났다. 초대장은 그때 책상 위에 있었다. 돌아왔을 때 노란색 봉투가 사라져 있었다."},{"name":"무대 담당자","secret":"너는 오후 6시 5분에 초대장을 무대 서랍으로 옮겼다. 비를 피하게 하려던 것이지만 안내원에게 말하는 것을 잊었다."}],"clues":["매표소 출입 기록에는 오후 6시 5분, 무대 담당자의 이름이 적혀 있다.","무대 서랍에서 노란색 봉투가 발견됐다. 봉투에는 빗물이 묻지 않았다."],"answer":"초대장을 옮긴 사람은 무대 담당자다. 비를 피하려고 무대 서랍에 보관했다. 이 이야기는 기능 검증용이며 오리지널 3부작과 무관하다."}'::jsonb,
   now()),
  ('detective-x', 1, '탐정X의 방문살인', '축제의 첫 번째 사건 · 시나리오 집필 중', 4, 60, 'ko',
   '{"roles":[],"clues":[],"answer":null}'::jsonb, null),
  ('murder-festival', 1, '살인축제', '탐정 없는 축제의 두 번째 사건 · 시나리오 집필 중', 4, 60, 'ko',
   '{"roles":[],"clues":[],"answer":null}'::jsonb, null),
  ('final-murder', 1, '마무리 살인', '축제가 끝난 뒤의 마지막 사건 · 시나리오 집필 중', 4, 60, 'ko',
   '{"roles":[],"clues":[],"answer":null}'::jsonb, null)
on conflict (story_id, version) do nothing;

update public.stories set current_version = 1, updated_at = now()
where id in ('rehearsal', 'detective-x', 'murder-festival', 'final-murder');

-- Reporting view: raw event counts, deduplicated impression CTR, play completion,
-- elapsed play time, and post-play ratings. Use only published version snapshots
-- for public catalog responses; admin writes should remain server-side.
create or replace view public.story_metrics as
with event_counts as (
  select
    story_id,
    count(*) filter (where event_type = 'story_impression') as impressions,
    count(*) filter (where event_type = 'story_click') as clicks,
    count(distinct impression_id) filter (
      where event_type = 'story_click' and impression_id is not null
    ) as attributed_clicks
  from public.story_events
  group by story_id
),
play_counts as (
  select
    story_id,
    count(*) as plays_started,
    count(*) filter (where end_reason = 'completed') as plays_completed,
    count(*) filter (where end_reason = 'abandoned') as plays_abandoned,
    avg(elapsed_ms) filter (where end_reason = 'completed') as avg_completed_elapsed_ms,
    percentile_cont(0.5) within group (order by elapsed_ms)
      filter (where end_reason = 'completed') as median_completed_elapsed_ms,
    avg(active_ms) filter (where active_ms is not null) as avg_active_ms
  from public.story_plays
  group by story_id
),
rating_counts as (
  select story_id, count(*) as rating_count, avg(rating)::numeric(4,2) as average_rating
  from public.story_ratings
  group by story_id
)
select
  s.id as story_id,
  coalesce(e.impressions, 0) as impressions,
  coalesce(e.clicks, 0) as clicks,
  coalesce(e.attributed_clicks, 0) as attributed_clicks,
  case when coalesce(e.impressions, 0) = 0 then null
       else round(e.attributed_clicks::numeric / e.impressions, 4) end as ctr,
  coalesce(p.plays_started, 0) as plays_started,
  coalesce(p.plays_completed, 0) as plays_completed,
  coalesce(p.plays_abandoned, 0) as plays_abandoned,
  case when coalesce(p.plays_started, 0) = 0 then null
       else round(p.plays_completed::numeric / p.plays_started, 4) end as completion_rate,
  p.avg_completed_elapsed_ms,
  p.median_completed_elapsed_ms,
  p.avg_active_ms,
  coalesce(r.rating_count, 0) as rating_count,
  r.average_rating
from public.stories s
left join event_counts e on e.story_id = s.id
left join play_counts p on p.story_id = s.id
left join rating_counts r on r.story_id = s.id;

-- All application access is through the trusted backend using service_role.
-- The browser must never receive the service role key.
alter table public.stories enable row level security;
alter table public.story_versions enable row level security;
alter table public.story_plays enable row level security;
alter table public.story_events enable row level security;
alter table public.story_ratings enable row level security;
alter table public.story_rum_vitals enable row level security;

revoke all on public.stories, public.story_versions, public.story_plays,
  public.story_events, public.story_ratings, public.story_rum_vitals
  from anon, authenticated;
