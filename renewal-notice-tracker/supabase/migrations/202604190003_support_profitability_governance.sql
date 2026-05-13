create table if not exists public.support_time_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id) on delete set null,
  category text not null,
  minutes_spent integer not null check (minutes_spent >= 0),
  ticket_ref text null,
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_time_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id) on delete set null,
  category text not null,
  minutes_spent integer not null check (minutes_spent >= 0),
  engagement_ref text null,
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cost_category text not null,
  quantity numeric not null default 0,
  unit text not null,
  estimated_cost numeric not null default 0,
  reference_key text null,
  details jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table if not exists public.organization_profitability_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  monthly_recurring_revenue numeric not null default 0,
  support_minutes_30d integer not null default 0,
  onboarding_minutes_30d integer not null default 0,
  estimated_usage_cost_30d numeric not null default 0,
  estimated_service_cost_30d numeric not null default 0,
  contribution_margin_30d numeric not null default 0,
  margin_risk_status text not null default 'unknown',
  details_json jsonb not null default '{}'::jsonb
);

create index if not exists support_time_logs_organization_created_idx
  on public.support_time_logs (organization_id, created_at desc);

create index if not exists onboarding_time_logs_organization_created_idx
  on public.onboarding_time_logs (organization_id, created_at desc);

create index if not exists cost_usage_logs_organization_captured_idx
  on public.cost_usage_logs (organization_id, captured_at desc);

create index if not exists profitability_snapshots_organization_calculated_idx
  on public.organization_profitability_snapshots (organization_id, calculated_at desc);
