create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id) on delete set null,
  event_name text not null,
  source_kind text not null default 'server',
  source_of_truth text not null default 'event',
  event_timestamp timestamptz not null default now(),
  idempotency_key text null,
  properties jsonb not null default '{}'::jsonb
);

create unique index if not exists analytics_events_idempotency_key_idx
  on public.analytics_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists analytics_events_org_timestamp_idx
  on public.analytics_events (organization_id, event_timestamp desc);

create index if not exists analytics_events_name_timestamp_idx
  on public.analytics_events (event_name, event_timestamp desc);

create table if not exists public.organization_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  activation_score numeric not null default 0,
  retention_score numeric not null default 0,
  commercial_score numeric not null default 0,
  support_burden_score numeric not null default 0,
  trust_score numeric not null default 0,
  overall_health_score numeric not null default 0,
  status text not null default 'watch',
  details_json jsonb not null default '{}'::jsonb
);

create index if not exists organization_health_snapshots_org_calculated_idx
  on public.organization_health_snapshots (organization_id, calculated_at desc);
