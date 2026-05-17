alter table public.counterparties
  add column if not exists raw_counterparty_name text,
  add column if not exists normalized_counterparty_name text,
  add column if not exists merged_into_counterparty_id uuid references public.counterparties (id) on delete set null;

update public.counterparties
set
  raw_counterparty_name = coalesce(raw_counterparty_name, name),
  normalized_counterparty_name = coalesce(
    normalized_counterparty_name,
    trim(
      regexp_replace(
        lower(
          regexp_replace(
            replace(
              translate(coalesce(name, ''), 'ŠšĐđŽžČčĆć', 'SsDdZzCcCc'),
              '&',
              ' and '
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
          )
        ),
        '\s+(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|doo|dooel|plc|ag|bv|sa|sro)$',
        '',
        'g'
      )
    )
  )
where raw_counterparty_name is null
   or normalized_counterparty_name is null;

alter table public.counterparties
  alter column raw_counterparty_name set not null,
  alter column normalized_counterparty_name set not null;

create table if not exists public.counterparty_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  counterparty_id uuid not null references public.counterparties (id) on delete cascade,
  alias_name text not null,
  normalized_alias_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists counterparties_organization_normalized_idx
  on public.counterparties (organization_id, normalized_counterparty_name);

create index if not exists counterparties_organization_merged_idx
  on public.counterparties (organization_id, merged_into_counterparty_id);

create index if not exists counterparty_aliases_organization_normalized_idx
  on public.counterparty_aliases (organization_id, normalized_alias_name);

create unique index if not exists counterparty_aliases_counterparty_normalized_unique
  on public.counterparty_aliases (counterparty_id, normalized_alias_name);

alter table public.counterparty_aliases enable row level security;

create policy "members can access counterparty aliases" on public.counterparty_aliases
for all using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = counterparty_aliases.organization_id
      and memberships.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = counterparty_aliases.organization_id
      and memberships.user_id = auth.uid()
  )
);
