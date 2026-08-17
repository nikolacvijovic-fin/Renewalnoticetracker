-- Microsoft 365 subscription usage connector control plane.
-- Additive only. Java/Python services receive signed requests and never receive
-- direct database authority. Provider tokens and raw Graph payloads must not be
-- stored in these tables.

create table if not exists public.subscription_usage_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('microsoft_365')),
  provider_tenant_id text not null,
  provider_tenant_name text,
  status text not null default 'pending_admin_consent'
    check (status in ('pending_admin_consent', 'connected', 'permission_error', 'expired_credential', 'disconnected')),
  credential_reference text not null,
  credential_fingerprint text not null,
  required_permissions text[] not null default '{}',
  connection_owner_user_id uuid references auth.users (id) on delete set null,
  last_successful_sync_at timestamptz,
  last_error_code text,
  next_scheduled_sync_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, provider, provider_tenant_id)
);

alter table public.usage_import_batches
  drop constraint if exists usage_import_batches_status_check;

alter table public.usage_import_batches
  add constraint usage_import_batches_status_check
  check (status in ('queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'));

comment on table public.subscription_usage_provider_connections is
  'Tenant-scoped provider connection records for subscription usage optimization. Stores managed-secret references only, never raw Microsoft Graph tokens, auth codes, or provider payloads.';

create table if not exists public.subscription_usage_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider_connection_id uuid not null references public.subscription_usage_provider_connections (id) on delete cascade,
  provider text not null check (provider in ('microsoft_365')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
  idempotency_key text not null,
  usage_import_batch_id uuid references public.usage_import_batches (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  row_count integer not null default 0 check (row_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  provider_error_category text,
  last_error_code text,
  cursor_checkpoint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, provider_connection_id, idempotency_key)
);

comment on table public.subscription_usage_sync_runs is
  'Organization-scoped synchronization evidence for subscription usage providers. Error metadata must be safe and exclude raw Graph responses, tokens, user activity details, and provider payloads.';

alter table public.usage_import_batches
  add column if not exists provider text check (provider is null or provider in ('manual_csv', 'microsoft_365')),
  add column if not exists provider_connection_id uuid references public.subscription_usage_provider_connections (id) on delete set null,
  add column if not exists sync_run_id uuid references public.subscription_usage_sync_runs (id) on delete set null;

alter table public.usage_import_rows
  add column if not exists provider text check (provider is null or provider in ('manual_csv', 'microsoft_365')),
  add column if not exists provider_connection_id uuid references public.subscription_usage_provider_connections (id) on delete set null,
  add column if not exists sync_run_id uuid references public.subscription_usage_sync_runs (id) on delete set null,
  add column if not exists external_product_id text;

alter table public.license_waste_opportunities
  add column if not exists provider text check (provider is null or provider in ('manual_csv', 'microsoft_365')),
  add column if not exists provider_connection_id uuid references public.subscription_usage_provider_connections (id) on delete set null,
  add column if not exists sync_run_id uuid references public.subscription_usage_sync_runs (id) on delete set null,
  add column if not exists finding_fingerprint text,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_sync_run_id uuid references public.subscription_usage_sync_runs (id) on delete set null;

create unique index if not exists license_waste_opportunities_org_fingerprint_idx
  on public.license_waste_opportunities (organization_id, finding_fingerprint)
  where finding_fingerprint is not null;

create index if not exists subscription_usage_provider_connections_org_status_idx
  on public.subscription_usage_provider_connections (organization_id, status, updated_at desc);

create index if not exists subscription_usage_sync_runs_org_connection_status_idx
  on public.subscription_usage_sync_runs (organization_id, provider_connection_id, status, created_at desc);

create index if not exists usage_import_rows_org_provider_sync_idx
  on public.usage_import_rows (organization_id, provider, sync_run_id);

alter table public.subscription_usage_provider_connections enable row level security;
alter table public.subscription_usage_sync_runs enable row level security;

create policy "review roles can create usage import rows"
on public.usage_import_rows
for insert with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = usage_import_rows.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  )
);

create policy "review roles can create license waste opportunities"
on public.license_waste_opportunities
for insert with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = license_waste_opportunities.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  )
);

create policy "members can read subscription usage provider connections"
on public.subscription_usage_provider_connections
for select using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_provider_connections.organization_id
      and m.user_id = auth.uid()
  )
);

create policy "operator roles can manage subscription usage provider connections"
on public.subscription_usage_provider_connections
for all
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_provider_connections.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_provider_connections.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  )
);

create policy "members can read subscription usage sync runs"
on public.subscription_usage_sync_runs
for select using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_sync_runs.organization_id
      and m.user_id = auth.uid()
  )
);

create policy "operator roles can manage subscription usage sync runs"
on public.subscription_usage_sync_runs
for all
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_sync_runs.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscription_usage_sync_runs.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  )
);

create or replace function public.create_subscription_usage_batch_with_rows(
  p_organization_id uuid,
  p_source text,
  p_status text,
  p_file_name text,
  p_idempotency_key text,
  p_provider text,
  p_provider_connection_id uuid,
  p_sync_run_id uuid,
  p_metadata jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'Invalid usage import batch status' using errcode = '22023';
  end if;

  insert into public.usage_import_batches (
    organization_id,
    actor_user_id,
    source,
    status,
    row_count,
    error_count,
    ready_count,
    rejected_count,
    partial_success,
    file_name,
    idempotency_key,
    provider,
    provider_connection_id,
    sync_run_id,
    metadata,
    committed_at,
    completed_at,
    failed_at
  )
  values (
    p_organization_id,
    auth.uid(),
    p_source,
    p_status,
    jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
    coalesce((p_metadata->>'errorCount')::integer, 0),
    coalesce((p_metadata->>'readyCount')::integer, 0),
    coalesce((p_metadata->>'rejectedCount')::integer, 0),
    coalesce((p_metadata->>'partialSuccess')::boolean, false),
    p_file_name,
    p_idempotency_key,
    p_provider,
    p_provider_connection_id,
    p_sync_run_id,
    p_metadata,
    timezone('utc', now()),
    case when p_status in ('completed', 'partial') then timezone('utc', now()) else null end,
    case when p_status = 'failed' then timezone('utc', now()) else null end
  )
  on conflict (organization_id, idempotency_key) where idempotency_key is not null
  do update set updated_at = timezone('utc', now())
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.usage_import_rows (
      organization_id,
      batch_id,
      row_number,
      vendor_name,
      product_name,
      normalized_product,
      product_category,
      seats_purchased,
      seats_used,
      spend_amount,
      currency,
      annual_reviewed_cost,
      purchased_seats,
      assigned_seats,
      active_users_30d,
      active_users_90d,
      last_activity_at,
      department,
      owner_label,
      contract_reference,
      source_label,
      collected_at,
      trust_state,
      confidence,
      validation_status,
      issue_codes,
      source_row_hash,
      is_sample,
      provider,
      provider_connection_id,
      sync_run_id,
      external_product_id,
      normalized_payload
    )
    values (
      p_organization_id,
      v_batch_id,
      (v_row->>'row_number')::integer,
      v_row->>'vendor_name',
      v_row->>'product_name',
      v_row->>'normalized_product',
      v_row->>'product_category',
      nullif(v_row->>'seats_purchased', '')::numeric,
      nullif(v_row->>'seats_used', '')::numeric,
      nullif(v_row->>'spend_amount', '')::numeric,
      v_row->>'currency',
      nullif(v_row->>'annual_reviewed_cost', '')::numeric,
      nullif(v_row->>'purchased_seats', '')::numeric,
      nullif(v_row->>'assigned_seats', '')::numeric,
      nullif(v_row->>'active_users_30d', '')::numeric,
      nullif(v_row->>'active_users_90d', '')::numeric,
      nullif(v_row->>'last_activity_at', '')::timestamptz,
      v_row->>'department',
      v_row->>'owner_label',
      v_row->>'contract_reference',
      v_row->>'source_label',
      nullif(v_row->>'collected_at', '')::timestamptz,
      coalesce(v_row->>'trust_state', 'needs_review'),
      coalesce(nullif(v_row->>'confidence', '')::numeric, 0.5),
      coalesce(v_row->>'validation_status', 'needs_review'),
      coalesce(array(select jsonb_array_elements_text(v_row->'issue_codes')), '{}'),
      v_row->>'source_row_hash',
      coalesce((v_row->>'is_sample')::boolean, false),
      p_provider,
      p_provider_connection_id,
      p_sync_run_id,
      v_row->>'external_product_id',
      coalesce(v_row->'normalized_payload', '{}'::jsonb)
    )
    on conflict (organization_id, batch_id, source_row_hash) where source_row_hash is not null do nothing;
  end loop;

  return v_batch_id;
end;
$$;

comment on function public.create_subscription_usage_batch_with_rows(uuid, text, text, text, text, text, uuid, uuid, jsonb, jsonb) is
  'Atomic organization-scoped usage batch/row persistence. Caller identity is auth.uid(); raw provider payloads and uploaded file contents are forbidden.';
