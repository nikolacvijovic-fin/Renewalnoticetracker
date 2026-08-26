-- Contract-to-quote commercial comparison: immutable reviewed baselines,
-- proposal evidence versions, deterministic cost bridges, and scenario approvals.

create table if not exists public.contract_commercial_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version integer not null check (version > 0),
  source_extraction_run_id uuid not null references public.contract_extraction_runs(id) on delete restrict,
  source_extraction_run_ids uuid[] not null,
  source_file_ids uuid[] not null default '{}',
  effective_date date null,
  reviewed_by_user_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  calculation_version text not null,
  completeness_status text not null check (completeness_status in ('complete', 'partial', 'insufficient')),
  missing_data_warnings text[] not null default '{}',
  evidence_field_ids uuid[] not null,
  evidence_fingerprint text not null,
  terms_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, contract_id, version),
  unique (organization_id, contract_id, evidence_fingerprint)
);

create table if not exists public.contract_commercial_baseline_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  baseline_id uuid not null references public.contract_commercial_baselines(id) on delete restrict,
  line_key text not null,
  product_name text not null,
  sku text null,
  charge_type text not null check (charge_type in ('recurring', 'one_time')),
  pricing_model text not null check (pricing_model in ('per_user', 'per_seat', 'per_unit', 'flat', 'tiered')),
  billing_period text not null check (billing_period in ('monthly', 'quarterly', 'annual', 'multi_year', 'partial')),
  quantity numeric null check (quantity is null or quantity >= 0),
  unit_price numeric null check (unit_price is null or unit_price >= 0),
  total_amount numeric null check (total_amount is null or total_amount >= 0),
  annualized_amount numeric not null,
  total_commitment_amount numeric not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  term_months integer null check (term_months is null or term_months > 0),
  service_period_months numeric null check (service_period_months is null or service_period_months > 0),
  discount_amount numeric null check (discount_amount is null or discount_amount >= 0),
  discount_percent numeric null check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  evidence_field_ids uuid[] not null,
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (baseline_id, line_key)
);

create table if not exists public.renewal_quote_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  comparison_id uuid not null references public.renewal_quote_comparisons(id) on delete cascade,
  quote_file_id uuid null references public.contract_files(id) on delete restrict,
  extraction_run_id uuid null references public.contract_extraction_runs(id) on delete restrict,
  version integer not null check (version > 0),
  document_type text not null check (document_type in ('renewal_quote', 'amendment', 'replacement_order_form', 'pricing_proposal', 'unknown_commercial_document')),
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'accepted', 'rejected', 'superseded')),
  terms_snapshot jsonb not null,
  evidence_field_ids uuid[] not null default '{}',
  evidence_fingerprint text not null,
  missing_data_warnings text[] not null default '{}',
  reviewed_by_user_id uuid null references auth.users(id) on delete restrict,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (organization_id, contract_id, version),
  unique (comparison_id, evidence_fingerprint)
);

create table if not exists public.renewal_quote_proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  proposal_version_id uuid not null references public.renewal_quote_proposal_versions(id) on delete cascade,
  line_key text not null,
  product_name text not null,
  sku text null,
  charge_type text not null check (charge_type in ('recurring', 'one_time')),
  pricing_model text not null check (pricing_model in ('per_user', 'per_seat', 'per_unit', 'flat', 'tiered')),
  billing_period text not null check (billing_period in ('monthly', 'quarterly', 'annual', 'multi_year', 'partial')),
  quantity numeric null check (quantity is null or quantity >= 0),
  unit_price numeric null check (unit_price is null or unit_price >= 0),
  total_amount numeric null check (total_amount is null or total_amount >= 0),
  annualized_amount numeric not null,
  total_commitment_amount numeric not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  term_months integer null check (term_months is null or term_months > 0),
  service_period_months numeric null check (service_period_months is null or service_period_months > 0),
  discount_amount numeric null check (discount_amount is null or discount_amount >= 0),
  discount_percent numeric null check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  evidence_field_ids uuid[] not null default '{}',
  citations jsonb not null default '[]',
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (proposal_version_id, line_key)
);

create table if not exists public.renewal_quote_cost_bridges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  comparison_id uuid not null references public.renewal_quote_comparisons(id) on delete cascade,
  baseline_id uuid not null references public.contract_commercial_baselines(id) on delete restrict,
  proposal_version_id uuid not null references public.renewal_quote_proposal_versions(id) on delete restrict,
  status text not null check (status in ('reconciled', 'unreconciled', 'insufficient_evidence')),
  currency text null check (currency is null or currency ~ '^[A-Z]{3}$'),
  current_annual_cost numeric null,
  proposed_annual_cost numeric null,
  attributed_delta numeric null,
  residual_amount numeric null,
  components jsonb not null default '[]',
  explanation text not null,
  limitation_codes text[] not null default '{}',
  calculation_version text not null,
  evidence_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (comparison_id, baseline_id, proposal_version_id, calculation_version)
);

create table if not exists public.renewal_quote_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  comparison_id uuid not null references public.renewal_quote_comparisons(id) on delete cascade,
  scenario_type text not null check (scenario_type in ('accept_proposal', 'renew_unchanged', 'renegotiate_price', 'reduce_quantity', 'consolidate', 'terminate', 'replace', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'reapproval_required', 'superseded')),
  annual_cost numeric null,
  first_year_effect numeric null,
  multi_year_commitment numeric null,
  transition_cost numeric not null default 0,
  estimated_savings_low numeric null,
  estimated_savings_high numeric null,
  major_risks text[] not null default '{}',
  evidence_fingerprint text not null,
  calculation_version text not null,
  approved_by_user_id uuid null references auth.users(id) on delete restrict,
  approved_at timestamptz null,
  invalidated_at timestamptz null,
  invalidation_reason_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comparison_id, scenario_type, evidence_fingerprint)
);

alter table public.renewal_quote_comparisons
  add column if not exists baseline_id uuid null references public.contract_commercial_baselines(id) on delete restrict,
  add column if not exists proposal_version_id uuid null references public.renewal_quote_proposal_versions(id) on delete restrict,
  add column if not exists calculation_version text null,
  add column if not exists taxonomy_version text null,
  add column if not exists cost_bridge_status text null check (cost_bridge_status is null or cost_bridge_status in ('reconciled', 'unreconciled', 'insufficient_evidence')),
  add column if not exists evidence_fingerprint text null;

alter table public.renewal_quote_comparison_findings
  drop constraint if exists renewal_quote_comparison_findings_finding_type_check;

alter table public.renewal_quote_comparison_findings
  add column if not exists reason_code text null,
  add column if not exists absolute_delta numeric null,
  add column if not exists percentage_delta numeric null,
  add column if not exists annualized_impact numeric null,
  add column if not exists total_commitment_impact numeric null,
  add column if not exists current_evidence_field_ids uuid[] not null default '{}',
  add column if not exists proposed_evidence_field_ids uuid[] not null default '{}',
  add column if not exists limitation_codes text[] not null default '{}',
  add column if not exists calculation_version text null,
  add column if not exists taxonomy_version text null;

alter table public.savings_opportunities
  add column if not exists estimated_savings_low numeric null,
  add column if not exists estimated_savings_high numeric null,
  add column if not exists evidence_completeness text null check (evidence_completeness is null or evidence_completeness in ('complete', 'partial', 'insufficient')),
  add column if not exists rationale text null,
  add column if not exists assumptions text[] not null default '{}',
  add column if not exists missing_evidence text[] not null default '{}',
  add column if not exists action_deadline date null,
  add column if not exists estimate_status text not null default 'estimated' check (estimate_status in ('estimated', 'approved', 'realized'));

create or replace function public.enforce_commercial_comparison_organization_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.contracts c
    where c.id = new.contract_id and c.organization_id = new.organization_id
  ) then
    raise exception 'commercial comparison contract organization mismatch';
  end if;
  if tg_table_name = 'contract_commercial_baselines' and not exists (
    select 1 from public.contract_extraction_runs run
    where run.id = new.source_extraction_run_id
      and run.organization_id = new.organization_id
      and run.contract_id = new.contract_id
  ) then
    raise exception 'commercial baseline extraction organization mismatch';
  end if;
  if tg_table_name = 'contract_commercial_baseline_line_items' and not exists (
    select 1 from public.contract_commercial_baselines baseline
    where baseline.id = new.baseline_id
      and baseline.organization_id = new.organization_id
      and baseline.contract_id = new.contract_id
  ) then
    raise exception 'commercial baseline line organization mismatch';
  end if;
  if tg_table_name = 'renewal_quote_proposal_versions' and (
    not exists (
      select 1 from public.renewal_quote_comparisons comparison
      where comparison.id = new.comparison_id
        and comparison.organization_id = new.organization_id
        and comparison.contract_id = new.contract_id
    ) or (
      new.quote_file_id is not null and not exists (
        select 1 from public.contract_files file
        where file.id = new.quote_file_id and file.contract_id = new.contract_id
      )
    )
  ) then
    raise exception 'proposal evidence organization mismatch';
  end if;
  if tg_table_name = 'renewal_quote_proposal_line_items' and not exists (
    select 1 from public.renewal_quote_proposal_versions proposal
    where proposal.id = new.proposal_version_id
      and proposal.organization_id = new.organization_id
      and proposal.contract_id = new.contract_id
  ) then
    raise exception 'proposal line organization mismatch';
  end if;
  if tg_table_name = 'renewal_quote_cost_bridges' and (
    not exists (select 1 from public.renewal_quote_comparisons comparison where comparison.id = new.comparison_id and comparison.organization_id = new.organization_id and comparison.contract_id = new.contract_id)
    or not exists (select 1 from public.contract_commercial_baselines baseline where baseline.id = new.baseline_id and baseline.organization_id = new.organization_id and baseline.contract_id = new.contract_id)
    or not exists (select 1 from public.renewal_quote_proposal_versions proposal where proposal.id = new.proposal_version_id and proposal.organization_id = new.organization_id and proposal.contract_id = new.contract_id)
  ) then
    raise exception 'cost bridge organization mismatch';
  end if;
  if tg_table_name = 'renewal_quote_scenarios' and not exists (
    select 1 from public.renewal_quote_comparisons comparison
    where comparison.id = new.comparison_id
      and comparison.organization_id = new.organization_id
      and comparison.contract_id = new.contract_id
  ) then
    raise exception 'quote scenario organization mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.reject_commercial_baseline_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'commercial baselines are immutable; create a new version';
end;
$$;

create or replace function public.create_reviewed_commercial_baseline(
  p_organization_id uuid,
  p_contract_id uuid,
  p_source_extraction_run_id uuid,
  p_source_extraction_run_ids uuid[],
  p_source_file_ids uuid[],
  p_effective_date date,
  p_reviewed_by_user_id uuid,
  p_calculation_version text,
  p_completeness_status text,
  p_missing_data_warnings text[],
  p_evidence_field_ids uuid[],
  p_evidence_fingerprint text,
  p_terms_snapshot jsonb,
  p_line_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_baseline_id uuid;
  v_version integer;
begin
  if p_reviewed_by_user_id <> auth.uid() then
    raise exception 'baseline reviewer must match authenticated actor';
  end if;
  if coalesce(array_length(p_evidence_field_ids, 1), 0) = 0 then
    raise exception 'accepted evidence is required';
  end if;
  if not (p_source_extraction_run_id = any(p_source_extraction_run_ids)) or exists (
    select 1 from unnest(p_source_extraction_run_ids) run_id
    where not exists (
      select 1 from public.contract_extraction_runs run
      where run.id = run_id
        and run.organization_id = p_organization_id
        and run.contract_id = p_contract_id
    )
  ) then
    raise exception 'baseline extraction runs must be organization scoped';
  end if;
  if exists (
    select 1 from unnest(p_evidence_field_ids) evidence_id
    where not exists (
      select 1 from public.contract_extracted_fields field
      where field.id = evidence_id
        and field.organization_id = p_organization_id
        and field.contract_id = p_contract_id
        and field.extraction_run_id = any(p_source_extraction_run_ids)
        and field.evidence_status = 'accepted'
        and field.rejected_at is null
    )
  ) then
    raise exception 'baseline evidence must be accepted and organization scoped';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text, 0));
  select coalesce(max(version), 0) + 1 into v_version
  from public.contract_commercial_baselines
  where organization_id = p_organization_id and contract_id = p_contract_id;

  insert into public.contract_commercial_baselines (
    organization_id, contract_id, version, source_extraction_run_id, source_extraction_run_ids, source_file_ids,
    effective_date, reviewed_by_user_id, calculation_version, completeness_status,
    missing_data_warnings, evidence_field_ids, evidence_fingerprint, terms_snapshot
  ) values (
    p_organization_id, p_contract_id, v_version, p_source_extraction_run_id, p_source_extraction_run_ids, coalesce(p_source_file_ids, '{}'),
    p_effective_date, p_reviewed_by_user_id, p_calculation_version, p_completeness_status,
    coalesce(p_missing_data_warnings, '{}'), p_evidence_field_ids, p_evidence_fingerprint, p_terms_snapshot
  ) returning id into v_baseline_id;

  insert into public.contract_commercial_baseline_line_items (
    organization_id, contract_id, baseline_id, line_key, product_name, sku, charge_type,
    pricing_model, billing_period, quantity, unit_price, total_amount, annualized_amount,
    total_commitment_amount, currency, term_months, service_period_months, discount_amount,
    discount_percent, evidence_field_ids, warning_codes
  )
  select
    p_organization_id, p_contract_id, v_baseline_id, item.line_key, item.product_name, item.sku,
    item.charge_type, item.pricing_model, item.billing_period, item.quantity, item.unit_price,
    item.total_amount, item.annualized_amount, item.total_commitment_amount, item.currency,
    item.term_months, item.service_period_months, item.discount_amount, item.discount_percent,
    item.evidence_field_ids, coalesce(item.warning_codes, '{}')
  from jsonb_to_recordset(p_line_items) as item(
    line_key text, product_name text, sku text, charge_type text, pricing_model text,
    billing_period text, quantity numeric, unit_price numeric, total_amount numeric,
    annualized_amount numeric, total_commitment_amount numeric, currency text,
    term_months integer, service_period_months numeric, discount_amount numeric,
    discount_percent numeric, evidence_field_ids uuid[], warning_codes text[]
  );

  return v_baseline_id;
end;
$$;

revoke all on function public.create_reviewed_commercial_baseline(uuid, uuid, uuid, uuid[], uuid[], date, uuid, text, text, text[], uuid[], text, jsonb, jsonb) from public, anon;
grant execute on function public.create_reviewed_commercial_baseline(uuid, uuid, uuid, uuid[], uuid[], date, uuid, text, text, text[], uuid[], text, jsonb, jsonb) to authenticated;

drop trigger if exists contract_commercial_baselines_org_scope on public.contract_commercial_baselines;
create trigger contract_commercial_baselines_org_scope before insert on public.contract_commercial_baselines
for each row execute function public.enforce_commercial_comparison_organization_scope();
drop trigger if exists contract_commercial_baselines_immutable on public.contract_commercial_baselines;
create trigger contract_commercial_baselines_immutable before update or delete on public.contract_commercial_baselines
for each row execute function public.reject_commercial_baseline_mutation();

drop trigger if exists commercial_baseline_lines_org_scope on public.contract_commercial_baseline_line_items;
create trigger commercial_baseline_lines_org_scope before insert on public.contract_commercial_baseline_line_items
for each row execute function public.enforce_commercial_comparison_organization_scope();
drop trigger if exists commercial_baseline_lines_immutable on public.contract_commercial_baseline_line_items;
create trigger commercial_baseline_lines_immutable before update or delete on public.contract_commercial_baseline_line_items
for each row execute function public.reject_commercial_baseline_mutation();

drop trigger if exists renewal_quote_proposals_org_scope on public.renewal_quote_proposal_versions;
create trigger renewal_quote_proposals_org_scope before insert or update on public.renewal_quote_proposal_versions
for each row execute function public.enforce_commercial_comparison_organization_scope();
drop trigger if exists renewal_quote_proposal_lines_org_scope on public.renewal_quote_proposal_line_items;
create trigger renewal_quote_proposal_lines_org_scope before insert or update on public.renewal_quote_proposal_line_items
for each row execute function public.enforce_commercial_comparison_organization_scope();
drop trigger if exists renewal_quote_cost_bridges_org_scope on public.renewal_quote_cost_bridges;
create trigger renewal_quote_cost_bridges_org_scope before insert on public.renewal_quote_cost_bridges
for each row execute function public.enforce_commercial_comparison_organization_scope();
drop trigger if exists renewal_quote_scenarios_org_scope on public.renewal_quote_scenarios;
create trigger renewal_quote_scenarios_org_scope before insert or update on public.renewal_quote_scenarios
for each row execute function public.enforce_commercial_comparison_organization_scope();

create index if not exists commercial_baselines_org_contract_version_idx
  on public.contract_commercial_baselines (organization_id, contract_id, version desc);
create index if not exists proposal_versions_org_contract_version_idx
  on public.renewal_quote_proposal_versions (organization_id, contract_id, version desc);
create index if not exists cost_bridges_org_contract_created_idx
  on public.renewal_quote_cost_bridges (organization_id, contract_id, created_at desc);
create index if not exists quote_scenarios_org_contract_status_idx
  on public.renewal_quote_scenarios (organization_id, contract_id, status, updated_at desc);

alter table public.contract_commercial_baselines enable row level security;
alter table public.contract_commercial_baseline_line_items enable row level security;
alter table public.renewal_quote_proposal_versions enable row level security;
alter table public.renewal_quote_proposal_line_items enable row level security;
alter table public.renewal_quote_cost_bridges enable row level security;
alter table public.renewal_quote_scenarios enable row level security;

create policy "Org members read commercial baselines" on public.contract_commercial_baselines for select
using (exists (select 1 from public.memberships m where m.organization_id = contract_commercial_baselines.organization_id and m.user_id = auth.uid()));
create policy "Review roles create commercial baselines" on public.contract_commercial_baselines for insert
with check (exists (select 1 from public.memberships m where m.organization_id = contract_commercial_baselines.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));
create policy "Org members read commercial baseline lines" on public.contract_commercial_baseline_line_items for select
using (exists (select 1 from public.memberships m where m.organization_id = contract_commercial_baseline_line_items.organization_id and m.user_id = auth.uid()));
create policy "Review roles create commercial baseline lines" on public.contract_commercial_baseline_line_items for insert
with check (exists (select 1 from public.memberships m where m.organization_id = contract_commercial_baseline_line_items.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

create policy "Org members read proposal versions" on public.renewal_quote_proposal_versions for select
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_versions.organization_id and m.user_id = auth.uid()));
create policy "Review roles create proposal versions" on public.renewal_quote_proposal_versions for insert
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_versions.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));
create policy "Review roles update proposal versions" on public.renewal_quote_proposal_versions for update
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_versions.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_versions.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));
create policy "Org members read proposal lines" on public.renewal_quote_proposal_line_items for select
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_line_items.organization_id and m.user_id = auth.uid()));
create policy "Review roles manage proposal lines" on public.renewal_quote_proposal_line_items for all
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_line_items.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_proposal_line_items.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

create policy "Org members read cost bridges" on public.renewal_quote_cost_bridges for select
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_cost_bridges.organization_id and m.user_id = auth.uid()));
create policy "Review roles create cost bridges" on public.renewal_quote_cost_bridges for insert
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_cost_bridges.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));
create policy "Org members read quote scenarios" on public.renewal_quote_scenarios for select
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_scenarios.organization_id and m.user_id = auth.uid()));
create policy "Operators manage quote scenarios" on public.renewal_quote_scenarios for insert
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_scenarios.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','owner')));
create policy "Operators update quote scenarios" on public.renewal_quote_scenarios for update
using (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_scenarios.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','owner')))
with check (exists (select 1 from public.memberships m where m.organization_id = renewal_quote_scenarios.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','owner')));

comment on table public.contract_commercial_baselines is
  'Immutable reviewed commercial baseline versions. Material changes create new rows.';
comment on table public.renewal_quote_proposal_versions is
  'Proposal evidence versions; never applied silently to the contract baseline.';
comment on column public.savings_opportunities.estimate_status is
  'Estimated, approved, and realized values are intentionally distinct.';
