alter table public.contracts
  add column if not exists is_sample boolean not null default false;

create unique index if not exists idx_contracts_one_active_sample_per_org
  on public.contracts (organization_id)
  where is_sample = true and status <> 'archived';

create index if not exists idx_contracts_org_is_sample
  on public.contracts (organization_id, is_sample);
