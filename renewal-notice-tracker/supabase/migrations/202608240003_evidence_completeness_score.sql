-- Deterministic Evidence Completeness Score. Additive and forward-only.
-- Score records contain bounded provenance only, never raw contract, quote, OCR,
-- provider, token, or customer-note content.

create table if not exists public.evidence_readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_profile text not null check (decision_profile in (
    'renewal_triage', 'renew_unchanged', 'reduce_seats', 'renegotiate',
    'consolidate', 'terminate', 'replace_vendor'
  )),
  score numeric not null check (score >= 0 and score <= 100),
  readiness_state text not null check (readiness_state in (
    'blocked', 'incomplete', 'review_required', 'decision_ready'
  )),
  calculation_version text not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  critical_blocker_count integer not null default 0 check (critical_blocker_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  stale_count integer not null default 0 check (stale_count >= 0),
  conflicting_count integer not null default 0 check (conflicting_count >= 0),
  next_recommended_action text not null check (char_length(next_recommended_action) between 1 and 300),
  calculated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contract_id, decision_profile)
);

create table if not exists public.evidence_readiness_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.evidence_readiness_assessments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  requirement_key text not null check (requirement_key ~ '^[a-z0-9_]+$'),
  label text not null check (char_length(label) between 1 and 160),
  category text not null check (category in (
    'contract_identity', 'renewal_timing', 'financial', 'usage_optimization',
    'ownership', 'renewal_quote', 'decision_approval'
  )),
  state text not null check (state in (
    'verified', 'present_unreviewed', 'missing', 'stale', 'conflicting',
    'insufficient', 'not_applicable'
  )),
  weight numeric not null check (weight >= 0 and weight <= 100),
  earned_weight numeric not null check (earned_weight >= 0 and earned_weight <= weight),
  is_critical boolean not null default false,
  evidence_source text check (
    evidence_source is null or evidence_source in (
      'contract_file', 'contract_citation', 'reviewed_contract_metadata',
      'provider_usage_snapshot', 'usage_row', 'product_contract_match',
      'subscription_finding', 'quote_file', 'quote_citation',
      'customer_confirmation', 'approval_record'
    )
  ),
  source_record_id text check (source_record_id is null or char_length(source_record_id) <= 160),
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  freshness_date timestamptz,
  explanation text not null check (char_length(explanation) between 1 and 300),
  recommended_action text not null check (char_length(recommended_action) between 1 and 300),
  calculation_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (assessment_id, requirement_key)
);

create table if not exists public.evidence_readiness_history (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.evidence_readiness_assessments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_profile text not null,
  score numeric not null check (score >= 0 and score <= 100),
  readiness_state text not null,
  calculation_version text not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  critical_blocker_count integer not null default 0,
  missing_count integer not null default 0,
  stale_count integer not null default 0,
  conflicting_count integer not null default 0,
  changed_requirement_keys text[] not null default '{}',
  item_snapshot jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists evidence_readiness_assessments_org_state_idx
  on public.evidence_readiness_assessments(organization_id, readiness_state, score, calculated_at desc);
create index if not exists evidence_readiness_items_org_contract_state_idx
  on public.evidence_readiness_items(organization_id, contract_id, state, category);
create index if not exists evidence_readiness_history_assessment_created_idx
  on public.evidence_readiness_history(assessment_id, created_at desc);

alter table public.evidence_readiness_assessments enable row level security;
alter table public.evidence_readiness_items enable row level security;
alter table public.evidence_readiness_history enable row level security;

drop policy if exists "Organization members can read evidence readiness assessments" on public.evidence_readiness_assessments;
create policy "Organization members can read evidence readiness assessments"
  on public.evidence_readiness_assessments for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = evidence_readiness_assessments.organization_id
      and m.user_id = auth.uid()
  ));

drop policy if exists "Organization members can read evidence readiness items" on public.evidence_readiness_items;
create policy "Organization members can read evidence readiness items"
  on public.evidence_readiness_items for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = evidence_readiness_items.organization_id
      and m.user_id = auth.uid()
  ));

drop policy if exists "Organization members can read evidence readiness history" on public.evidence_readiness_history;
create policy "Organization members can read evidence readiness history"
  on public.evidence_readiness_history for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = evidence_readiness_history.organization_id
      and m.user_id = auth.uid()
  ));

revoke insert, update, delete on public.evidence_readiness_assessments from public, anon, authenticated;
revoke insert, update, delete on public.evidence_readiness_items from public, anon, authenticated;
revoke insert, update, delete on public.evidence_readiness_history from public, anon, authenticated;

create or replace function public.enforce_evidence_readiness_tenant_coherence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_contract_org uuid;
  v_assessment record;
begin
  select organization_id into v_contract_org from public.contracts where id = new.contract_id;
  if v_contract_org is null or v_contract_org <> new.organization_id then
    raise exception 'evidence readiness contract organization mismatch';
  end if;

  if tg_table_name in ('evidence_readiness_items', 'evidence_readiness_history') then
    select organization_id, contract_id into v_assessment
    from public.evidence_readiness_assessments where id = new.assessment_id;
    if v_assessment.organization_id is null
       or v_assessment.organization_id <> new.organization_id
       or v_assessment.contract_id <> new.contract_id then
      raise exception 'evidence readiness assessment scope mismatch';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_readiness_assessment_scope on public.evidence_readiness_assessments;
create trigger evidence_readiness_assessment_scope
before insert or update on public.evidence_readiness_assessments
for each row execute function public.enforce_evidence_readiness_tenant_coherence();

drop trigger if exists evidence_readiness_item_scope on public.evidence_readiness_items;
create trigger evidence_readiness_item_scope
before insert or update on public.evidence_readiness_items
for each row execute function public.enforce_evidence_readiness_tenant_coherence();

drop trigger if exists evidence_readiness_history_scope on public.evidence_readiness_history;
create trigger evidence_readiness_history_scope
before insert or update on public.evidence_readiness_history
for each row execute function public.enforce_evidence_readiness_tenant_coherence();

create or replace function public.persist_evidence_readiness_assessment(
  p_organization_id uuid,
  p_contract_id uuid,
  p_decision_profile text,
  p_score numeric,
  p_readiness_state text,
  p_calculation_version text,
  p_evidence_hash text,
  p_next_recommended_action text,
  p_calculated_at timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assessment public.evidence_readiness_assessments%rowtype;
  v_history_id uuid;
  v_item jsonb;
  v_changed_keys text[] := '{}';
  v_item_snapshot jsonb;
  v_critical_count integer;
  v_missing_count integer;
  v_stale_count integer;
  v_conflicting_count integer;
begin
  if p_decision_profile not in ('renewal_triage', 'renew_unchanged', 'reduce_seats', 'renegotiate', 'consolidate', 'terminate', 'replace_vendor')
     or p_readiness_state not in ('blocked', 'incomplete', 'review_required', 'decision_ready')
     or p_score < 0 or p_score > 100
     or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50
     or char_length(p_next_recommended_action) not between 1 and 300 then
    raise exception 'invalid evidence readiness assessment';
  end if;

  if not exists (
    select 1 from public.contracts c
    where c.id = p_contract_id and c.organization_id = p_organization_id
  ) then
    raise exception 'contract not found in organization';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_contract_id::text || ':' || p_decision_profile,
    0
  ));

  select * into v_assessment
  from public.evidence_readiness_assessments
  where organization_id = p_organization_id
    and contract_id = p_contract_id
    and decision_profile = p_decision_profile
  for update;

  if v_assessment.id is not null and v_assessment.evidence_hash = p_evidence_hash then
    return jsonb_build_object('assessmentId', v_assessment.id, 'changed', false, 'historyId', null);
  end if;

  select count(*) filter (where (item->>'isCritical')::boolean and item->>'state' in ('missing', 'stale', 'conflicting', 'insufficient')),
         count(*) filter (where item->>'state' = 'missing'),
         count(*) filter (where item->>'state' = 'stale'),
         count(*) filter (where item->>'state' = 'conflicting')
  into v_critical_count, v_missing_count, v_stale_count, v_conflicting_count
  from jsonb_array_elements(p_items) item;

  if v_assessment.id is null then
    insert into public.evidence_readiness_assessments (
      organization_id, contract_id, decision_profile, score, readiness_state,
      calculation_version, evidence_hash, critical_blocker_count, missing_count,
      stale_count, conflicting_count, next_recommended_action, calculated_at
    ) values (
      p_organization_id, p_contract_id, p_decision_profile, p_score, p_readiness_state,
      p_calculation_version, p_evidence_hash, v_critical_count, v_missing_count,
      v_stale_count, v_conflicting_count, p_next_recommended_action, p_calculated_at
    ) returning * into v_assessment;
    select array_agg(item->>'requirementKey' order by item->>'requirementKey') into v_changed_keys
    from jsonb_array_elements(p_items) item;
  else
    select coalesce(array_agg(key order by key), '{}') into v_changed_keys
    from (
      select coalesce(old_item.requirement_key, new_item->>'requirementKey') as key
      from public.evidence_readiness_items old_item
      full join jsonb_array_elements(p_items) new_item
        on old_item.assessment_id = v_assessment.id
       and old_item.requirement_key = new_item->>'requirementKey'
      where (old_item.assessment_id = v_assessment.id or old_item.assessment_id is null)
        and (
          old_item.requirement_key is null
          or new_item is null
          or old_item.state is distinct from new_item->>'state'
          or old_item.source_record_id is distinct from new_item->>'sourceRecordId'
          or old_item.freshness_date::text is distinct from new_item->>'freshnessDate'
        )
    ) changes;

    update public.evidence_readiness_assessments set
      score = p_score, readiness_state = p_readiness_state,
      calculation_version = p_calculation_version, evidence_hash = p_evidence_hash,
      critical_blocker_count = v_critical_count, missing_count = v_missing_count,
      stale_count = v_stale_count, conflicting_count = v_conflicting_count,
      next_recommended_action = p_next_recommended_action,
      calculated_at = p_calculated_at, updated_at = timezone('utc', now())
    where id = v_assessment.id returning * into v_assessment;

    delete from public.evidence_readiness_items where assessment_id = v_assessment.id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if v_item->>'state' not in ('verified', 'present_unreviewed', 'missing', 'stale', 'conflicting', 'insufficient', 'not_applicable')
       or char_length(coalesce(v_item->>'explanation', '')) not between 1 and 300
       or char_length(coalesce(v_item->>'recommendedAction', '')) not between 1 and 300 then
      raise exception 'invalid evidence readiness item';
    end if;
    insert into public.evidence_readiness_items (
      assessment_id, organization_id, contract_id, requirement_key, label, category,
      state, weight, earned_weight, is_critical, evidence_source, source_record_id,
      verified_by_user_id, verified_at, freshness_date, explanation,
      recommended_action, calculation_version
    ) values (
      v_assessment.id, p_organization_id, p_contract_id,
      v_item->>'requirementKey', v_item->>'label', v_item->>'category',
      v_item->>'state', (v_item->>'weight')::numeric, (v_item->>'earnedWeight')::numeric,
      (v_item->>'isCritical')::boolean, nullif(v_item->>'evidenceSource', ''),
      nullif(v_item->>'sourceRecordId', ''), nullif(v_item->>'verifiedBy', '')::uuid,
      nullif(v_item->>'verifiedAt', '')::timestamptz,
      nullif(v_item->>'freshnessDate', '')::timestamptz,
      v_item->>'explanation', v_item->>'recommendedAction', p_calculation_version
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'requirementKey', requirement_key,
    'label', label,
    'category', category,
    'state', state,
    'weight', weight,
    'earnedWeight', earned_weight,
    'isCritical', is_critical,
    'evidenceSource', evidence_source,
    'sourceRecordId', source_record_id,
    'verifiedBy', verified_by_user_id,
    'verifiedAt', verified_at,
    'freshnessDate', freshness_date,
    'explanation', explanation,
    'recommendedAction', recommended_action,
    'calculationVersion', calculation_version
  ) order by requirement_key), '[]'::jsonb)
  into v_item_snapshot
  from public.evidence_readiness_items
  where assessment_id = v_assessment.id;

  insert into public.evidence_readiness_history (
    assessment_id, organization_id, contract_id, decision_profile, score,
    readiness_state, calculation_version, evidence_hash, critical_blocker_count,
    missing_count, stale_count, conflicting_count, changed_requirement_keys,
    item_snapshot, calculated_at
  ) values (
    v_assessment.id, p_organization_id, p_contract_id, p_decision_profile, p_score,
    p_readiness_state, p_calculation_version, p_evidence_hash, v_critical_count,
    v_missing_count, v_stale_count, v_conflicting_count, coalesce(v_changed_keys, '{}'),
    v_item_snapshot, p_calculated_at
  ) returning id into v_history_id;

  return jsonb_build_object('assessmentId', v_assessment.id, 'changed', true, 'historyId', v_history_id);
end;
$$;

revoke all on function public.persist_evidence_readiness_assessment(uuid, uuid, text, numeric, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.persist_evidence_readiness_assessment(uuid, uuid, text, numeric, text, text, text, text, timestamptz, jsonb) to service_role;

comment on table public.evidence_readiness_assessments is
  'Current deterministic evidence completeness assessment. This score is not legal advice or a decision guarantee.';
comment on table public.evidence_readiness_history is
  'Changed evidence readiness snapshots only. Identical recalculation is idempotent.';
