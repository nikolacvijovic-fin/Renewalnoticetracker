create table if not exists public.renewal_action_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  requested_to_user_id uuid not null references auth.users (id) on delete cascade,
  request_status text not null default 'pending' check (request_status in ('pending', 'completed', 'dismissed', 'expired')),
  requested_action text not null default 'decide_renewal' check (requested_action in ('decide_renewal')),
  due_at timestamptz,
  message text check (message is null or char_length(message) <= 500),
  response_status text check (
    response_status is null
    or response_status in ('renew', 'cancel', 'renegotiate', 'defer', 'needs_more_info', 'completed', 'dismissed')
  ),
  response_note text check (response_note is null or char_length(response_note) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists renewal_action_requests_touch_updated_at on public.renewal_action_requests;
create trigger renewal_action_requests_touch_updated_at
before update on public.renewal_action_requests
for each row execute function public.touch_updated_at();

create index if not exists renewal_action_requests_org_status_due_idx
  on public.renewal_action_requests (organization_id, request_status, due_at nulls last, created_at desc);

create index if not exists renewal_action_requests_owner_pending_idx
  on public.renewal_action_requests (organization_id, requested_to_user_id, request_status, due_at nulls last);

create index if not exists renewal_action_requests_contract_status_idx
  on public.renewal_action_requests (organization_id, contract_id, request_status);

alter table public.renewal_action_requests enable row level security;

create policy "org members can read scoped renewal action requests"
  on public.renewal_action_requests for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_action_requests.organization_id
        and m.user_id = auth.uid()
        and (
          renewal_action_requests.requested_to_user_id = auth.uid()
          or m.role in ('owner', 'admin', 'operator', 'reviewer')
        )
    )
  );

create policy "operators can create renewal action requests"
  on public.renewal_action_requests for insert
  with check (
    exists (
      select 1 from public.memberships actor_membership
      where actor_membership.organization_id = renewal_action_requests.organization_id
        and actor_membership.user_id = auth.uid()
        and actor_membership.role in ('owner', 'admin', 'operator')
    )
    and exists (
      select 1 from public.memberships assignee_membership
      where assignee_membership.organization_id = renewal_action_requests.organization_id
        and assignee_membership.user_id = renewal_action_requests.requested_to_user_id
    )
  );

create policy "operators and assigned owners can update renewal action requests"
  on public.renewal_action_requests for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_action_requests.organization_id
        and m.user_id = auth.uid()
        and (
          renewal_action_requests.requested_to_user_id = auth.uid()
          or m.role in ('owner', 'admin', 'operator')
        )
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_action_requests.organization_id
        and m.user_id = auth.uid()
        and (
          renewal_action_requests.requested_to_user_id = auth.uid()
          or m.role in ('owner', 'admin', 'operator')
        )
    )
  );
