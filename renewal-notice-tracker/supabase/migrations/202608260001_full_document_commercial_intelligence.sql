-- Full-document commercial intelligence is additive. Existing reviewed metadata
-- remains authoritative until a reviewer explicitly accepts newer evidence.

alter table public.contract_extraction_runs
  drop constraint if exists contract_extraction_runs_status_check;

alter table public.contract_extraction_runs
  add constraint contract_extraction_runs_status_check
  check (status in ('queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'));

alter table public.contract_extraction_runs
  add column if not exists idempotency_key text,
  add column if not exists schema_version text not null default 'commercial_contract_v2',
  add column if not exists prompt_version text null,
  add column if not exists model text null,
  add column if not exists page_count integer not null default 0,
  add column if not exists processed_page_count integer not null default 0,
  add column if not exists input_character_count integer not null default 0,
  add column if not exists input_token_count integer null,
  add column if not exists output_token_count integer null,
  add column if not exists estimated_cost numeric null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz null,
  add column if not exists processing_lease_expires_at timestamptz null,
  add column if not exists warning_codes text[] not null default '{}';

create unique index if not exists idx_contract_extraction_runs_idempotency
  on public.contract_extraction_runs (organization_id, idempotency_key)
  where idempotency_key is not null and status in ('queued', 'processing', 'completed', 'partial');

create table if not exists public.contract_document_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  contract_file_id uuid not null references public.contract_files(id) on delete cascade,
  extraction_run_id uuid not null references public.contract_extraction_runs(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  section_heading text null,
  normalized_text text not null,
  text_hash text not null,
  character_start integer not null default 0,
  character_end integer not null default 0,
  extraction_method text not null check (extraction_method in ('native_pdf', 'docx', 'ocr')),
  ocr_confidence numeric null check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  warning_codes text[] not null default '{}',
  retention_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (extraction_run_id, contract_file_id, page_number)
);

alter table public.contract_extracted_fields
  drop constraint if exists contract_extracted_fields_key_check;

alter table public.contract_extracted_fields
  drop constraint if exists contract_extracted_fields_run_field_unique;

alter table public.contract_extracted_fields
  add column if not exists field_category text not null default 'term_and_renewal',
  add column if not exists candidate_index integer not null default 0,
  add column if not exists source_document_page_id uuid null references public.contract_document_pages(id) on delete set null,
  add column if not exists source_section_label text null,
  add column if not exists source_clause_label text null,
  add column if not exists extraction_method text null,
  add column if not exists extraction_provider text null,
  add column if not exists extraction_model text null,
  add column if not exists prompt_version text null,
  add column if not exists schema_version text not null default 'commercial_contract_v2',
  add column if not exists edited_value jsonb null,
  add column if not exists override_reason text null,
  add column if not exists supersedes_field_id uuid null references public.contract_extracted_fields(id) on delete set null;

alter table public.contract_extracted_fields
  add constraint contract_extracted_fields_category_check
  check (field_category in (
    'contract_identity', 'term_and_renewal', 'financial_terms',
    'price_change_mechanics', 'commercial_protections'
  ));

alter table public.contract_extracted_fields
  add constraint contract_extracted_fields_run_candidate_unique
  unique (extraction_run_id, field_key, candidate_index);

create table if not exists public.contract_document_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_file_id uuid not null references public.contract_files(id) on delete cascade,
  target_file_id uuid not null references public.contract_files(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('amends', 'supersedes', 'order_under', 'quote_for', 'related')),
  effective_date date null,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence_status text not null default 'pending_review' check (evidence_status in ('pending_review', 'accepted', 'rejected')),
  evidence_field_ids uuid[] not null default '{}',
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  check (source_file_id <> target_file_id),
  unique (organization_id, source_file_id, target_file_id, relationship_type)
);

create table if not exists public.contract_commercial_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  calculation_type text not null,
  calculation_version text not null,
  status text not null check (status in ('confirmed', 'estimate', 'insufficient_evidence', 'conflict')),
  amount numeric null,
  currency text null,
  percentage numeric null,
  date_value date null,
  explanation text not null,
  source_field_ids uuid[] not null default '{}',
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  superseded_at timestamptz null
);

create table if not exists public.contract_commercial_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  extraction_run_id uuid null references public.contract_extraction_runs(id) on delete set null,
  reason_code text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  explanation text not null,
  financial_impact_min numeric null,
  financial_impact_max numeric null,
  currency text null,
  evidence_field_ids uuid[] not null default '{}',
  limitations text[] not null default '{}',
  recommended_human_action text not null,
  calculation_version text not null,
  taxonomy_version text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_document_pages_org_contract
  on public.contract_document_pages (organization_id, contract_id, page_number);
create index if not exists idx_contract_extracted_fields_contract_category
  on public.contract_extracted_fields (organization_id, contract_id, field_category, evidence_status);
create index if not exists idx_contract_document_relationships_contract
  on public.contract_document_relationships (organization_id, contract_id, evidence_status);
create index if not exists idx_contract_commercial_calculations_contract
  on public.contract_commercial_calculations (organization_id, contract_id, superseded_at);
create index if not exists idx_contract_commercial_findings_contract
  on public.contract_commercial_findings (organization_id, contract_id, status, severity);

create or replace function public.enforce_contract_intelligence_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.contracts c
    where c.id = new.contract_id and c.organization_id = new.organization_id
  ) then
    raise exception 'contract intelligence organization scope mismatch' using errcode = '42501';
  end if;

  if tg_table_name = 'contract_extraction_runs' and new.contract_file_id is not null and not exists (
    select 1 from public.contract_files f
    where f.id = new.contract_file_id and f.contract_id = new.contract_id
  ) then
    raise exception 'contract extraction file scope mismatch' using errcode = '42501';
  end if;

  if tg_table_name = 'contract_document_pages' then
    if not exists (
      select 1 from public.contract_files f
      where f.id = new.contract_file_id and f.contract_id = new.contract_id
    ) or not exists (
      select 1 from public.contract_extraction_runs r
      where r.id = new.extraction_run_id
        and r.organization_id = new.organization_id
        and r.contract_id = new.contract_id
    ) then
      raise exception 'contract document page scope mismatch' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'contract_extracted_fields' then
    if not exists (
      select 1 from public.contract_extraction_runs r
      where r.id = new.extraction_run_id
        and r.organization_id = new.organization_id
        and r.contract_id = new.contract_id
    ) or (new.source_file_id is not null and not exists (
      select 1 from public.contract_files f
      where f.id = new.source_file_id and f.contract_id = new.contract_id
    )) then
      raise exception 'contract extracted field scope mismatch' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'contract_document_relationships' and (
    not exists (select 1 from public.contract_files f where f.id = new.source_file_id and f.contract_id = new.contract_id)
    or not exists (select 1 from public.contract_files f where f.id = new.target_file_id and f.contract_id = new.contract_id)
  ) then
    raise exception 'contract document relationship scope mismatch' using errcode = '42501';
  end if;

  if tg_table_name = 'contract_commercial_findings' and new.extraction_run_id is not null and not exists (
    select 1 from public.contract_extraction_runs r
    where r.id = new.extraction_run_id
      and r.organization_id = new.organization_id
      and r.contract_id = new.contract_id
  ) then
    raise exception 'commercial finding extraction scope mismatch' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_contract_intelligence_scope() from public;
revoke all on function public.enforce_contract_intelligence_scope() from anon;

drop trigger if exists trg_contract_extraction_runs_scope on public.contract_extraction_runs;
create trigger trg_contract_extraction_runs_scope
  before insert or update on public.contract_extraction_runs
  for each row execute function public.enforce_contract_intelligence_scope();

drop trigger if exists trg_contract_document_pages_scope on public.contract_document_pages;
create trigger trg_contract_document_pages_scope
  before insert or update on public.contract_document_pages
  for each row execute function public.enforce_contract_intelligence_scope();

drop trigger if exists trg_contract_extracted_fields_scope on public.contract_extracted_fields;
create trigger trg_contract_extracted_fields_scope
  before insert or update on public.contract_extracted_fields
  for each row execute function public.enforce_contract_intelligence_scope();

drop trigger if exists trg_contract_document_relationships_scope on public.contract_document_relationships;
create trigger trg_contract_document_relationships_scope
  before insert or update on public.contract_document_relationships
  for each row execute function public.enforce_contract_intelligence_scope();

drop trigger if exists trg_contract_commercial_calculations_scope on public.contract_commercial_calculations;
create trigger trg_contract_commercial_calculations_scope
  before insert or update on public.contract_commercial_calculations
  for each row execute function public.enforce_contract_intelligence_scope();

drop trigger if exists trg_contract_commercial_findings_scope on public.contract_commercial_findings;
create trigger trg_contract_commercial_findings_scope
  before insert or update on public.contract_commercial_findings
  for each row execute function public.enforce_contract_intelligence_scope();

alter table public.contract_document_pages enable row level security;
alter table public.contract_document_relationships enable row level security;
alter table public.contract_commercial_calculations enable row level security;
alter table public.contract_commercial_findings enable row level security;

create policy "Org members can read contract document pages"
  on public.contract_document_pages for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_document_pages.organization_id and m.user_id = auth.uid()
  ));

create policy "Org members can read document relationships"
  on public.contract_document_relationships for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_document_relationships.organization_id and m.user_id = auth.uid()
  ));

create policy "Review roles can manage document relationships"
  on public.contract_document_relationships for all
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_document_relationships.organization_id
      and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_document_relationships.organization_id
      and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')
  ));

create policy "Org members can read commercial calculations"
  on public.contract_commercial_calculations for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_commercial_calculations.organization_id and m.user_id = auth.uid()
  ));

create policy "Org members can read commercial findings"
  on public.contract_commercial_findings for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = contract_commercial_findings.organization_id and m.user_id = auth.uid()
  ));

-- Document text and generated intelligence are written only through scoped
-- trusted-server repositories. No direct customer mutation policy is granted.

create or replace function public.purge_expired_contract_document_pages()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted bigint;
begin
  delete from public.contract_document_pages
  where retention_expires_at <= timezone('utc', now());
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_contract_document_pages() from public;
revoke all on function public.purge_expired_contract_document_pages() from anon;
revoke all on function public.purge_expired_contract_document_pages() from authenticated;
grant execute on function public.purge_expired_contract_document_pages() to service_role;
