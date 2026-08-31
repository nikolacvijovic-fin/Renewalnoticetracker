-- Keep the shared scope trigger from reading fields that do not exist on the
-- table currently invoking it. PostgreSQL record fields are resolved when an
-- expression is evaluated, so table-specific checks must live in their own
-- branches rather than rely on boolean short-circuiting.

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

  if tg_table_name = 'contract_extraction_runs' then
    if new.contract_file_id is not null and not exists (
      select 1 from public.contract_files f
      where f.id = new.contract_file_id and f.contract_id = new.contract_id
    ) then
      raise exception 'contract extraction file scope mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'contract_document_pages' then
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
  elsif tg_table_name = 'contract_extracted_fields' then
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
  elsif tg_table_name = 'contract_document_relationships' then
    if not exists (
      select 1 from public.contract_files f
      where f.id = new.source_file_id and f.contract_id = new.contract_id
    ) or not exists (
      select 1 from public.contract_files f
      where f.id = new.target_file_id and f.contract_id = new.contract_id
    ) then
      raise exception 'contract document relationship scope mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'contract_commercial_findings' then
    if new.extraction_run_id is not null and not exists (
      select 1 from public.contract_extraction_runs r
      where r.id = new.extraction_run_id
        and r.organization_id = new.organization_id
        and r.contract_id = new.contract_id
    ) then
      raise exception 'commercial finding extraction scope mismatch' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_contract_intelligence_scope() from public, anon;

comment on function public.enforce_contract_intelligence_scope() is
  'Enforces organization and contract scope for contract-intelligence records without accessing fields from unrelated trigger tables.';

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

  if tg_table_name = 'contract_commercial_baselines' then
    if not exists (
      select 1 from public.contract_extraction_runs run
      where run.id = new.source_extraction_run_id
        and run.organization_id = new.organization_id
        and run.contract_id = new.contract_id
    ) then
      raise exception 'commercial baseline extraction organization mismatch';
    end if;
  elsif tg_table_name = 'contract_commercial_baseline_line_items' then
    if not exists (
      select 1 from public.contract_commercial_baselines baseline
      where baseline.id = new.baseline_id
        and baseline.organization_id = new.organization_id
        and baseline.contract_id = new.contract_id
    ) then
      raise exception 'commercial baseline line organization mismatch';
    end if;
  elsif tg_table_name = 'renewal_quote_proposal_versions' then
    if not exists (
      select 1 from public.renewal_quote_comparisons comparison
      where comparison.id = new.comparison_id
        and comparison.organization_id = new.organization_id
        and comparison.contract_id = new.contract_id
    ) or (
      new.quote_file_id is not null and not exists (
        select 1 from public.contract_files file
        where file.id = new.quote_file_id and file.contract_id = new.contract_id
      )
    ) then
      raise exception 'proposal evidence organization mismatch';
    end if;
  elsif tg_table_name = 'renewal_quote_proposal_line_items' then
    if not exists (
      select 1 from public.renewal_quote_proposal_versions proposal
      where proposal.id = new.proposal_version_id
        and proposal.organization_id = new.organization_id
        and proposal.contract_id = new.contract_id
    ) then
      raise exception 'proposal line organization mismatch';
    end if;
  elsif tg_table_name = 'renewal_quote_cost_bridges' then
    if not exists (
      select 1 from public.renewal_quote_comparisons comparison
      where comparison.id = new.comparison_id
        and comparison.organization_id = new.organization_id
        and comparison.contract_id = new.contract_id
    ) or not exists (
      select 1 from public.contract_commercial_baselines baseline
      where baseline.id = new.baseline_id
        and baseline.organization_id = new.organization_id
        and baseline.contract_id = new.contract_id
    ) or not exists (
      select 1 from public.renewal_quote_proposal_versions proposal
      where proposal.id = new.proposal_version_id
        and proposal.organization_id = new.organization_id
        and proposal.contract_id = new.contract_id
    ) then
      raise exception 'cost bridge organization mismatch';
    end if;
  elsif tg_table_name = 'renewal_quote_scenarios' then
    if not exists (
      select 1 from public.renewal_quote_comparisons comparison
      where comparison.id = new.comparison_id
        and comparison.organization_id = new.organization_id
        and comparison.contract_id = new.contract_id
    ) then
      raise exception 'quote scenario organization mismatch';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_commercial_comparison_organization_scope() is
  'Enforces organization scope for commercial-comparison records without accessing fields from unrelated trigger tables.';
