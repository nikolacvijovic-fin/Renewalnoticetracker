-- Renewal decision and negotiation workspace. Extends the existing commercial-decision kernel.

alter table public.renewal_commercial_decisions
  add column if not exists decision_type text not null default 'insufficient_information',
  add column if not exists decision_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists decision_deadline date,
  add column if not exists rationale text,
  add column if not exists evidence_references jsonb not null default '[]'::jsonb,
  add column if not exists estimated_financial_effect numeric,
  add column if not exists decision_version integer not null default 1,
  add column if not exists approved_version integer,
  add column if not exists separation_of_duties_required boolean not null default true,
  add column if not exists preferred_scenario_id uuid,
  add column if not exists final_outcome text,
  add column if not exists realized_savings_amount numeric,
  add column if not exists outcome_confirmed_at timestamptz;

alter table public.renewal_commercial_decisions
  drop constraint if exists renewal_commercial_decisions_decision_type_check,
  add constraint renewal_commercial_decisions_decision_type_check check (decision_type in (
    'renew_unchanged', 'renew_reduced_seats', 'renegotiate_price_or_terms', 'consolidate_products',
    'terminate', 'replace_vendor', 'defer_pending_evidence', 'insufficient_information'
  )),
  drop constraint if exists renewal_commercial_decisions_status_check,
  add constraint renewal_commercial_decisions_status_check check (decision_status in (
    'draft', 'evidence_pending', 'evidence_required', 'ready_for_review', 'in_approval', 'awaiting_approval',
    'approved', 'rejected', 'returned_for_changes', 'finalized', 'decision_recorded',
    'outcome_confirmed', 'archived'
  )),
  drop constraint if exists renewal_commercial_decisions_workspace_values_check,
  add constraint renewal_commercial_decisions_workspace_values_check check (
    decision_version >= 1
    and (approved_version is null or approved_version between 1 and decision_version)
    and (rationale is null or char_length(rationale) <= 4000)
    and (estimated_financial_effect is null or estimated_financial_effect >= 0)
    and (realized_savings_amount is null or realized_savings_amount >= 0)
    and (currency is null or currency ~ '^[A-Z]{3}$')
  );

update public.renewal_commercial_decisions
set approved_version = decision_version
where approved_version is null
  and approved_at is not null
  and decision_status in ('approved', 'finalized');

alter table public.renewal_decision_approval_steps
  add column if not exists decision_version integer not null default 1,
  add column if not exists separation_required boolean not null default true;

alter table public.renewal_decision_snapshots
  add column if not exists decision_type text not null default 'insufficient_information',
  add column if not exists decision_version integer not null default 1;

alter table public.renewal_negotiation_briefs
  add column if not exists questions_requiring_confirmation jsonb not null default '[]'::jsonb,
  add column if not exists evidence_limitations jsonb not null default '[]'::jsonb,
  add column if not exists brief_version integer not null default 1;

alter table public.vendor_communication_drafts
  add column if not exists draft_type text not null default 'request_renewal_quote',
  add column if not exists version_number integer not null default 1,
  add column if not exists human_review_required boolean not null default true,
  add column if not exists unsent boolean not null default true;

alter table public.vendor_communication_drafts
  drop constraint if exists vendor_communication_drafts_type_check,
  add constraint vendor_communication_drafts_type_check check (draft_type in (
    'request_renewal_quote', 'request_seat_reduction_pricing', 'challenge_price_increase',
    'request_revised_payment_terms', 'notice_of_nonrenewal', 'request_additional_time'
  )),
  drop constraint if exists vendor_communication_drafts_manual_boundary_check,
  add constraint vendor_communication_drafts_manual_boundary_check check (
    human_review_required = true and unsent = true and position('send' in lower(status)) = 0
  );

create table if not exists public.renewal_decision_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  scenario_type text not null check (scenario_type in (
    'current_renewal', 'reduced_seat_count', 'negotiated_discount', 'shorter_renewal_term',
    'product_consolidation', 'termination_or_replacement'
  )),
  name text not null check (char_length(name) between 1 and 160),
  current_annual_cost numeric check (current_annual_cost is null or current_annual_cost >= 0),
  annual_cost numeric not null check (annual_cost >= 0),
  change_from_current_cost numeric,
  estimated_savings numeric not null default 0 check (estimated_savings >= 0),
  one_time_transition_cost numeric not null default 0 check (one_time_transition_cost >= 0),
  net_first_year_effect numeric not null default 0,
  commitment_years integer not null default 1 check (commitment_years between 1 and 10),
  multi_year_committed_cost numeric not null check (multi_year_committed_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate_source text check (exchange_rate_source is null or char_length(exchange_rate_source) <= 200),
  evidence_refs jsonb not null default '[]'::jsonb,
  evidence_completeness numeric not null default 0 check (evidence_completeness between 0 and 1),
  is_preferred boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists renewal_decision_scenarios_one_preferred_idx
  on public.renewal_decision_scenarios(organization_id, decision_id) where is_preferred;
create index if not exists renewal_decision_scenarios_contract_idx
  on public.renewal_decision_scenarios(organization_id, contract_id, decision_id, created_at desc);

create table if not exists public.renewal_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  dependency_task_id uuid references public.renewal_workspace_tasks(id) on delete set null,
  evidence_requirement text check (evidence_requirement is null or char_length(evidence_requirement) <= 500),
  completion_note text check (completion_note is null or char_length(completion_note) <= 1000),
  reminder_id uuid references public.reminders(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists renewal_workspace_tasks_queue_idx
  on public.renewal_workspace_tasks(organization_id, status, due_at, priority);
create index if not exists renewal_workspace_tasks_decision_idx
  on public.renewal_workspace_tasks(organization_id, decision_id, created_at desc);

create table if not exists public.renewal_decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete restrict,
  decision_version integer not null check (decision_version >= 1),
  selected_decision_type text not null check (selected_decision_type in (
    'renew_unchanged', 'renew_reduced_seats', 'renegotiate_price_or_terms', 'consolidate_products',
    'terminate', 'replace_vendor', 'defer_pending_evidence', 'insufficient_information'
  )),
  original_cost numeric check (original_cost is null or original_cost >= 0),
  final_agreed_cost numeric check (final_agreed_cost is null or final_agreed_cost >= 0),
  seats_before integer check (seats_before is null or seats_before >= 0),
  seats_after integer check (seats_after is null or seats_after >= 0),
  contract_term_months integer check (contract_term_months is null or contract_term_months between 1 and 240),
  estimated_savings numeric check (estimated_savings is null or estimated_savings >= 0),
  realized_savings numeric check (realized_savings is null or realized_savings >= 0),
  avoided_cost_increase numeric check (avoided_cost_increase is null or avoided_cost_increase >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  decision_date date not null,
  renewal_completed_at timestamptz not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  evidence_completeness numeric not null default 0 check (evidence_completeness between 0 and 1),
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, decision_id)
);

create index if not exists renewal_decision_outcomes_value_idx
  on public.renewal_decision_outcomes(organization_id, currency, renewal_completed_at desc);

alter table public.renewal_decision_scenarios enable row level security;
alter table public.renewal_workspace_tasks enable row level security;
alter table public.renewal_decision_outcomes enable row level security;

create or replace function public.is_renewal_workspace_reviewer(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  );
$$;

create or replace function public.is_renewal_workspace_member(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_renewal_workspace_reviewer(uuid) from public, anon;
revoke all on function public.is_renewal_workspace_member(uuid) from public, anon;
grant execute on function public.is_renewal_workspace_reviewer(uuid) to authenticated;
grant execute on function public.is_renewal_workspace_member(uuid) to authenticated;

create policy "members read renewal scenarios" on public.renewal_decision_scenarios
  for select using (public.is_renewal_workspace_member(organization_id));
create policy "reviewers create renewal scenarios" on public.renewal_decision_scenarios
  for insert with check (public.is_renewal_workspace_reviewer(organization_id));
create policy "reviewers update renewal scenarios" on public.renewal_decision_scenarios
  for update using (public.is_renewal_workspace_reviewer(organization_id))
  with check (public.is_renewal_workspace_reviewer(organization_id));

create policy "members read renewal tasks" on public.renewal_workspace_tasks
  for select using (public.is_renewal_workspace_member(organization_id));
create policy "reviewers or task owners create renewal tasks" on public.renewal_workspace_tasks
  for insert with check (
    public.is_renewal_workspace_reviewer(organization_id)
    or (owner_user_id = auth.uid() and public.is_renewal_workspace_member(organization_id))
  );
create policy "reviewers or task owners update renewal tasks" on public.renewal_workspace_tasks
  for update using (
    public.is_renewal_workspace_reviewer(organization_id)
    or (owner_user_id = auth.uid() and public.is_renewal_workspace_member(organization_id))
  ) with check (
    public.is_renewal_workspace_reviewer(organization_id)
    or (owner_user_id = auth.uid() and public.is_renewal_workspace_member(organization_id))
  );

create policy "members read renewal outcomes" on public.renewal_decision_outcomes
  for select using (public.is_renewal_workspace_member(organization_id));
create policy "reviewers create renewal outcomes" on public.renewal_decision_outcomes
  for insert with check (public.is_renewal_workspace_reviewer(organization_id));
create policy "reviewers update renewal outcomes" on public.renewal_decision_outcomes
  for update using (public.is_renewal_workspace_reviewer(organization_id))
  with check (public.is_renewal_workspace_reviewer(organization_id));

create or replace function public.enforce_renewal_workspace_tenant_coherence()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_decision public.renewal_commercial_decisions%rowtype;
  v_dependency public.renewal_workspace_tasks%rowtype;
begin
  select * into v_decision from public.renewal_commercial_decisions d
  where d.id = new.decision_id for share;
  if v_decision.id is null or v_decision.organization_id <> new.organization_id or v_decision.contract_id <> new.contract_id then
    raise exception 'Renewal workspace scope mismatch' using errcode = '42501';
  end if;
  if tg_table_name = 'renewal_workspace_tasks' and new.dependency_task_id is not null then
    select * into v_dependency from public.renewal_workspace_tasks t where t.id = new.dependency_task_id;
    if v_dependency.id is null or v_dependency.organization_id <> new.organization_id or v_dependency.decision_id <> new.decision_id then
      raise exception 'Renewal task dependency scope mismatch' using errcode = '42501';
    end if;
    if new.status = 'completed' and v_dependency.status <> 'completed' then
      raise exception 'Renewal task dependency must be completed first' using errcode = '22023';
    end if;
  end if;
  if tg_table_name = 'renewal_workspace_tasks' and new.owner_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = new.owner_user_id
  ) then
    raise exception 'Renewal task owner must belong to the organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger renewal_scenarios_scope_guard before insert or update on public.renewal_decision_scenarios
  for each row execute function public.enforce_renewal_workspace_tenant_coherence();
create trigger renewal_tasks_scope_guard before insert or update on public.renewal_workspace_tasks
  for each row execute function public.enforce_renewal_workspace_tenant_coherence();
create trigger renewal_outcomes_scope_guard before insert or update on public.renewal_decision_outcomes
  for each row execute function public.enforce_renewal_workspace_tenant_coherence();

create or replace function public.enforce_renewal_decision_owner_scope()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.decision_owner_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = new.decision_owner_user_id
  ) then
    raise exception 'Renewal decision owner must belong to the organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger renewal_decision_owner_scope_guard
  before insert or update of organization_id, decision_owner_user_id on public.renewal_commercial_decisions
  for each row execute function public.enforce_renewal_decision_owner_scope();

create or replace function public.enforce_renewal_decision_material_reapproval()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.decision_status = 'outcome_confirmed' and (
    old.decision_type is distinct from new.decision_type
    or old.rationale is distinct from new.rationale
    or old.preferred_scenario_id is distinct from new.preferred_scenario_id
    or old.estimated_financial_effect is distinct from new.estimated_financial_effect
    or old.currency is distinct from new.currency
    or old.decision_deadline is distinct from new.decision_deadline
    or old.evidence_references is distinct from new.evidence_references
  ) then
    raise exception 'Confirmed renewal outcome decision is immutable' using errcode = '42501';
  end if;
  if old.decision_status in ('approved', 'finalized', 'decision_recorded') and (
    old.decision_type is distinct from new.decision_type
    or old.rationale is distinct from new.rationale
    or old.preferred_scenario_id is distinct from new.preferred_scenario_id
    or old.estimated_financial_effect is distinct from new.estimated_financial_effect
    or old.currency is distinct from new.currency
    or old.decision_deadline is distinct from new.decision_deadline
    or old.evidence_references is distinct from new.evidence_references
  ) then
    new.decision_version := old.decision_version + 1;
    new.approved_version := null;
    new.approved_at := null;
    new.finalized_at := null;
    new.decision_status := 'returned_for_changes';
  end if;
  return new;
end;
$$;

create trigger renewal_decision_material_reapproval before update on public.renewal_commercial_decisions
  for each row execute function public.enforce_renewal_decision_material_reapproval();

create or replace function public.prevent_renewal_decision_self_approval()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_decision public.renewal_commercial_decisions%rowtype;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into v_decision from public.renewal_commercial_decisions d
    where d.id = new.decision_id and d.organization_id = new.organization_id;
    if new.decision_version <> v_decision.decision_version then
      raise exception 'Approval version mismatch' using errcode = '40001';
    end if;
    if coalesce(new.separation_required, v_decision.separation_of_duties_required)
      and new.acted_by_user_id is not null
      and new.acted_by_user_id in (v_decision.created_by_user_id, v_decision.decision_owner_user_id) then
      raise exception 'Separation of approval duties required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger renewal_approval_separation_guard before update on public.renewal_decision_approval_steps
  for each row execute function public.prevent_renewal_decision_self_approval();

create or replace function public.approve_renewal_decision_version(
  p_organization_id uuid,
  p_decision_id uuid,
  p_expected_version integer,
  p_reviewer_note text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_decision public.renewal_commercial_decisions%rowtype;
  v_step public.renewal_decision_approval_steps%rowtype;
  v_actor uuid := auth.uid();
  v_note text;
begin
  if v_actor is null or not public.is_renewal_workspace_reviewer(p_organization_id) then
    raise exception 'Insufficient renewal approval role' using errcode = '42501';
  end if;
  select * into v_decision from public.renewal_commercial_decisions d
  where d.id = p_decision_id and d.organization_id = p_organization_id for update;
  if v_decision.id is null or v_decision.decision_status not in ('in_approval', 'awaiting_approval') then
    raise exception 'Renewal decision is not awaiting approval' using errcode = '40001';
  end if;
  if v_decision.decision_version <> p_expected_version then
    raise exception 'Approval version mismatch' using errcode = '40001';
  end if;
  if v_decision.approver_user_id is distinct from v_actor then
    raise exception 'Only the assigned approver can approve' using errcode = '42501';
  end if;
  if v_decision.separation_of_duties_required
    and v_actor in (v_decision.created_by_user_id, v_decision.decision_owner_user_id) then
    raise exception 'Separation of approval duties required' using errcode = '42501';
  end if;
  select * into v_step from public.renewal_decision_approval_steps s
  where s.organization_id = p_organization_id and s.decision_id = p_decision_id
    and s.decision_version = p_expected_version and s.status = 'pending'
  order by s.step_order for update limit 1;
  if v_step.id is null then
    raise exception 'Current decision version has no pending approval step' using errcode = '40001';
  end if;
  v_note := left(regexp_replace(coalesce(p_reviewer_note, ''), '\s+', ' ', 'g'), 600);
  if v_note ~* '(raw (contract|quote|ocr|document)|ocr output|provider payload|storage path|secret|token|bearer)' then
    v_note := 'Reviewer note redacted because it contained sensitive raw content markers.';
  end if;
  update public.renewal_decision_approval_steps
  set status = 'approved', acted_by_user_id = v_actor, acted_at = timezone('utc', now()),
      reviewer_note = nullif(v_note, ''), updated_at = timezone('utc', now())
  where id = v_step.id and status = 'pending';
  if not found then raise exception 'Approval step changed concurrently' using errcode = '40001'; end if;
  update public.renewal_commercial_decisions
  set decision_status = 'approved', approved_at = timezone('utc', now()),
      approved_version = p_expected_version, approver_user_id = v_actor,
      updated_at = timezone('utc', now())
  where id = p_decision_id and organization_id = p_organization_id
    and decision_version = p_expected_version
    and decision_status in ('in_approval', 'awaiting_approval');
  if not found then raise exception 'Renewal decision changed concurrently' using errcode = '40001'; end if;
  return p_decision_id;
end;
$$;

revoke all on function public.approve_renewal_decision_version(uuid, uuid, integer, text) from public, anon;
grant execute on function public.approve_renewal_decision_version(uuid, uuid, integer, text) to authenticated;

drop trigger if exists renewal_decision_scenarios_touch_updated_at on public.renewal_decision_scenarios;
create trigger renewal_decision_scenarios_touch_updated_at before update on public.renewal_decision_scenarios
  for each row execute function public.touch_updated_at();
drop trigger if exists renewal_workspace_tasks_touch_updated_at on public.renewal_workspace_tasks;
create trigger renewal_workspace_tasks_touch_updated_at before update on public.renewal_workspace_tasks
  for each row execute function public.touch_updated_at();
drop trigger if exists renewal_decision_outcomes_touch_updated_at on public.renewal_decision_outcomes;
create trigger renewal_decision_outcomes_touch_updated_at before update on public.renewal_decision_outcomes
  for each row execute function public.touch_updated_at();

alter table public.renewal_commercial_decisions
  drop constraint if exists renewal_commercial_decisions_preferred_scenario_fk,
  add constraint renewal_commercial_decisions_preferred_scenario_fk
    foreign key (preferred_scenario_id) references public.renewal_decision_scenarios(id) on delete set null;

create or replace function public.select_renewal_decision_scenario(
  p_organization_id uuid,
  p_decision_id uuid,
  p_scenario_id uuid
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_decision public.renewal_commercial_decisions%rowtype;
  v_scenario public.renewal_decision_scenarios%rowtype;
begin
  if not public.is_renewal_workspace_reviewer(p_organization_id) then
    raise exception 'Insufficient renewal workspace role' using errcode = '42501';
  end if;
  select * into v_decision from public.renewal_commercial_decisions d
  where d.id = p_decision_id and d.organization_id = p_organization_id for update;
  select * into v_scenario from public.renewal_decision_scenarios s
  where s.id = p_scenario_id and s.organization_id = p_organization_id
    and s.decision_id = p_decision_id and s.contract_id = v_decision.contract_id for update;
  if v_decision.id is null or v_scenario.id is null then
    raise exception 'Renewal scenario scope mismatch' using errcode = '42501';
  end if;
  update public.renewal_decision_scenarios set is_preferred = false
  where organization_id = p_organization_id and decision_id = p_decision_id and is_preferred;
  update public.renewal_decision_scenarios set is_preferred = true
  where organization_id = p_organization_id and id = p_scenario_id;
  update public.renewal_commercial_decisions
  set preferred_scenario_id = p_scenario_id,
      estimated_financial_effect = v_scenario.estimated_savings,
      currency = v_scenario.currency,
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id and id = p_decision_id;
  return p_scenario_id;
end;
$$;

revoke all on function public.select_renewal_decision_scenario(uuid, uuid, uuid) from public, anon;
grant execute on function public.select_renewal_decision_scenario(uuid, uuid, uuid) to authenticated;

create or replace function public.record_renewal_decision_outcome(
  p_organization_id uuid,
  p_decision_id uuid,
  p_original_cost numeric,
  p_final_agreed_cost numeric,
  p_seats_before integer,
  p_seats_after integer,
  p_contract_term_months integer,
  p_estimated_savings numeric,
  p_realized_savings numeric,
  p_avoided_cost_increase numeric,
  p_currency text,
  p_decision_date date,
  p_renewal_completed_at timestamptz,
  p_evidence_refs jsonb
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_decision public.renewal_commercial_decisions%rowtype;
  v_outcome_id uuid;
  v_evidence_count integer;
begin
  if not public.is_renewal_workspace_reviewer(p_organization_id) then
    raise exception 'Insufficient renewal workspace role' using errcode = '42501';
  end if;
  select * into v_decision from public.renewal_commercial_decisions d
  where d.id = p_decision_id and d.organization_id = p_organization_id for update;
  if v_decision.id is null then raise exception 'Renewal decision not found' using errcode = '42501'; end if;
  if v_decision.decision_status not in ('approved', 'finalized', 'decision_recorded') then
    raise exception 'Approved decision required before outcome confirmation' using errcode = '22023';
  end if;
  if v_decision.approved_version is null or v_decision.approved_version <> v_decision.decision_version then
    raise exception 'Decision version requires reapproval' using errcode = '40001';
  end if;
  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Outcome currency must be three uppercase letters' using errcode = '22023';
  end if;
  if coalesce(p_original_cost, 0) < 0 or coalesce(p_final_agreed_cost, 0) < 0
    or coalesce(p_estimated_savings, 0) < 0 or coalesce(p_realized_savings, 0) < 0
    or coalesce(p_avoided_cost_increase, 0) < 0 then
    raise exception 'Outcome amounts must be non-negative' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_evidence_refs, '[]'::jsonb)) = 0 then
    raise exception 'Outcome evidence is required' using errcode = '22023';
  end if;
  v_evidence_count := jsonb_array_length(p_evidence_refs);
  insert into public.renewal_decision_outcomes (
    organization_id, contract_id, decision_id, decision_version, selected_decision_type,
    original_cost, final_agreed_cost, seats_before, seats_after, contract_term_months,
    estimated_savings, realized_savings, avoided_cost_increase, currency, decision_date,
    renewal_completed_at, evidence_refs, evidence_completeness, confirmed_by_user_id
  ) values (
    p_organization_id, v_decision.contract_id, p_decision_id, v_decision.decision_version, v_decision.decision_type,
    p_original_cost, p_final_agreed_cost, p_seats_before, p_seats_after, p_contract_term_months,
    p_estimated_savings, p_realized_savings, p_avoided_cost_increase, p_currency, p_decision_date,
    p_renewal_completed_at, p_evidence_refs, case when v_evidence_count > 0 then 1 else 0 end, auth.uid()
  ) returning id into v_outcome_id;
  update public.renewal_commercial_decisions
  set decision_status = 'outcome_confirmed', final_outcome = decision_type,
      realized_savings_amount = p_realized_savings, outcome_confirmed_at = timezone('utc', now()),
      finalized_at = coalesce(finalized_at, timezone('utc', now())), updated_at = timezone('utc', now())
  where organization_id = p_organization_id and id = p_decision_id;
  return v_outcome_id;
exception when unique_violation then
  raise exception 'Renewal outcome already confirmed' using errcode = '23505';
end;
$$;

revoke all on function public.record_renewal_decision_outcome(uuid, uuid, numeric, numeric, integer, integer, integer, numeric, numeric, numeric, text, date, timestamptz, jsonb) from public, anon;
grant execute on function public.record_renewal_decision_outcome(uuid, uuid, numeric, numeric, integer, integer, integer, numeric, numeric, numeric, text, date, timestamptz, jsonb) to authenticated;

comment on table public.renewal_decision_scenarios is 'Evidence-linked financial scenarios. Currencies remain separate unless an explicit exchange-rate source is recorded.';
comment on table public.renewal_workspace_tasks is 'Internal renewal action plan tasks; no vendor delivery semantics.';
comment on table public.renewal_decision_outcomes is 'Confirmed customer outcomes. Estimated and realized savings remain separate.';
comment on column public.vendor_communication_drafts.unsent is 'Permanent product boundary: NoticeControl does not deliver vendor communication drafts.';
