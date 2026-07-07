create table if not exists public.saas_software_inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  vendor_name text,
  category text,
  owner_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'under_review')),
  source_contract_id uuid references public.contracts (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saas_contract_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  software_id uuid not null references public.saas_software_inventory (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete set null,
  renewal_date date,
  expiration_date date,
  auto_renewal boolean not null default false,
  notice_period_value integer check (notice_period_value is null or notice_period_value > 0),
  notice_period_unit text check (notice_period_unit is null or notice_period_unit in ('days', 'weeks', 'months')),
  notice_deadline_date date,
  term_summary text,
  contract_value_amount numeric,
  contract_value_currency text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint saas_contract_terms_notice_period_pair check (
    (notice_period_value is null and notice_period_unit is null)
    or (notice_period_value is not null and notice_period_unit is not null)
  )
);

create table if not exists public.saas_opt_out_windows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  software_id uuid not null references public.saas_software_inventory (id) on delete cascade,
  contract_term_id uuid not null references public.saas_contract_terms (id) on delete cascade,
  opt_out_deadline date not null,
  window_opens_on date,
  window_closes_on date,
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'cancelled')),
  source text not null default 'calculated' check (source in ('explicit', 'calculated')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saas_contract_risk_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  software_id uuid not null references public.saas_software_inventory (id) on delete cascade,
  contract_term_id uuid references public.saas_contract_terms (id) on delete cascade,
  opt_out_window_id uuid references public.saas_opt_out_windows (id) on delete cascade,
  finding_type text not null check (finding_type in ('auto_renewal', 'missing_notice_deadline', 'expired_opt_out', 'critical_opt_out')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'suppressed')),
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists saas_software_inventory_touch_updated_at on public.saas_software_inventory;
create trigger saas_software_inventory_touch_updated_at
before update on public.saas_software_inventory
for each row execute function public.touch_updated_at();

drop trigger if exists saas_contract_terms_touch_updated_at on public.saas_contract_terms;
create trigger saas_contract_terms_touch_updated_at
before update on public.saas_contract_terms
for each row execute function public.touch_updated_at();

drop trigger if exists saas_opt_out_windows_touch_updated_at on public.saas_opt_out_windows;
create trigger saas_opt_out_windows_touch_updated_at
before update on public.saas_opt_out_windows
for each row execute function public.touch_updated_at();

drop trigger if exists saas_contract_risk_findings_touch_updated_at on public.saas_contract_risk_findings;
create trigger saas_contract_risk_findings_touch_updated_at
before update on public.saas_contract_risk_findings
for each row execute function public.touch_updated_at();

create index if not exists saas_software_inventory_org_status_idx
  on public.saas_software_inventory (organization_id, status, updated_at desc);

create index if not exists saas_contract_terms_org_software_idx
  on public.saas_contract_terms (organization_id, software_id, updated_at desc);

create index if not exists saas_opt_out_windows_org_deadline_idx
  on public.saas_opt_out_windows (organization_id, opt_out_deadline, status);

create index if not exists saas_contract_risk_findings_org_status_idx
  on public.saas_contract_risk_findings (organization_id, status, severity);

alter table public.saas_software_inventory enable row level security;
alter table public.saas_contract_terms enable row level security;
alter table public.saas_opt_out_windows enable row level security;
alter table public.saas_contract_risk_findings enable row level security;

create policy "members can access saas software inventory" on public.saas_software_inventory
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_software_inventory.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_software_inventory.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access saas contract terms" on public.saas_contract_terms
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_terms.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_terms.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access saas opt out windows" on public.saas_opt_out_windows
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_opt_out_windows.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_opt_out_windows.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access saas contract risk findings" on public.saas_contract_risk_findings
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_risk_findings.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_contract_risk_findings.organization_id
      and memberships.user_id = auth.uid()
  )
);
