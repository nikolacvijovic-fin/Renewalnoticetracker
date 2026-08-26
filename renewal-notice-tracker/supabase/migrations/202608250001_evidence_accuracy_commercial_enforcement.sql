-- Evidence accuracy and paid-beta enforcement stabilization.

alter table public.contract_usage_matches
  add column if not exists match_status text not null default 'active',
  add column if not exists resolved_at timestamptz,
  add column if not exists superseded_at timestamptz;

alter table public.contract_usage_matches
  drop constraint if exists contract_usage_matches_match_status_check;
alter table public.contract_usage_matches
  add constraint contract_usage_matches_match_status_check
  check (match_status in ('active', 'rejected', 'resolved', 'superseded'));

create unique index if not exists contract_usage_matches_one_active_row_match_idx
  on public.contract_usage_matches(organization_id, contract_id, usage_row_id)
  where match_status = 'active' and resolved_at is null and superseded_at is null;

alter table public.contracts
  add column if not exists owner_confirmed_at timestamptz,
  add column if not exists owner_confirmed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists department_confirmed_at timestamptz;

alter table public.organizations
  add column if not exists timezone text;

alter table public.contract_metadata
  add column if not exists financial_terms_reviewed_at timestamptz,
  add column if not exists deadline_verified_at timestamptz,
  add column if not exists deadline_timezone text;

alter table public.renewal_quote_comparisons
  add column if not exists quote_reviewed_at timestamptz;

alter table public.renewal_commercial_decisions
  add column if not exists profile_selected_at timestamptz,
  add column if not exists profile_selected_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists approval_evidence_hash text,
  add column if not exists approval_evidence_verified_at timestamptz;

alter table public.evidence_readiness_assessments
  add column if not exists deadline_timezone text,
  add column if not exists material_evidence_hash text;
alter table public.evidence_readiness_items
  add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table public.evidence_readiness_history
  add column if not exists recalculation_trigger text not null default 'unspecified',
  add column if not exists material_evidence_hash text;

alter table public.license_waste_opportunities
  drop constraint if exists license_waste_opportunities_review_status_check;
alter table public.license_waste_opportunities
  add constraint license_waste_opportunities_review_status_check
  check (review_status in ('open', 'accepted', 'rejected', 'deferred', 'action_planned'));

create or replace function public.persist_evidence_readiness_assessment_v2(
  p_organization_id uuid,
  p_contract_id uuid,
  p_decision_profile text,
  p_score numeric,
  p_readiness_state text,
  p_calculation_version text,
  p_evidence_hash text,
  p_material_evidence_hash text,
  p_next_recommended_action text,
  p_calculated_at timestamptz,
  p_items jsonb,
  p_deadline_timezone text,
  p_recalculation_trigger text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_history_id uuid;
begin
  if p_recalculation_trigger !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid evidence recalculation trigger';
  end if;
  if p_material_evidence_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid material evidence hash';
  end if;
  v_result := public.persist_evidence_readiness_assessment(
    p_organization_id, p_contract_id, p_decision_profile, p_score,
    p_readiness_state, p_calculation_version, p_evidence_hash,
    p_next_recommended_action, p_calculated_at, p_items
  );
  v_history_id := nullif(v_result->>'historyId', '')::uuid;
  if v_history_id is not null then
    update public.evidence_readiness_history
    set recalculation_trigger = p_recalculation_trigger
    where id = v_history_id and organization_id = p_organization_id and contract_id = p_contract_id;
  end if;
  update public.evidence_readiness_assessments
  set deadline_timezone = p_deadline_timezone,
      material_evidence_hash = p_material_evidence_hash
  where id = nullif(v_result->>'assessmentId', '')::uuid
    and organization_id = p_organization_id
    and contract_id = p_contract_id;
  update public.evidence_readiness_items item
  set provenance = coalesce(source_item.value->'provenance', '{}'::jsonb)
  from jsonb_array_elements(p_items) source_item(value)
  where item.assessment_id = nullif(v_result->>'assessmentId', '')::uuid
    and item.organization_id = p_organization_id
    and item.contract_id = p_contract_id
    and item.requirement_key = source_item.value->>'requirementKey';
  if v_history_id is not null then
    update public.evidence_readiness_history
    set item_snapshot = p_items,
        material_evidence_hash = p_material_evidence_hash
    where id = v_history_id
      and organization_id = p_organization_id
      and contract_id = p_contract_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.persist_evidence_readiness_assessment_v2(uuid, uuid, text, numeric, text, text, text, text, text, timestamptz, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.persist_evidence_readiness_assessment_v2(uuid, uuid, text, numeric, text, text, text, text, text, timestamptz, jsonb, text, text)
  to service_role;

comment on column public.evidence_readiness_history.recalculation_trigger is
  'Bounded source event for a changed assessment; page views are not valid triggers.';

create or replace function public.bind_renewal_approval_to_material_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_material_evidence_hash text;
begin
  if new.decision_status = 'approved' and old.decision_status is distinct from 'approved' then
    select assessment.material_evidence_hash into v_material_evidence_hash
    from public.evidence_readiness_assessments assessment
    where assessment.organization_id = new.organization_id
      and assessment.contract_id = new.contract_id
      and assessment.material_evidence_hash is not null
    order by assessment.calculated_at desc
    limit 1;

    if v_material_evidence_hash is null then
      raise exception 'Current material evidence assessment required before approval' using errcode = '40001';
    end if;
    new.approval_evidence_hash := v_material_evidence_hash;
    new.approval_evidence_verified_at := timezone('utc', now());
  elsif old.approval_evidence_hash is not null and (
    old.decision_type is distinct from new.decision_type
    or old.rationale is distinct from new.rationale
    or old.preferred_scenario_id is distinct from new.preferred_scenario_id
    or old.estimated_financial_effect is distinct from new.estimated_financial_effect
    or old.currency is distinct from new.currency
    or old.decision_deadline is distinct from new.decision_deadline
    or old.evidence_references is distinct from new.evidence_references
  ) then
    new.approval_evidence_hash := null;
    new.approval_evidence_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists renewal_decision_approval_material_evidence_guard on public.renewal_commercial_decisions;
create trigger renewal_decision_approval_material_evidence_guard
before update on public.renewal_commercial_decisions
for each row execute function public.bind_renewal_approval_to_material_evidence();

create or replace function public.invalidate_renewal_approval_after_material_evidence_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.material_evidence_hash is not distinct from new.material_evidence_hash then
    return new;
  end if;

  update public.renewal_commercial_decisions decision
  set decision_status = 'returned_for_changes',
      approved_version = null,
      approved_at = null,
      finalized_at = null,
      approval_evidence_hash = null,
      approval_evidence_verified_at = null,
      updated_at = timezone('utc', now())
  where decision.organization_id = new.organization_id
    and decision.contract_id = new.contract_id
    and decision.decision_status in ('approved', 'finalized', 'decision_recorded')
    and decision.approval_evidence_hash is distinct from new.material_evidence_hash;
  return new;
end;
$$;

drop trigger if exists evidence_readiness_material_change_invalidates_approval on public.evidence_readiness_assessments;
create trigger evidence_readiness_material_change_invalidates_approval
after insert or update of material_evidence_hash on public.evidence_readiness_assessments
for each row execute function public.invalidate_renewal_approval_after_material_evidence_change();

create or replace function public.require_current_material_evidence_for_renewal_outcome()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_approval_hash text;
  v_current_hash text;
begin
  select decision.approval_evidence_hash into v_approval_hash
  from public.renewal_commercial_decisions decision
  where decision.organization_id = new.organization_id
    and decision.id = new.decision_id;

  select assessment.material_evidence_hash into v_current_hash
  from public.evidence_readiness_assessments assessment
  where assessment.organization_id = new.organization_id
    and assessment.contract_id = new.contract_id
  order by assessment.calculated_at desc
  limit 1;

  if v_approval_hash is null or v_current_hash is null or v_approval_hash is distinct from v_current_hash then
    raise exception 'Renewal outcome requires approval against current material evidence' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists renewal_outcome_current_material_evidence_guard on public.renewal_decision_outcomes;
create trigger renewal_outcome_current_material_evidence_guard
before insert on public.renewal_decision_outcomes
for each row execute function public.require_current_material_evidence_for_renewal_outcome();

create or replace function public.enforce_design_partner_beta_membership_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer;
  v_status text;
  v_expires_at timestamptz;
  v_grace_ends_at timestamptz;
  v_founder_approved_at timestamptz;
  v_count integer;
  v_override_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('beta-seat:' || new.organization_id::text, 0));
  select maximum_user_seats, status, expires_at, grace_ends_at, founder_approved_at
  into v_limit, v_status, v_expires_at, v_grace_ends_at, v_founder_approved_at
  from public.design_partner_beta_controls
  where organization_id = new.organization_id
  for update;

  if not found then return new; end if;

  v_override_reason := nullif(current_setting('app.design_partner_beta_seat_override_reason', true), '');
  if v_override_reason is not null and auth.role() = 'service_role' then
    insert into public.audit_logs(organization_id, actor_user_id, action, details)
    values (new.organization_id, auth.uid(), 'beta.user_seat_limit_overridden', jsonb_build_object(
      'organizationId', new.organization_id,
      'targetUserId', new.user_id,
      'reasonCode', left(v_override_reason, 120)
    ));
    return new;
  end if;

  if v_status <> 'active'
    or v_founder_approved_at is null
    or (v_expires_at is not null and now() >= v_expires_at)
    or (v_grace_ends_at is not null and now() >= v_grace_ends_at) then
    raise exception 'Design Partner Beta is read-only' using errcode = '42501';
  end if;

  select count(*) into v_count from public.memberships where organization_id = new.organization_id;
  if v_count >= v_limit then
    raise exception 'Design Partner Beta user-seat limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_design_partner_beta_membership_seat_limit on public.memberships;
create trigger enforce_design_partner_beta_membership_seat_limit
before insert on public.memberships
for each row execute function public.enforce_design_partner_beta_membership_seat_limit();

comment on function public.enforce_design_partner_beta_membership_seat_limit() is
  'Transactionally counts active memberships. Pending invitations do not consume seats because the current product has no persisted invitation state.';

create or replace function public.enforce_design_partner_beta_org_writable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_organization_id uuid;
  v_control public.design_partner_beta_controls%rowtype;
  v_override_reason text;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
  else
    v_organization_id := new.organization_id;
  end if;

  select * into v_control
  from public.design_partner_beta_controls
  where organization_id = v_organization_id;

  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_override_reason := nullif(current_setting('app.design_partner_beta_mutation_override_reason', true), '');
  if v_override_reason is not null and auth.role() = 'service_role' then
    insert into public.audit_logs(organization_id, actor_user_id, action, details)
    values (v_organization_id, auth.uid(), 'beta.mutation_overridden', jsonb_build_object(
      'organizationId', v_organization_id,
      'tableName', tg_table_name,
      'operation', lower(tg_op),
      'reasonCode', left(v_override_reason, 120)
    ));
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_control.status <> 'active'
    or v_control.founder_approved_at is null
    or (v_control.expires_at is not null and now() >= v_control.expires_at)
    or (v_control.grace_ends_at is not null and now() >= v_control.grace_ends_at) then
    raise exception 'Design Partner Beta is read-only' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'contracts',
    'memberships',
    'subscription_usage_provider_connections',
    'subscription_usage_sync_runs',
    'usage_import_batches',
    'usage_import_rows',
    'contract_usage_matches',
    'license_waste_opportunities',
    'renewal_quote_comparisons',
    'renewal_quote_comparison_findings',
    'renewal_commercial_decisions',
    'renewal_decision_approval_steps',
    'renewal_decision_scenarios',
    'renewal_workspace_tasks',
    'renewal_decision_outcomes',
    'renewal_negotiation_briefs',
    'vendor_communication_drafts',
    'evidence_readiness_assessments',
    'evidence_readiness_items',
    'evidence_readiness_history'
  ]
  loop
    execute format('drop trigger if exists enforce_design_partner_beta_org_writable on public.%I', v_table);
    execute format(
      'create trigger enforce_design_partner_beta_org_writable before insert or update or delete on public.%I for each row execute function public.enforce_design_partner_beta_org_writable()',
      v_table
    );
  end loop;
end;
$$;

comment on function public.enforce_design_partner_beta_org_writable() is
  'Database backstop that keeps pending, grace, read-only, ended, and expired paid-beta organizations read-only across commercial mutation tables.';
