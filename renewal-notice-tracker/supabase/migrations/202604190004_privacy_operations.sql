create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id) on delete set null,
  export_scope text not null default 'contracts',
  format text not null default 'workspace_package',
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  evidence_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_data_export_requests_org_requested
  on public.data_export_requests (organization_id, requested_at desc);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id) on delete set null,
  scope text not null default 'workspace',
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz null,
  completed_at timestamptz null,
  evidence_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_deletion_requests_org_requested
  on public.deletion_requests (organization_id, requested_at desc);

create table if not exists public.backup_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  status text not null,
  checked_at timestamptz not null default now(),
  restore_tested_at timestamptz null,
  summary text null,
  evidence_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_backup_readiness_checks_env_checked
  on public.backup_readiness_checks (environment, checked_at desc);
