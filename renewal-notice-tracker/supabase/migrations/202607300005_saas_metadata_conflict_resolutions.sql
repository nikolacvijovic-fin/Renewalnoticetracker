create table if not exists public.saas_contract_metadata_conflict_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  software_id uuid not null references public.saas_software_inventory (id) on delete cascade,
  saas_term_id uuid not null references public.saas_contract_terms (id) on delete cascade,
  field_name text not null check (field_name in (
    'renewal_date',
    'expiration_date',
    'notice_deadline_date',
    'auto_renewal',
    'contract_value_amount',
    'contract_value_currency'
  )),
  contract_value_json jsonb not null default 'null'::jsonb,
  saas_value_json jsonb not null default 'null'::jsonb,
  trusted_source text not null check (trusted_source in ('contract_metadata', 'saas_term', 'manual_override')),
  manual_override_json jsonb,
  resolution_reason text not null check (char_length(resolution_reason) between 1 and 500),
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  resolved_at timestamptz not null default timezone('utc', now()),
  reopened_by_user_id uuid references auth.users (id) on delete set null,
  reopened_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists saas_contract_metadata_conflict_resolutions_touch_updated_at
  on public.saas_contract_metadata_conflict_resolutions;
create trigger saas_contract_metadata_conflict_resolutions_touch_updated_at
before update on public.saas_contract_metadata_conflict_resolutions
for each row execute function public.touch_updated_at();

create unique index if not exists saas_metadata_conflict_resolution_active_unique_idx
  on public.saas_contract_metadata_conflict_resolutions (
    organization_id,
    contract_id,
    saas_term_id,
    field_name
  )
  where reopened_at is null;

create index if not exists saas_metadata_conflict_resolution_org_contract_idx
  on public.saas_contract_metadata_conflict_resolutions (organization_id, contract_id, resolved_at desc);

create index if not exists saas_metadata_conflict_resolution_org_software_idx
  on public.saas_contract_metadata_conflict_resolutions (organization_id, software_id, resolved_at desc);

create index if not exists saas_metadata_conflict_resolution_org_state_idx
  on public.saas_contract_metadata_conflict_resolutions (organization_id, reopened_at, resolved_at desc);

alter table public.saas_contract_metadata_conflict_resolutions enable row level security;

create policy "members can access saas metadata conflict resolutions"
on public.saas_contract_metadata_conflict_resolutions
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_metadata_conflict_resolutions.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_metadata_conflict_resolutions.organization_id
      and memberships.user_id = auth.uid()
  )
);
