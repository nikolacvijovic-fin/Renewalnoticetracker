create table if not exists public.contract_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  contract_file_id uuid null references public.contract_files(id) on delete set null,
  provider text not null default 'python_intelligence',
  status text not null default 'queued',
  extraction_mode text not null default 'deterministic_scaffold',
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  safe_error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_extraction_runs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  constraint contract_extraction_runs_mode_check
    check (extraction_mode in ('deterministic_scaffold', 'provider_backed'))
);

create table if not exists public.contract_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  extraction_run_id uuid not null references public.contract_extraction_runs(id) on delete cascade,
  field_key text not null,
  extracted_value jsonb not null,
  normalized_value jsonb null,
  confidence numeric not null,
  evidence_status text not null default 'pending_review',
  source_file_id uuid null references public.contract_files(id) on delete set null,
  source_page integer null,
  source_snippet text null,
  source_offsets jsonb null,
  warning_codes text[] not null default '{}',
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  applied_to_contract_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text null,
  created_at timestamptz not null default now(),
  constraint contract_extracted_fields_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint contract_extracted_fields_evidence_status_check
    check (evidence_status in ('pending_review', 'accepted', 'rejected', 'superseded')),
  constraint contract_extracted_fields_key_check
    check (field_key in (
      'vendor_name',
      'renewal_date',
      'notice_deadline_date',
      'auto_renewal',
      'contract_value_amount',
      'contract_value_currency',
      'renewal_term',
      'termination_window',
      'price_change_trigger',
      'payment_terms'
    )),
  constraint contract_extracted_fields_source_snippet_length_check
    check (source_snippet is null or char_length(source_snippet) <= 1000),
  constraint contract_extracted_fields_run_field_unique
    unique (extraction_run_id, field_key)
);

create index if not exists idx_contract_extraction_runs_org_contract
  on public.contract_extraction_runs (organization_id, contract_id);

create index if not exists idx_contract_extraction_runs_org_status
  on public.contract_extraction_runs (organization_id, status);

create index if not exists idx_contract_extracted_fields_org_contract
  on public.contract_extracted_fields (organization_id, contract_id);

create index if not exists idx_contract_extracted_fields_org_status
  on public.contract_extracted_fields (organization_id, evidence_status);

create index if not exists idx_contract_extracted_fields_contract_key
  on public.contract_extracted_fields (contract_id, field_key);

create index if not exists idx_contract_extracted_fields_run
  on public.contract_extracted_fields (extraction_run_id);

alter table public.contract_extraction_runs enable row level security;
alter table public.contract_extracted_fields enable row level security;

drop policy if exists "Org members can read contract extraction runs" on public.contract_extraction_runs;
create policy "Org members can read contract extraction runs"
  on public.contract_extraction_runs
  for select
  using (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = contract_extraction_runs.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Review roles can request contract extraction runs" on public.contract_extraction_runs;
create policy "Review roles can request contract extraction runs"
  on public.contract_extraction_runs
  for insert
  with check (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = contract_extraction_runs.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read contract extracted fields" on public.contract_extracted_fields;
create policy "Org members can read contract extracted fields"
  on public.contract_extracted_fields
  for select
  using (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = contract_extracted_fields.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Mutation beyond run request is trusted-server / reviewer workflow only.
-- The application uses scoped repository helpers and review actions to update
-- extracted field review state or apply accepted evidence to contract metadata.
