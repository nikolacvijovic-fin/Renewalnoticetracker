create table if not exists public.readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  calculated_at timestamptz not null default now(),
  overall_score numeric not null,
  confidence_score numeric not null,
  authz_tenant_score numeric not null,
  testing_release_score numeric not null,
  reliability_score numeric not null,
  billing_score numeric not null,
  admin_internal_score numeric not null,
  privacy_compliance_score numeric not null,
  observability_incident_score numeric not null,
  analytics_quality_score numeric not null,
  blockers_count integer not null default 0,
  critical_blockers_count integer not null default 0,
  snapshot_version text not null,
  details_json jsonb not null default '{}'::jsonb
);

create index if not exists readiness_snapshots_org_calculated_idx
  on public.readiness_snapshots (organization_id, calculated_at desc);

create table if not exists public.capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  calculated_at timestamptz not null default now(),
  overall_capacity_percent numeric not null,
  confidence_score numeric not null,
  cron_pressure_score numeric not null,
  retry_backlog_score numeric not null,
  reminder_failure_pressure_score numeric not null,
  webhook_pressure_score numeric not null,
  import_queue_pressure_score numeric not null,
  db_pressure_score numeric not null,
  error_budget_pressure_score numeric not null,
  support_overload_score numeric not null,
  snapshot_version text not null,
  details_json jsonb not null default '{}'::jsonb
);

create index if not exists capacity_snapshots_org_calculated_idx
  on public.capacity_snapshots (organization_id, calculated_at desc);

create table if not exists public.metric_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  metric_key text not null,
  severity text not null,
  status text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  evidence_json jsonb not null default '{}'::jsonb
);

create index if not exists metric_alerts_org_status_idx
  on public.metric_alerts (organization_id, status, opened_at desc);

create unique index if not exists metric_alerts_open_unique_idx
  on public.metric_alerts (organization_id, metric_key)
  where status = 'open';
