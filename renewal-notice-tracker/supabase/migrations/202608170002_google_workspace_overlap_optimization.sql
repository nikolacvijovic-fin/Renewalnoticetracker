-- Google Workspace usage synchronization and cross-provider overlap evidence.
-- Secrets are stored only as encrypted credential envelopes in a service-role-only vault.

alter table public.subscription_usage_provider_connections
  drop constraint if exists subscription_usage_provider_connections_provider_check,
  drop constraint if exists subscription_usage_provider_connections_status_check;

alter table public.subscription_usage_provider_connections
  add constraint subscription_usage_provider_connections_provider_check
    check (provider in ('microsoft_365', 'google_workspace')),
  add constraint subscription_usage_provider_connections_status_check
    check (status in ('pending_admin_consent', 'connected', 'permission_error', 'expired_credential', 'revoked_access', 'disconnected'));

alter table public.subscription_usage_sync_runs
  drop constraint if exists subscription_usage_sync_runs_provider_check;

alter table public.subscription_usage_sync_runs
  add constraint subscription_usage_sync_runs_provider_check
    check (provider in ('microsoft_365', 'google_workspace'));

alter table public.usage_import_batches
  drop constraint if exists usage_import_batches_provider_check;
alter table public.usage_import_batches
  add constraint usage_import_batches_provider_check
    check (provider is null or provider in ('manual_csv', 'microsoft_365', 'google_workspace'));

alter table public.usage_import_rows
  drop constraint if exists usage_import_rows_provider_check;
alter table public.usage_import_rows
  add constraint usage_import_rows_provider_check
    check (provider is null or provider in ('manual_csv', 'microsoft_365', 'google_workspace'));

alter table public.license_waste_opportunities
  drop constraint if exists license_waste_opportunities_provider_check,
  drop constraint if exists license_waste_opportunities_accepted_action_check;

alter table public.license_waste_opportunities
  add constraint license_waste_opportunities_provider_check
    check (provider is null or provider in ('manual_csv', 'microsoft_365', 'google_workspace')),
  add constraint license_waste_opportunities_accepted_action_check
    check (accepted_action is null or accepted_action in (
      'retain', 'reduce_seats', 'consolidate', 'terminate', 'renegotiate',
      'investigate', 'insufficient_evidence'
    )),
  add column if not exists capability_category text,
  add column if not exists taxonomy_version text,
  add column if not exists involved_providers text[] not null default '{}',
  add column if not exists involved_products text[] not null default '{}',
  add column if not exists estimated_savings_min numeric check (estimated_savings_min is null or estimated_savings_min >= 0),
  add column if not exists estimated_savings_max numeric check (estimated_savings_max is null or estimated_savings_max >= 0),
  add column if not exists feedback_classification text
    check (feedback_classification is null or feedback_classification in ('correct', 'incorrect', 'requires_help')),
  add column if not exists feedback_reason text
    check (feedback_reason is null or feedback_reason in (
      'separate_departments', 'compliance_requirement', 'migration_in_progress',
      'backup_requirement', 'incorrect_product_mapping', 'insufficient_evidence', 'other'
    ));

create table if not exists public.subscription_usage_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider_connection_id uuid not null references public.subscription_usage_provider_connections (id) on delete cascade,
  provider text not null check (provider = 'google_workspace'),
  encrypted_credential text not null,
  credential_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, provider_connection_id)
);

comment on table public.subscription_usage_provider_credentials is
  'Service-role-only encrypted provider credential envelopes. Customer sessions, Java, and Python have no direct table access.';

alter table public.subscription_usage_provider_credentials enable row level security;
revoke all on table public.subscription_usage_provider_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.subscription_usage_provider_credentials to service_role;

create index if not exists license_waste_opportunities_org_capability_review_idx
  on public.license_waste_opportunities (organization_id, capability_category, review_status, created_at desc);

comment on column public.license_waste_opportunities.feedback_reason is
  'Structured human feedback only. Free-text customer data and provider payloads are forbidden.';

comment on column public.subscription_usage_provider_connections.disconnected_at is
  'Disconnect stops future synchronization. Encrypted credentials are deleted immediately; aggregated usage and reviewed findings remain under organization retention policy.';

create or replace function public.disconnect_google_workspace_subscription_usage_connection(
  p_organization_id uuid,
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  update public.subscription_usage_provider_connections
  set status = 'disconnected',
      disconnected_at = timezone('utc', now()),
      next_scheduled_sync_at = null,
      updated_at = timezone('utc', now())
  where id = p_connection_id
    and organization_id = p_organization_id
    and provider = 'google_workspace';

  v_updated := found;
  if not v_updated then
    raise exception 'Google Workspace connection not found' using errcode = 'P0002';
  end if;

  delete from public.subscription_usage_provider_credentials
  where organization_id = p_organization_id
    and provider_connection_id = p_connection_id
    and provider = 'google_workspace';

  return true;
end;
$$;

revoke all on function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid) from public, anon;
grant execute on function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid) to authenticated;

comment on function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid) is
  'Atomically disconnects an organization-scoped Google Workspace connection and deletes its encrypted credential. Restricted to authenticated owner/admin/operator members.';
