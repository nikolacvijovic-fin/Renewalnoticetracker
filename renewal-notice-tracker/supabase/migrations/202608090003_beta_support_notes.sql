create table if not exists public.beta_support_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  status text not null default 'open',
  issue_type text not null,
  safe_note text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  resolved_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  constraint beta_support_notes_status_check check (status in ('open', 'resolved')),
  constraint beta_support_notes_safe_note_bounds_check check (char_length(safe_note) between 1 and 1000),
  constraint beta_support_notes_issue_type_bounds_check check (char_length(issue_type) between 1 and 80)
);

create or replace function public.enforce_beta_support_note_contract_scope()
returns trigger
language plpgsql
as $$
begin
  if new.contract_id is not null and not exists (
    select 1
    from public.contracts
    where contracts.id = new.contract_id
      and contracts.organization_id = new.organization_id
  ) then
    raise exception 'beta_support_note_contract_scope_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists beta_support_notes_contract_scope on public.beta_support_notes;
create trigger beta_support_notes_contract_scope
before insert or update of organization_id, contract_id
on public.beta_support_notes
for each row execute function public.enforce_beta_support_note_contract_scope();

create index if not exists idx_beta_support_notes_org_status_created
  on public.beta_support_notes(organization_id, status, created_at desc);

create index if not exists idx_beta_support_notes_contract
  on public.beta_support_notes(organization_id, contract_id, created_at desc)
  where contract_id is not null;

alter table public.beta_support_notes enable row level security;

drop policy if exists "No customer direct access to beta support notes" on public.beta_support_notes;
create policy "No customer direct access to beta support notes"
  on public.beta_support_notes
  for all
  using (false)
  with check (false);

comment on table public.beta_support_notes is
  'Internal founder/support notes for beta reliability triage. Service-role repository only; never store raw contract text, provider payloads, private email bodies, storage paths, or secrets.';
