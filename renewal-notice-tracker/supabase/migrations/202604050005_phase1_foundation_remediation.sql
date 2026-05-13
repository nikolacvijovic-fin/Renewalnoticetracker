create table if not exists public.extracted_field_evidence (
  id uuid primary key default gen_random_uuid(),
  contract_metadata_id uuid not null references public.contract_metadata (id) on delete cascade,
  field_name text not null,
  snippet text not null,
  confidence numeric(4,3),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists extracted_field_evidence_metadata_field_idx
  on public.extracted_field_evidence (contract_metadata_id, field_name);

create table if not exists public.processing_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  contract_file_id uuid references public.contract_files (id) on delete cascade,
  stage text not null,
  error_message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists processing_errors_org_created_idx
  on public.processing_errors (organization_id, created_at desc);

create index if not exists processing_errors_contract_stage_idx
  on public.processing_errors (contract_id, stage, created_at desc);

create table if not exists public.reminder_runs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  idempotency_key text not null,
  status text not null,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists reminder_runs_idempotency_idx
  on public.reminder_runs (idempotency_key);

alter table public.reminders
  alter column max_attempts set default 4;

update public.reminders
set next_retry_at = remind_at
where next_retry_at is null
  and status in ('pending', 'retry_pending');

alter table public.contracts
  drop constraint if exists contracts_status_check;

alter table public.contracts
  alter column status set default 'uploaded';

update public.contracts
set status = case
  when status = 'active' then 'needs_review'
  else status
end
where status not in (
  'uploaded',
  'queued_for_text_extraction',
  'extracting_text',
  'text_extracted',
  'text_extraction_failed',
  'queued_for_field_extraction',
  'extracting_fields',
  'extraction_failed',
  'needs_review',
  'reviewed',
  'reminder_generation_pending',
  'reminders_scheduled',
  'archived'
);

alter table public.contracts
  add constraint contracts_status_check
  check (
    status in (
      'uploaded',
      'queued_for_text_extraction',
      'extracting_text',
      'text_extracted',
      'text_extraction_failed',
      'queued_for_field_extraction',
      'extracting_fields',
      'extraction_failed',
      'needs_review',
      'reviewed',
      'reminder_generation_pending',
      'reminders_scheduled',
      'archived'
    )
  );

alter table public.extracted_field_evidence enable row level security;
alter table public.processing_errors enable row level security;
alter table public.reminder_runs enable row level security;

create policy "members can access extracted field evidence" on public.extracted_field_evidence
for all using (
  exists (
    select 1
    from public.contract_metadata
    join public.contracts on contracts.id = contract_metadata.contract_id
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contract_metadata.id = extracted_field_evidence.contract_metadata_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.contract_metadata
    join public.contracts on contracts.id = contract_metadata.contract_id
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contract_metadata.id = extracted_field_evidence.contract_metadata_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access processing errors" on public.processing_errors
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = processing_errors.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access reminder runs" on public.reminder_runs
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = reminder_runs.organization_id
      and memberships.user_id = auth.uid()
  )
);
