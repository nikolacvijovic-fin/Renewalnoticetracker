create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  legal_name text,
  contact_email text,
  contact_name text,
  website text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key text not null,
  name text not null,
  contract_type text,
  default_notice_period_value integer,
  default_notice_period_unit text check (default_notice_period_unit in ('days', 'weeks', 'months')),
  default_reminder_offsets jsonb not null default '["P30D","P14D","P3D"]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, template_key)
);

create table if not exists public.renewal_decisions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  status text not null check (status in ('undecided', 'renew', 'renegotiate', 'terminate')),
  decision_date date,
  summary text not null,
  next_steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.playbook_runs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  selected_steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  file_name text not null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  status text not null check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.contracts
  add column if not exists counterparty_id uuid references public.counterparties (id) on delete set null,
  add column if not exists renewal_decision_status text not null default 'undecided',
  add column if not exists renewal_decision_date date;

alter table public.contracts
  add constraint contracts_renewal_decision_status_check
  check (renewal_decision_status in ('undecided', 'renew', 'renegotiate', 'terminate'));

alter table public.contract_metadata
  add column if not exists contract_template_key text;

alter table public.reminders
  add column if not exists rule_name text,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists ical_uid text;

alter table public.counterparties enable row level security;
alter table public.contract_templates enable row level security;
alter table public.renewal_decisions enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_runs enable row level security;
alter table public.import_jobs enable row level security;

create policy "members can access counterparties" on public.counterparties
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = counterparties.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = counterparties.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access contract templates" on public.contract_templates
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_templates.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_templates.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access renewal decisions" on public.renewal_decisions
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = renewal_decisions.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = renewal_decisions.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access playbooks" on public.playbooks
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = playbooks.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = playbooks.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access playbook runs" on public.playbook_runs
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = playbook_runs.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = playbook_runs.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access import jobs" on public.import_jobs
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = import_jobs.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = import_jobs.organization_id
      and memberships.user_id = auth.uid()
  )
);
