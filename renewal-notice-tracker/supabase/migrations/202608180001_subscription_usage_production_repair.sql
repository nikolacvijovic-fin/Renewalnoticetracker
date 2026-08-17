-- Production-readiness repair for subscription usage providers.
-- Forward-only: preserves existing snapshots, findings, and review history.

alter table public.subscription_usage_provider_connections
  drop constraint if exists subscription_usage_provider_connections_status_check;

alter table public.subscription_usage_provider_connections
  add constraint subscription_usage_provider_connections_status_check
    check (status in (
      'pending_admin_consent', 'connected', 'permission_error', 'expired_credential',
      'revoked_access', 'tenant_mismatch', 'verification_failed',
      'provider_unavailable', 'disconnected'
    )),
  add column if not exists requested_permissions text[] not null default '{}',
  add column if not exists verified_permissions text[] not null default '{}',
  add column if not exists last_verified_at timestamptz,
  add column if not exists sync_claim_token uuid,
  add column if not exists sync_claimed_at timestamptz,
  add column if not exists sync_claim_expires_at timestamptz;

create index if not exists subscription_usage_connections_due_claim_idx
  on public.subscription_usage_provider_connections (next_scheduled_sync_at, sync_claim_expires_at)
  where status = 'connected' and next_scheduled_sync_at is not null;

create table if not exists public.subscription_usage_consent_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('microsoft_365')),
  nonce_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'consumed', 'expired', 'failed')),
  requested_permissions text[] not null default '{}',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.subscription_usage_consent_attempts enable row level security;
revoke all on table public.subscription_usage_consent_attempts from public, anon, authenticated;

create index if not exists subscription_usage_consent_attempts_expiry_idx
  on public.subscription_usage_consent_attempts (expires_at)
  where status = 'pending';

create or replace function public.create_subscription_usage_consent_attempt(
  p_organization_id uuid,
  p_provider text,
  p_nonce_hash text,
  p_requested_permissions text[],
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_provider <> 'microsoft_365' or p_expires_at <= timezone('utc', now()) then
    raise exception 'Invalid consent attempt' using errcode = '22023';
  end if;
  if coalesce(p_requested_permissions, '{}') <> array['LicenseAssignment.Read.All', 'Reports.Read.All']::text[] then
    raise exception 'Invalid Microsoft permission request' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  insert into public.subscription_usage_consent_attempts (
    organization_id, actor_user_id, provider, nonce_hash, requested_permissions, expires_at
  ) values (
    p_organization_id, auth.uid(), p_provider, p_nonce_hash,
    coalesce(p_requested_permissions, '{}'), p_expires_at
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.consume_subscription_usage_consent_attempt(
  p_organization_id uuid,
  p_provider text,
  p_nonce_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  update public.subscription_usage_consent_attempts
  set status = 'consumed', consumed_at = timezone('utc', now())
  where organization_id = p_organization_id
    and actor_user_id = auth.uid()
    and provider = p_provider
    and nonce_hash = p_nonce_hash
    and status = 'pending'
    and expires_at > timezone('utc', now())
  returning id into v_id;

  if v_id is null then
    raise exception 'Consent attempt is invalid, expired, or already consumed' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_subscription_usage_consent_attempt(uuid, text, text, text[], timestamptz) from public, anon;
revoke all on function public.consume_subscription_usage_consent_attempt(uuid, text, text) from public, anon;
grant execute on function public.create_subscription_usage_consent_attempt(uuid, text, text, text[], timestamptz) to authenticated;
grant execute on function public.consume_subscription_usage_consent_attempt(uuid, text, text) to authenticated;

create table if not exists public.subscription_usage_analysis_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope_key text not null,
  scope_family_key text not null,
  current_batch_id uuid not null references public.usage_import_batches (id) on delete restrict,
  snapshot_batch_ids uuid[] not null,
  provider_set text[] not null,
  calculation_version text not null,
  include_manual_imports boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, scope_key)
);

alter table public.subscription_usage_analysis_scopes enable row level security;

create policy "members can read subscription usage analysis scopes"
on public.subscription_usage_analysis_scopes for select
using (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_analysis_scopes.organization_id
    and m.user_id = auth.uid()
));

create policy "review roles can create subscription usage analysis scopes"
on public.subscription_usage_analysis_scopes for insert
with check (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_analysis_scopes.organization_id
    and m.user_id = auth.uid()
    and m.role in ('owner', 'admin', 'operator', 'reviewer')
));

create index if not exists subscription_usage_analysis_scopes_org_created_idx
  on public.subscription_usage_analysis_scopes (organization_id, created_at desc);

create or replace function public.create_subscription_usage_analysis_scope(
  p_organization_id uuid,
  p_current_batch_id uuid,
  p_include_manual_imports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_provider text;
  v_batch_ids uuid[];
  v_providers text[];
  v_scope_key text;
  v_family_key text;
  v_scope_id uuid;
  v_warning_codes text[];
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  select coalesce(b.provider, 'manual_csv') into v_current_provider
  from public.usage_import_batches b
  where b.id = p_current_batch_id and b.organization_id = p_organization_id;
  if v_current_provider is null then
    raise exception 'Usage batch not found in organization' using errcode = '42501';
  end if;

  if v_current_provider = 'manual_csv' then
    v_batch_ids := array[p_current_batch_id];
  else
    select array_agg(batch_id order by provider, batch_id)
    into v_batch_ids
    from (
      select v_current_provider as provider, p_current_batch_id as batch_id
      union all
      select distinct on (r.provider) r.provider, r.usage_import_batch_id
      from public.subscription_usage_sync_runs r
      join public.subscription_usage_provider_connections c
        on c.id = r.provider_connection_id
       and c.organization_id = p_organization_id
       and c.status = 'connected'
      where r.organization_id = p_organization_id
        and r.provider <> v_current_provider
        and r.provider in ('microsoft_365', 'google_workspace')
        and r.status in ('completed', 'partial')
        and r.usage_import_batch_id is not null
      order by r.provider, r.completed_at desc nulls last, r.id desc
    ) selected;
  end if;

  if p_include_manual_imports and v_current_provider <> 'manual_csv' then
    select array_agg(distinct batch_id order by batch_id)
    into v_batch_ids
    from unnest(v_batch_ids || coalesce((
      select array_agg(b.id)
      from public.usage_import_batches b
      where b.organization_id = p_organization_id
        and coalesce(b.provider, 'manual_csv') = 'manual_csv'
        and b.status in ('completed', 'partial')
    ), '{}')) as batch_id;
  end if;

  select array_agg(distinct coalesce(b.provider, 'manual_csv') order by coalesce(b.provider, 'manual_csv')),
         array_remove(array_agg(distinct warning order by warning), null)
  into v_providers, v_warning_codes
  from public.usage_import_batches b
  left join lateral jsonb_array_elements_text(coalesce(b.metadata->'warningCodes', '[]'::jsonb)) warning on true
  where b.organization_id = p_organization_id and b.id = any(v_batch_ids);

  v_scope_key := encode(digest(
    p_organization_id::text || ':' || array_to_string(v_batch_ids, ',') || ':subscription_usage_v2',
    'sha256'
  ), 'hex');
  v_family_key := encode(digest(
    p_organization_id::text || ':' || array_to_string(v_providers, ',') || ':' || p_include_manual_imports::text,
    'sha256'
  ), 'hex');

  insert into public.subscription_usage_analysis_scopes (
    organization_id, scope_key, scope_family_key, current_batch_id,
    snapshot_batch_ids, provider_set, calculation_version,
    include_manual_imports, created_by_user_id
  ) values (
    p_organization_id, v_scope_key, v_family_key, p_current_batch_id,
    v_batch_ids, v_providers, 'subscription_usage_v2',
    p_include_manual_imports, auth.uid()
  )
  on conflict (organization_id, scope_key) do update
    set scope_key = excluded.scope_key
  returning id into v_scope_id;

  return jsonb_build_object(
    'analysisScopeId', v_scope_id,
    'scopeKey', v_scope_key,
    'scopeFamilyKey', v_family_key,
    'batchIds', v_batch_ids,
    'providers', v_providers,
    'warningCodes', coalesce(v_warning_codes, '{}')
  );
end;
$$;

revoke all on function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean) to authenticated, service_role;

alter table public.license_waste_opportunities
  add column if not exists analysis_scope_id uuid references public.subscription_usage_analysis_scopes (id) on delete restrict,
  add column if not exists scope_family_key text,
  add column if not exists logical_opportunity_key text,
  add column if not exists evidence_hash text,
  add column if not exists revision_of_id uuid references public.license_waste_opportunities (id) on delete restrict,
  add column if not exists revision_number integer not null default 1 check (revision_number > 0),
  add column if not exists resolved_at timestamptz;

create index if not exists license_waste_opportunities_scope_active_idx
  on public.license_waste_opportunities (
    organization_id, scope_family_key, logical_opportunity_key, superseded_at
  );

create unique index if not exists license_waste_opportunities_scope_evidence_revision_idx
  on public.license_waste_opportunities (organization_id, analysis_scope_id, logical_opportunity_key, evidence_hash)
  where analysis_scope_id is not null and logical_opportunity_key is not null and evidence_hash is not null;

create table if not exists public.subscription_usage_analysis_findings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  analysis_scope_id uuid not null references public.subscription_usage_analysis_scopes (id) on delete cascade,
  finding_id uuid not null references public.license_waste_opportunities (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (analysis_scope_id, finding_id)
);

alter table public.subscription_usage_analysis_findings enable row level security;
create policy "members can read subscription usage analysis findings"
on public.subscription_usage_analysis_findings for select
using (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_analysis_findings.organization_id
    and m.user_id = auth.uid()
));

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
    select 1
    from public.usage_import_batches b
    where b.id = p_batch_id
      and b.organization_id = p_organization_id
      and coalesce(b.provider, 'manual_csv') = p_provider
  ) then
    raise exception 'Provider batch mismatch' using errcode = '42501';
  end if;
  if p_provider_connection_id is not null and not exists (
    select 1
    from public.subscription_usage_provider_connections c
    where c.id = p_provider_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
  ) then
    raise exception 'Provider connection mismatch' using errcode = '42501';
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
  loop
    if coalesce(v_f->>'logical_opportunity_key', '') = '' or coalesce(v_f->>'evidence_hash', '') = '' then
      raise exception 'Finding identity is required' using errcode = '22023';
    end if;
    v_seen_keys := array_append(v_seen_keys, v_f->>'logical_opportunity_key');

    select * into v_previous
    from public.license_waste_opportunities o
    where o.organization_id = p_organization_id
      and o.scope_family_key = v_scope.scope_family_key
      and o.logical_opportunity_key = v_f->>'logical_opportunity_key'
      and o.superseded_at is null
    order by o.revision_number desc, o.created_at desc
    limit 1
    for update;

    if v_previous.id is not null and v_previous.evidence_hash = v_f->>'evidence_hash' then
      v_finding_id := v_previous.id;
    else
      insert into public.license_waste_opportunities (
        organization_id, contract_id, usage_batch_id, provider, provider_connection_id,
        sync_run_id, finding_fingerprint, finding_type, reason_code, calculation_version,
        usage_row_ids, matched_contract_ids, utilization, unused_seats, confidence,
        warnings, estimated_savings, currency, recommended_action, capability_category,
        taxonomy_version, involved_providers, involved_products, estimated_savings_min,
        estimated_savings_max, evidence, review_status, analysis_scope_id,
        scope_family_key, logical_opportunity_key, evidence_hash, revision_of_id,
        revision_number
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
        v_f->>'evidence_hash',
        v_previous.id,
        coalesce(v_previous.revision_number, 0) + 1
      ) returning id into v_finding_id;

      if v_previous.id is not null then
        update public.license_waste_opportunities
        set superseded_at = timezone('utc', now()),
            superseded_by_sync_run_id = p_sync_run_id
        where id = v_previous.id and organization_id = p_organization_id;
      end if;
    end if;

    insert into public.subscription_usage_analysis_findings (
      organization_id, analysis_scope_id, finding_id
    ) values (p_organization_id, p_analysis_scope_id, v_finding_id)
    on conflict do nothing;
    v_count := v_count + 1;
    v_previous := null;
  end loop;

  update public.license_waste_opportunities o
  set superseded_at = timezone('utc', now()),
      superseded_by_sync_run_id = p_sync_run_id,
      resolved_at = timezone('utc', now())
  where o.organization_id = p_organization_id
    and o.scope_family_key = v_scope.scope_family_key
    and o.review_status = 'open'
    and o.superseded_at is null
    and not (o.logical_opportunity_key = any(v_seen_keys));

  return v_count;
end;
$$;

revoke all on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.claim_due_subscription_usage_connections(
  p_limit integer,
  p_lease_minutes integer,
  p_worker_token uuid
)
returns setof public.subscription_usage_provider_connections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service authority required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 20 or p_lease_minutes < 1 or p_lease_minutes > 60 then
    raise exception 'Invalid scheduler claim bounds' using errcode = '22023';
  end if;

  update public.subscription_usage_sync_runs
  set status = 'failed',
      failed_at = timezone('utc', now()),
      last_error_code = 'abandoned_processing_run',
      provider_error_category = 'background_job_failed',
      updated_at = timezone('utc', now())
  where status = 'processing'
    and metadata->>'source' = 'scheduled_daily'
    and started_at < timezone('utc', now()) - make_interval(mins => p_lease_minutes * 2);

  return query
  with due as (
    select c.id
    from public.subscription_usage_provider_connections c
    where c.status = 'connected'
      and c.next_scheduled_sync_at <= timezone('utc', now())
      and (c.sync_claim_expires_at is null or c.sync_claim_expires_at <= timezone('utc', now()))
    order by c.next_scheduled_sync_at, c.id
    for update skip locked
    limit p_limit
  )
  update public.subscription_usage_provider_connections c
  set sync_claim_token = p_worker_token,
      sync_claimed_at = timezone('utc', now()),
      sync_claim_expires_at = timezone('utc', now()) + make_interval(mins => p_lease_minutes),
      updated_at = timezone('utc', now())
  from due
  where c.id = due.id
  returning c.*;
end;
$$;

revoke all on function public.claim_due_subscription_usage_connections(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_due_subscription_usage_connections(integer, integer, uuid) to service_role;

create or replace function public.create_scheduled_subscription_usage_batch_with_rows(
  p_organization_id uuid,
  p_source text,
  p_status text,
  p_idempotency_key text,
  p_provider text,
  p_provider_connection_id uuid,
  p_sync_run_id uuid,
  p_metadata jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service authority required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.subscription_usage_provider_connections c
    where c.id = p_provider_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
      and c.sync_claim_token is not null
      and c.sync_claim_expires_at > timezone('utc', now())
  ) then
    raise exception 'Active scoped scheduler claim required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.subscription_usage_sync_runs r
    where r.id = p_sync_run_id
      and r.organization_id = p_organization_id
      and r.provider_connection_id = p_provider_connection_id
      and r.provider = p_provider
      and r.status = 'processing'
      and r.idempotency_key = p_idempotency_key
  ) then
    raise exception 'Scoped scheduled sync run required' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'Invalid usage import batch status' using errcode = '22023';
  end if;

  insert into public.usage_import_batches (
    organization_id, actor_user_id, source, status, row_count, error_count,
    ready_count, rejected_count, partial_success, file_name, idempotency_key,
    provider, provider_connection_id, sync_run_id, metadata, committed_at,
    completed_at, failed_at
  ) values (
    p_organization_id, null, p_source, p_status,
    jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
    coalesce((p_metadata->>'errorCount')::integer, 0),
    coalesce((p_metadata->>'readyCount')::integer, 0),
    coalesce((p_metadata->>'rejectedCount')::integer, 0),
    coalesce((p_metadata->>'partialSuccess')::boolean, false),
    null, p_idempotency_key, p_provider, p_provider_connection_id,
    p_sync_run_id, p_metadata, timezone('utc', now()),
    case when p_status in ('completed', 'partial') then timezone('utc', now()) else null end,
    case when p_status = 'failed' then timezone('utc', now()) else null end
  )
  on conflict (organization_id, idempotency_key) where idempotency_key is not null
  do update set updated_at = timezone('utc', now())
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.usage_import_rows (
      organization_id, batch_id, row_number, vendor_name, product_name,
      normalized_product, product_category, seats_purchased, seats_used,
      spend_amount, currency, annual_reviewed_cost, purchased_seats,
      assigned_seats, active_users_30d, active_users_90d, last_activity_at,
      department, owner_label, contract_reference, source_label, collected_at,
      trust_state, confidence, validation_status, issue_codes, source_row_hash,
      is_sample, provider, provider_connection_id, sync_run_id,
      external_product_id, normalized_payload
    ) values (
      p_organization_id, v_batch_id, (v_row->>'row_number')::integer,
      v_row->>'vendor_name', v_row->>'product_name', v_row->>'normalized_product',
      v_row->>'product_category', nullif(v_row->>'seats_purchased', '')::numeric,
      nullif(v_row->>'seats_used', '')::numeric, nullif(v_row->>'spend_amount', '')::numeric,
      v_row->>'currency', nullif(v_row->>'annual_reviewed_cost', '')::numeric,
      nullif(v_row->>'purchased_seats', '')::numeric, nullif(v_row->>'assigned_seats', '')::numeric,
      nullif(v_row->>'active_users_30d', '')::numeric, nullif(v_row->>'active_users_90d', '')::numeric,
      nullif(v_row->>'last_activity_at', '')::timestamptz, v_row->>'department',
      v_row->>'owner_label', v_row->>'contract_reference', v_row->>'source_label',
      nullif(v_row->>'collected_at', '')::timestamptz,
      coalesce(v_row->>'trust_state', 'needs_review'),
      coalesce(nullif(v_row->>'confidence', '')::numeric, 0.5),
      coalesce(v_row->>'validation_status', 'needs_review'),
      coalesce(array(select jsonb_array_elements_text(v_row->'issue_codes')), '{}'),
      v_row->>'source_row_hash', coalesce((v_row->>'is_sample')::boolean, false),
      p_provider, p_provider_connection_id, p_sync_run_id,
      v_row->>'external_product_id', coalesce(v_row->'normalized_payload', '{}'::jsonb)
    )
    on conflict (organization_id, batch_id, source_row_hash) where source_row_hash is not null do nothing;
  end loop;
  return v_batch_id;
end;
$$;

revoke all on function public.create_scheduled_subscription_usage_batch_with_rows(uuid, text, text, text, text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_scheduled_subscription_usage_batch_with_rows(uuid, text, text, text, text, uuid, uuid, jsonb, jsonb) to service_role;

comment on table public.subscription_usage_consent_attempts is
  'Service-private, single-use OAuth/admin-consent nonce evidence. Never stores provider tokens or callback payloads.';
comment on table public.subscription_usage_analysis_scopes is
  'Immutable organization-scoped snapshot sets used for deterministic subscription reconciliation.';
comment on column public.subscription_usage_provider_connections.verified_permissions is
  'Safe permission names verified at connection time; never contains tokens or provider response bodies.';
