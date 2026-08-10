create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  entity_type text null,
  entity_id uuid null,
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  feedback_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  message text null,
  safe_context jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  resolved_by_user_id uuid null references auth.users(id) on delete set null,
  resolution_note text null,
  constraint customer_feedback_type_check check (
    feedback_type in (
      'deadline_correct',
      'deadline_incorrect',
      'extraction_problem',
      'reminder_problem',
      'upload_problem',
      'export_problem',
      'billing_problem',
      'request_help',
      'other'
    )
  ),
  constraint customer_feedback_severity_check check (severity in ('low', 'medium', 'high', 'urgent')),
  constraint customer_feedback_status_check check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint customer_feedback_message_bounds_check check (
    message is null or char_length(message) between 1 and 1000
  ),
  constraint customer_feedback_resolution_note_bounds_check check (
    resolution_note is null or char_length(resolution_note) <= 1000
  )
);

create or replace function public.touch_customer_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists customer_feedback_touch_updated_at on public.customer_feedback;
create trigger customer_feedback_touch_updated_at
before update
on public.customer_feedback
for each row execute function public.touch_customer_feedback_updated_at();

create or replace function public.enforce_customer_feedback_contract_scope()
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
    raise exception 'customer_feedback_contract_scope_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_feedback_contract_scope on public.customer_feedback;
create trigger customer_feedback_contract_scope
before insert or update of organization_id, contract_id
on public.customer_feedback
for each row execute function public.enforce_customer_feedback_contract_scope();

create index if not exists idx_customer_feedback_org_status_created
  on public.customer_feedback(organization_id, status, created_at desc);

create index if not exists idx_customer_feedback_org_type_created
  on public.customer_feedback(organization_id, feedback_type, created_at desc);

create index if not exists idx_customer_feedback_contract
  on public.customer_feedback(organization_id, contract_id, created_at desc)
  where contract_id is not null;

create unique index if not exists idx_customer_feedback_idempotency
  on public.customer_feedback(organization_id, submitted_by_user_id, idempotency_key);

alter table public.customer_feedback enable row level security;

drop policy if exists "members can insert organization feedback" on public.customer_feedback;
create policy "members can insert organization feedback"
  on public.customer_feedback
  for insert
  with check (
    submitted_by_user_id = auth.uid()
    and exists (
      select 1
      from public.memberships
      where memberships.organization_id = customer_feedback.organization_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists "members can read own organization feedback" on public.customer_feedback;
create policy "members can read own organization feedback"
  on public.customer_feedback
  for select
  using (
    exists (
      select 1
      from public.memberships
      where memberships.organization_id = customer_feedback.organization_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists "admins operators can update organization feedback" on public.customer_feedback;
drop policy if exists "members cannot update organization feedback" on public.customer_feedback;
drop policy if exists "members cannot delete organization feedback" on public.customer_feedback;

comment on table public.customer_feedback is
  'Beta customer workflow feedback and help requests. Message is optional capped user-entered support text visible only in support triage; safe_context, audit, analytics, and monitoring must never contain raw contract text, clauses, provider payloads, email bodies, private notes, secrets, tokens, storage paths, or generated template bodies. Customer users can submit and read organization-scoped feedback, but status updates are internal support/admin service-role actions only.';
