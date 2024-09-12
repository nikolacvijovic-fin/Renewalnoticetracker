-- Enterprise background job reliability foundation.
-- Jobs are readable by organization members, but mutation authority stays with
-- trusted server/service-role paths and signed internal worker routes.

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  priority integer not null default 100,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  scheduled_for timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  last_error_code text null,
  last_error_message text null,
  completed_at timestamptz null,
  dead_lettered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint background_jobs_status_check check (
    status in ('queued', 'processing', 'retry_scheduled', 'completed', 'failed', 'dead_lettered', 'cancelled')
  ),
  constraint background_jobs_job_type_check check (
    job_type in ('trusted_reminder_delivery', 'contract_import_processing', 'audit_event_flush', 'webhook_dispatch', 'add_on_task')
  ),
  constraint background_jobs_attempts_check check (attempts >= 0),
  constraint background_jobs_max_attempts_check check (max_attempts >= 1),
  constraint background_jobs_org_idempotency_unique unique (organization_id, idempotency_key)
);

create table if not exists public.background_job_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.background_jobs(id) on delete cascade,
  attempt_number integer not null,
  status text not null,
  worker_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  error_code text null,
  safe_error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint background_job_attempts_status_check check (
    status in ('claimed', 'completed', 'retry_scheduled', 'failed', 'dead_lettered', 'cancelled')
  ),
  constraint background_job_attempts_attempt_number_check check (attempt_number >= 1)
);

create index if not exists idx_background_jobs_org_status_scheduled
  on public.background_jobs(organization_id, status, scheduled_for);

create index if not exists idx_background_jobs_type_status_scheduled
  on public.background_jobs(job_type, status, scheduled_for);

create index if not exists idx_background_jobs_processing_locked_at
  on public.background_jobs(locked_at)
  where status = 'processing';

create index if not exists idx_background_jobs_dead_lettered_at
  on public.background_jobs(dead_lettered_at)
  where status = 'dead_lettered';

create index if not exists idx_background_job_attempts_org_job_started
  on public.background_job_attempts(organization_id, job_id, started_at desc);

alter table public.background_jobs enable row level security;
alter table public.background_job_attempts enable row level security;

drop policy if exists "members can read background jobs" on public.background_jobs;
create policy "members can read background jobs"
on public.background_jobs
for select
using (
  exists (
    select 1
    from public.memberships
    where memberships.organization_id = background_jobs.organization_id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "members can read background job attempts" on public.background_job_attempts;
create policy "members can read background job attempts"
on public.background_job_attempts
for select
using (
  exists (
    select 1
    from public.memberships
    where memberships.organization_id = background_job_attempts.organization_id
      and memberships.user_id = auth.uid()
  )
);

-- No insert/update/delete policies are created. Mutation is intentionally
-- service-role/trusted-server only through org-scoped queue helpers.

comment on table public.background_jobs is
  'Org-scoped background job ledger. Members may read scoped jobs; trusted server/service-role paths enqueue, claim, complete, fail, and cancel jobs.';

comment on table public.background_job_attempts is
  'Safe attempt evidence for background job processing. Metadata must never contain raw contract text, OCR output, provider payloads, notes, secrets, or storage paths.';
