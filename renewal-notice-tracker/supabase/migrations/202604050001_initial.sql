create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  notification_email text,
  default_organization_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.users
  add constraint users_default_organization_id_fkey
  foreign key (default_organization_id)
  references public.organizations (id)
  on delete set null;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'active',
  source_type text not null default 'upload',
  latest_file_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contract_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  extracted_text text,
  extraction_error text,
  uploaded_at timestamptz not null default timezone('utc', now()),
  uploaded_by uuid not null references auth.users (id) on delete restrict
);

alter table public.contracts
  add constraint contracts_latest_file_id_fkey
  foreign key (latest_file_id)
  references public.contract_files (id)
  on delete set null;

create table if not exists public.contract_metadata (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.contracts (id) on delete cascade,
  contract_title text,
  counterparty_name text,
  contract_type text,
  effective_date date,
  expiration_date date,
  auto_renewal boolean,
  renewal_term text,
  notice_period_value integer,
  notice_period_unit text check (notice_period_unit in ('days', 'weeks', 'months')),
  notice_deadline_date date,
  governing_law text,
  payment_terms text,
  extracted_clauses jsonb not null default '[]'::jsonb,
  field_confidence jsonb not null default '{}'::jsonb,
  field_source_snippets jsonb not null default '{}'::jsonb,
  reminder_recommendations jsonb not null default '[]'::jsonb,
  needs_review boolean not null default true,
  reviewer_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('notice_deadline', 'renewal', 'custom')),
  remind_at timestamptz not null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  source text not null default 'system' check (source in ('system', 'manual')),
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_email text not null,
  channel text not null default 'email',
  status text not null,
  provider_message_id text,
  error_message text,
  sent_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  contract_id uuid references public.contracts (id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists contracts_touch_updated_at on public.contracts;
create trigger contracts_touch_updated_at
before update on public.contracts
for each row execute function public.touch_updated_at();

drop trigger if exists contract_metadata_touch_updated_at on public.contract_metadata;
create trigger contract_metadata_touch_updated_at
before update on public.contract_metadata
for each row execute function public.touch_updated_at();

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_files enable row level security;
alter table public.contract_metadata enable row level security;
alter table public.reminders enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notes enable row level security;

create policy "users can manage own profile" on public.users
for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "owners can insert organizations" on public.organizations
for insert with check (auth.uid() = created_by);

create policy "members can read organizations" on public.organizations
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = organizations.id
      and memberships.user_id = auth.uid()
  )
);

create policy "users can manage own memberships" on public.memberships
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members can access contracts" on public.contracts
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contracts.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contracts.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access contract files" on public.contract_files
for all using (
  exists (
    select 1
    from public.contracts
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contracts.id = contract_files.contract_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.contracts
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contracts.id = contract_files.contract_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access contract metadata" on public.contract_metadata
for all using (
  exists (
    select 1
    from public.contracts
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contracts.id = contract_metadata.contract_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.contracts
    join public.memberships on memberships.organization_id = contracts.organization_id
    where contracts.id = contract_metadata.contract_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access reminders" on public.reminders
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = reminders.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = reminders.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can read notification logs" on public.notification_logs
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = notification_logs.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can read audit logs" on public.audit_logs
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = audit_logs.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can access notes" on public.notes
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = notes.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = notes.organization_id
      and memberships.user_id = auth.uid()
  )
);
