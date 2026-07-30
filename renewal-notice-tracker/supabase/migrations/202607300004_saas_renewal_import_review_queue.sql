create table if not exists public.saas_renewal_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  file_name text not null,
  status text not null default 'needs_review' check (status in ('ready', 'needs_review', 'rejected', 'corrected', 'partially_activated', 'activated', 'dismissed', 'archived')),
  row_count integer not null default 0 check (row_count >= 0),
  ready_count integer not null default 0 check (ready_count >= 0),
  needs_review_count integer not null default 0 check (needs_review_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saas_renewal_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.saas_renewal_import_batches (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  status text not null,
  review_notes text,
  raw_row_json jsonb not null default '{}'::jsonb,
  normalized_row_json jsonb not null default '{}'::jsonb,
  issues_json jsonb not null default '[]'::jsonb,
  accepted_weak_evidence boolean not null default false,
  duplicate_confirmed boolean not null default false,
  activated_at timestamptz,
  activated_by uuid references auth.users (id) on delete set null,
  corrected_at timestamptz,
  corrected_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint saas_renewal_import_rows_status_check check (status in ('ready', 'needs_review', 'rejected', 'corrected', 'activated', 'dismissed', 'archived')),
  unique (batch_id, row_number)
);

drop trigger if exists saas_renewal_import_batches_touch_updated_at on public.saas_renewal_import_batches;
create trigger saas_renewal_import_batches_touch_updated_at
before update on public.saas_renewal_import_batches
for each row execute function public.touch_updated_at();

drop trigger if exists saas_renewal_import_rows_touch_updated_at on public.saas_renewal_import_rows;
create trigger saas_renewal_import_rows_touch_updated_at
before update on public.saas_renewal_import_rows
for each row execute function public.touch_updated_at();

create index if not exists saas_renewal_import_batches_org_status_idx
  on public.saas_renewal_import_batches (organization_id, status, created_at desc);

create index if not exists saas_renewal_import_rows_org_batch_status_idx
  on public.saas_renewal_import_rows (organization_id, batch_id, status, row_number);

alter table public.saas_renewal_import_batches enable row level security;
alter table public.saas_renewal_import_rows enable row level security;

create policy "members can read saas renewal import batches" on public.saas_renewal_import_batches
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_batches.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "operators can manage saas renewal import batches" on public.saas_renewal_import_batches
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_batches.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('owner', 'admin', 'operator')
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_batches.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('owner', 'admin', 'operator')
  )
);

create policy "members can read saas renewal import rows" on public.saas_renewal_import_rows
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_rows.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "operators can manage saas renewal import rows" on public.saas_renewal_import_rows
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_rows.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('owner', 'admin', 'operator')
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = saas_renewal_import_rows.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('owner', 'admin', 'operator')
  )
);
