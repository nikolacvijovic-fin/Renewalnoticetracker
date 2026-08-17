-- Stabilize subscription usage finding identity, disconnect cleanup, retries, and consent retention.
-- Forward-only: existing snapshots, findings, and review decisions remain immutable history.

alter table public.license_waste_opportunities
  add column if not exists material_evidence_hash text,
  add column if not exists provenance_hash text,
  add column if not exists revision_reason text,
  add column if not exists requires_new_review boolean not null default false,
  add column if not exists previous_review_status text,
  add column if not exists resolution_reason text,
  add column if not exists resolved_by_user_id uuid references auth.users (id) on delete set null;

update public.license_waste_opportunities
set material_evidence_hash = coalesce(material_evidence_hash, evidence_hash),
    provenance_hash = coalesce(provenance_hash, evidence_hash),
    revision_reason = coalesce(revision_reason, 'legacy_import')
where material_evidence_hash is null or provenance_hash is null or revision_reason is null;

create index if not exists license_waste_active_material_identity_idx
  on public.license_waste_opportunities (
    organization_id, scope_family_key, logical_opportunity_key, material_evidence_hash
  ) where superseded_at is null;

with ranked_active as (
  select id, row_number() over (
    partition by organization_id, scope_family_key, logical_opportunity_key
    order by revision_number desc, created_at desc, id desc
  ) as active_rank
  from public.license_waste_opportunities
  where superseded_at is null and resolved_at is null
    and scope_family_key is not null and logical_opportunity_key is not null
)
update public.license_waste_opportunities o
set superseded_at = timezone('utc', now()),
    resolution_reason = coalesce(o.resolution_reason, 'duplicate_identity_repair')
from ranked_active r
where o.id = r.id and r.active_rank > 1;

create unique index if not exists license_waste_one_active_logical_opportunity_idx
  on public.license_waste_opportunities (organization_id, scope_family_key, logical_opportunity_key)
  where superseded_at is null and resolved_at is null
    and scope_family_key is not null and logical_opportunity_key is not null;

create index if not exists license_waste_active_provider_connection_idx
  on public.license_waste_opportunities (organization_id, provider_connection_id)
  where superseded_at is null and resolved_at is null;

alter table public.usage_import_rows
  add column if not exists warning_codes text[] not null default '{}',
  add column if not exists evidence_state text not null default 'complete'
    check (evidence_state in ('complete', 'partial', 'missing', 'stale', 'unmapped', 'conflicting'));

create or replace function public.apply_subscription_usage_row_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(new.normalized_payload->'warningCodes') = 'array' then
    new.warning_codes := coalesce(array(
      select item.value from jsonb_array_elements_text(new.normalized_payload->'warningCodes') as item(value)
      where length(item.value) between 1 and 120
      limit 25
    ), '{}');
  end if;
  if new.normalized_payload->>'evidenceState' in ('complete', 'partial', 'missing', 'stale', 'unmapped', 'conflicting') then
    new.evidence_state := new.normalized_payload->>'evidenceState';
  end if;
  return new;
end;
$$;

drop trigger if exists usage_import_rows_apply_evidence on public.usage_import_rows;
create trigger usage_import_rows_apply_evidence
before insert or update of normalized_payload on public.usage_import_rows
for each row execute function public.apply_subscription_usage_row_evidence();

alter table public.subscription_usage_sync_runs
  add column if not exists logical_interval_key text,
  add column if not exists attempt_number integer not null default 1 check (attempt_number between 1 and 3),
  add column if not exists previous_attempt_id uuid references public.subscription_usage_sync_runs (id) on delete set null,
  add column if not exists retry_after timestamptz;

update public.subscription_usage_sync_runs
set logical_interval_key = coalesce(logical_interval_key, idempotency_key)
where logical_interval_key is null;

create unique index if not exists subscription_usage_sync_attempt_identity_idx
  on public.subscription_usage_sync_runs (
    organization_id, provider_connection_id, logical_interval_key, attempt_number
  ) where logical_interval_key is not null;

create index if not exists subscription_usage_sync_retry_idx
  on public.subscription_usage_sync_runs (retry_after)
  where status = 'failed' and retry_after is not null;

create index if not exists subscription_usage_consent_cleanup_idx
  on public.subscription_usage_consent_attempts (status, consumed_at, expires_at);

create or replace function public.begin_manual_subscription_usage_sync_attempt(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_logical_interval_key text,
  p_retry_failed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.subscription_usage_sync_runs%rowtype;
  v_attempt integer := 1;
  v_run_id uuid;
  v_attempt_key text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;
  if coalesce(p_logical_interval_key, '') = '' then
    raise exception 'Logical synchronization interval is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.subscription_usage_provider_connections c
    where c.id = p_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
      and c.status = 'connected'
    for update
  ) then
    raise exception 'Connected provider was not found' using errcode = '42501';
  end if;

  select * into v_existing
  from public.subscription_usage_sync_runs r
  where r.organization_id = p_organization_id
    and r.provider_connection_id = p_connection_id
    and r.logical_interval_key = p_logical_interval_key
  order by r.attempt_number desc
  limit 1
  for update;

  if v_existing.id is not null and v_existing.status in ('processing', 'completed', 'partial') then
    return jsonb_build_object(
      'id', v_existing.id, 'status', v_existing.status,
      'attemptNumber', v_existing.attempt_number, 'idempotencyKey', v_existing.idempotency_key,
      'logicalIntervalKey', p_logical_interval_key, 'isNew', false,
      'usageImportBatchId', v_existing.usage_import_batch_id,
      'lastErrorCode', v_existing.last_error_code
    );
  end if;

  if v_existing.id is not null then
    if not p_retry_failed then
      return jsonb_build_object(
        'id', v_existing.id, 'status', v_existing.status,
        'attemptNumber', v_existing.attempt_number, 'idempotencyKey', v_existing.idempotency_key,
        'logicalIntervalKey', p_logical_interval_key, 'isNew', false,
        'usageImportBatchId', v_existing.usage_import_batch_id,
        'lastErrorCode', v_existing.last_error_code
      );
    end if;
    if v_existing.attempt_number >= 3 then
      raise exception 'Manual synchronization retry limit reached' using errcode = '22023';
    end if;
    if v_existing.retry_after is not null and v_existing.retry_after > timezone('utc', now()) then
      raise exception 'Manual synchronization retry is not ready' using errcode = '55000';
    end if;
    v_attempt := v_existing.attempt_number + 1;
  end if;

  v_attempt_key := encode(digest(p_logical_interval_key || ':attempt:' || v_attempt::text, 'sha256'), 'hex');
  insert into public.subscription_usage_sync_runs (
    organization_id, provider_connection_id, provider, status, idempotency_key,
    logical_interval_key, attempt_number, previous_attempt_id, started_at, metadata
  ) values (
    p_organization_id, p_connection_id, p_provider, 'processing', v_attempt_key,
    p_logical_interval_key, v_attempt, v_existing.id, timezone('utc', now()),
    jsonb_build_object('source', 'manual_sync_now')
  ) returning id into v_run_id;

  return jsonb_build_object(
    'id', v_run_id, 'status', 'processing', 'attemptNumber', v_attempt,
    'idempotencyKey', v_attempt_key, 'logicalIntervalKey', p_logical_interval_key,
    'isNew', true, 'usageImportBatchId', null, 'lastErrorCode', null
  );
end;
$$;

revoke all on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  to authenticated;

create or replace function public.disconnect_subscription_usage_provider(
  p_organization_id uuid,
  p_connection_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider text;
  v_resolved integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  select c.provider into v_provider
  from public.subscription_usage_provider_connections c
  where c.id = p_connection_id and c.organization_id = p_organization_id
  for update;
  if v_provider is null then
    raise exception 'Provider connection not found' using errcode = '42501';
  end if;

  delete from public.subscription_usage_provider_credentials
  where organization_id = p_organization_id and provider_connection_id = p_connection_id;

  update public.subscription_usage_provider_connections
  set status = 'disconnected', disconnected_at = timezone('utc', now()),
      next_scheduled_sync_at = null, sync_claim_token = null,
      sync_claimed_at = null, sync_claim_expires_at = null,
      updated_at = timezone('utc', now())
  where id = p_connection_id and organization_id = p_organization_id;

  update public.license_waste_opportunities o
  set resolved_at = timezone('utc', now()),
      resolution_reason = 'provider_disconnected',
      resolved_by_user_id = auth.uid()
  where o.organization_id = p_organization_id
    and o.resolved_at is null
    and o.superseded_at is null
    and (
      o.provider_connection_id = p_connection_id
      or exists (
        select 1
        from public.subscription_usage_analysis_scopes s
        join public.usage_import_batches b on b.id = any(s.snapshot_batch_ids)
        where s.id = o.analysis_scope_id
          and s.organization_id = p_organization_id
          and b.organization_id = p_organization_id
          and b.provider_connection_id = p_connection_id
      )
    );
  get diagnostics v_resolved = row_count;
  return v_resolved;
end;
$$;

revoke all on function public.disconnect_subscription_usage_provider(uuid, uuid) from public, anon;
grant execute on function public.disconnect_subscription_usage_provider(uuid, uuid) to authenticated;

create or replace function public.cleanup_subscription_usage_consent_attempts(
  p_consumed_retention_days integer default 30,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service authority required' using errcode = '42501';
  end if;
  with doomed as (
    select id from public.subscription_usage_consent_attempts
    where (status = 'pending' and expires_at <= timezone('utc', now()))
       or (status in ('consumed', 'expired', 'failed') and coalesce(consumed_at, expires_at, created_at)
           <= timezone('utc', now()) - make_interval(days => greatest(p_consumed_retention_days, 1)))
    order by expires_at asc
    limit least(greatest(p_limit, 1), 2000)
    for update skip locked
  )
  delete from public.subscription_usage_consent_attempts a
  using doomed d where a.id = d.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cleanup_subscription_usage_consent_attempts(integer, integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_subscription_usage_consent_attempts(integer, integer)
  to service_role;

comment on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean) is
  'Creates at most three manual attempts per logical UTC-day interval; returns active/completed attempts idempotently.';
comment on function public.disconnect_subscription_usage_provider(uuid, uuid) is
  'Atomically disconnects a provider, deletes its stored credential, and resolves only findings whose immutable scope involved that connection.';
comment on function public.cleanup_subscription_usage_consent_attempts(integer, integer) is
  'Service-only bounded cleanup for expired and retained terminal Microsoft consent attempts.';
comment on function public.apply_subscription_usage_row_evidence() is
  'Copies bounded row-specific warning evidence from the normalized safe payload into queryable columns.';

create or replace function public.persist_subscription_usage_analysis_findings(
  p_organization_id uuid,
  p_analysis_scope_id uuid,
  p_batch_id uuid,
  p_provider text,
  p_provider_connection_id uuid,
  p_sync_run_id uuid,
  p_findings jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope public.subscription_usage_analysis_scopes%rowtype;
  v_f jsonb;
  v_previous public.license_waste_opportunities%rowtype;
  v_finding_id uuid;
  v_seen_keys text[] := '{}';
  v_material_hash text;
  v_provenance_hash text;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  select * into v_scope
  from public.subscription_usage_analysis_scopes s
  where s.id = p_analysis_scope_id and s.organization_id = p_organization_id
  for update;
  if v_scope.id is null or not (p_batch_id = any(v_scope.snapshot_batch_ids)) then
    raise exception 'Analysis scope mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.usage_import_batches b
    where b.id = p_batch_id
      and b.organization_id = p_organization_id
      and coalesce(b.provider, 'manual_csv') = p_provider
  ) then
    raise exception 'Provider batch mismatch' using errcode = '42501';
  end if;
  if p_provider_connection_id is not null and not exists (
    select 1 from public.subscription_usage_provider_connections c
    where c.id = p_provider_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
  ) then
    raise exception 'Provider connection mismatch' using errcode = '42501';
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
  loop
    v_material_hash := coalesce(nullif(v_f->>'material_evidence_hash', ''), nullif(v_f->>'evidence_hash', ''));
    v_provenance_hash := coalesce(nullif(v_f->>'provenance_hash', ''), v_material_hash);
    if coalesce(v_f->>'logical_opportunity_key', '') = '' or v_material_hash is null then
      raise exception 'Finding identity is required' using errcode = '22023';
    end if;
    v_seen_keys := array_append(v_seen_keys, v_f->>'logical_opportunity_key');

    -- Serialize first-detection and revision decisions for one logical opportunity.
    perform pg_advisory_xact_lock(hashtextextended(
      p_organization_id::text || ':' || v_scope.scope_family_key || ':' || (v_f->>'logical_opportunity_key'),
      0
    ));

    v_previous := null;
    select * into v_previous
    from public.license_waste_opportunities o
    where o.organization_id = p_organization_id
      and o.scope_family_key = v_scope.scope_family_key
      and o.logical_opportunity_key = v_f->>'logical_opportunity_key'
      and o.superseded_at is null
      and o.resolved_at is null
    order by o.revision_number desc, o.created_at desc
    limit 1
    for update;

    if v_previous.id is not null and v_previous.material_evidence_hash = v_material_hash then
      -- A changed batch, row id, or scope is provenance, not a new business decision.
      v_finding_id := v_previous.id;
    else
      if v_previous.id is not null then
        update public.license_waste_opportunities
        set superseded_at = timezone('utc', now()),
            superseded_by_sync_run_id = p_sync_run_id
        where id = v_previous.id and organization_id = p_organization_id;
      end if;

      insert into public.license_waste_opportunities (
        organization_id, contract_id, usage_batch_id, provider, provider_connection_id,
        sync_run_id, finding_fingerprint, finding_type, reason_code, calculation_version,
        usage_row_ids, matched_contract_ids, utilization, unused_seats, confidence,
        warnings, estimated_savings, currency, recommended_action, capability_category,
        taxonomy_version, involved_providers, involved_products, estimated_savings_min,
        estimated_savings_max, evidence, review_status, analysis_scope_id,
        scope_family_key, logical_opportunity_key, evidence_hash, material_evidence_hash,
        provenance_hash, revision_of_id, revision_number, revision_reason,
        requires_new_review, previous_review_status
      ) values (
        p_organization_id,
        nullif(v_f->>'contract_id', '')::uuid,
        p_batch_id,
        p_provider,
        p_provider_connection_id,
        p_sync_run_id,
        v_f->>'finding_fingerprint',
        v_f->>'finding_type',
        v_f->>'reason_code',
        v_f->>'calculation_version',
        coalesce(array(select jsonb_array_elements_text(v_f->'usage_row_ids')), '{}'),
        coalesce(array(select jsonb_array_elements_text(v_f->'matched_contract_ids'))::uuid[], '{}'),
        nullif(v_f->>'utilization', '')::numeric,
        nullif(v_f->>'unused_seats', '')::numeric,
        (v_f->>'confidence')::numeric,
        coalesce(array(select jsonb_array_elements_text(v_f->'warnings')), '{}'),
        nullif(v_f->>'estimated_savings', '')::numeric,
        nullif(v_f->>'currency', ''),
        v_f->>'recommended_action',
        nullif(v_f->>'capability_category', ''),
        nullif(v_f->>'taxonomy_version', ''),
        coalesce(array(select jsonb_array_elements_text(v_f->'involved_providers')), '{}'),
        coalesce(array(select jsonb_array_elements_text(v_f->'involved_products')), '{}'),
        nullif(v_f->>'estimated_savings_min', '')::numeric,
        nullif(v_f->>'estimated_savings_max', '')::numeric,
        coalesce(v_f->'evidence', '{}'::jsonb),
        'open',
        p_analysis_scope_id,
        v_scope.scope_family_key,
        v_f->>'logical_opportunity_key',
        v_material_hash,
        v_material_hash,
        v_provenance_hash,
        v_previous.id,
        coalesce(v_previous.revision_number, 0) + 1,
        case when v_previous.id is null then 'initial_detection' else 'material_evidence_changed' end,
        v_previous.id is not null,
        v_previous.review_status
      ) returning id into v_finding_id;

    end if;

    insert into public.subscription_usage_analysis_findings (
      organization_id, analysis_scope_id, finding_id
    ) values (p_organization_id, p_analysis_scope_id, v_finding_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  update public.license_waste_opportunities o
  set superseded_at = timezone('utc', now()),
      superseded_by_sync_run_id = p_sync_run_id,
      resolved_at = timezone('utc', now()),
      resolution_reason = 'absent_from_current_scope'
  where o.organization_id = p_organization_id
    and o.scope_family_key = v_scope.scope_family_key
    and o.superseded_at is null
    and o.resolved_at is null
    and not (o.logical_opportunity_key = any(v_seen_keys));

  return v_count;
end;
$$;

revoke all on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) is
  'Reuses findings for provenance-only changes and creates review-required revisions only when material decision evidence changes.';
