alter table public.renewal_action_requests
  add column if not exists due_date date;

update public.renewal_action_requests
set due_date = due_at::date
where due_date is null
  and due_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contracts_organization_id_id_key'
      and conrelid = 'public.contracts'::regclass
  ) then
    alter table public.contracts
      add constraint contracts_organization_id_id_key unique (organization_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'renewal_action_requests_contract_org_fkey'
      and conrelid = 'public.renewal_action_requests'::regclass
  ) then
    alter table public.renewal_action_requests
      add constraint renewal_action_requests_contract_org_fkey
      foreign key (organization_id, contract_id)
      references public.contracts (organization_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'renewal_action_requests_assignee_membership_fkey'
      and conrelid = 'public.renewal_action_requests'::regclass
  ) then
    alter table public.renewal_action_requests
      add constraint renewal_action_requests_assignee_membership_fkey
      foreign key (organization_id, requested_to_user_id)
      references public.memberships (organization_id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'renewal_action_requests_due_date_required_check'
      and conrelid = 'public.renewal_action_requests'::regclass
  ) then
    alter table public.renewal_action_requests
      add constraint renewal_action_requests_due_date_required_check
      check (requested_action <> 'decide_renewal' or due_date is not null)
      not valid;
  end if;
end $$;

create unique index if not exists renewal_action_requests_one_pending_decide_idx
  on public.renewal_action_requests (organization_id, contract_id, requested_action)
  where request_status = 'pending'
    and requested_action = 'decide_renewal';

drop policy if exists "operators can create renewal action requests" on public.renewal_action_requests;
drop policy if exists "operators and assigned owners can update renewal action requests" on public.renewal_action_requests;

create or replace function public.current_user_org_role(p_organization_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.create_renewal_action_request(
  p_contract_id uuid,
  p_due_date date,
  p_message text default null
)
returns table (
  id uuid,
  contract_id uuid,
  organization_id uuid,
  requested_to_user_id uuid,
  request_status text,
  requested_action text,
  due_date date,
  due_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract record;
  v_message text;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select c.id, c.organization_id, c.owner_user_id, cm.notice_deadline_date, cm.needs_review
    into v_contract
  from public.contracts c
  left join public.contract_metadata cm on cm.contract_id = c.id
  where c.id = p_contract_id;

  if not found then
    raise exception 'Contract not found.' using errcode = 'P0002';
  end if;

  v_role := public.current_user_org_role(v_contract.organization_id);
  if v_role not in ('owner', 'admin', 'operator') then
    raise exception 'Only owners, admins, or operators can request renewal action.' using errcode = '42501';
  end if;

  if v_contract.owner_user_id is null then
    raise exception 'Assign an internal owner before requesting renewal action.' using errcode = '23514';
  end if;

  if p_due_date is null then
    raise exception 'Due date is required.' using errcode = '22007';
  end if;

  if p_due_date < current_date then
    raise exception 'Due date cannot be in the past.' using errcode = '22007';
  end if;

  if v_contract.notice_deadline_date is null or coalesce(v_contract.needs_review, true) then
    raise exception 'Review and trust the notice deadline before requesting renewal action.' using errcode = '23514';
  end if;

  if p_due_date > v_contract.notice_deadline_date then
    raise exception 'Due date cannot be after the trusted notice deadline.' using errcode = '22007';
  end if;

  v_message := nullif(left(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'), 500), '');

  select rar.id, rar.contract_id, rar.organization_id, rar.requested_to_user_id,
         rar.request_status, rar.requested_action, rar.due_date, rar.due_at, false
    into id, contract_id, organization_id, requested_to_user_id,
         request_status, requested_action, due_date, due_at, created
  from public.renewal_action_requests rar
  where rar.organization_id = v_contract.organization_id
    and rar.contract_id = p_contract_id
    and rar.requested_action = 'decide_renewal'
    and rar.request_status = 'pending'
  limit 1;

  if found then
    return next;
    return;
  end if;

  begin
    insert into public.renewal_action_requests (
      contract_id,
      organization_id,
      requested_by_user_id,
      requested_to_user_id,
      request_status,
      requested_action,
      due_date,
      due_at,
      message
    )
    values (
      p_contract_id,
      v_contract.organization_id,
      v_actor,
      v_contract.owner_user_id,
      'pending',
      'decide_renewal',
      p_due_date,
      p_due_date::timestamp at time zone 'UTC',
      v_message
    )
    returning renewal_action_requests.id,
              renewal_action_requests.contract_id,
              renewal_action_requests.organization_id,
              renewal_action_requests.requested_to_user_id,
              renewal_action_requests.request_status,
              renewal_action_requests.requested_action,
              renewal_action_requests.due_date,
              renewal_action_requests.due_at,
              true
    into id, contract_id, organization_id, requested_to_user_id,
         request_status, requested_action, due_date, due_at, created;
  exception
    when unique_violation then
      select rar.id, rar.contract_id, rar.organization_id, rar.requested_to_user_id,
             rar.request_status, rar.requested_action, rar.due_date, rar.due_at, false
        into id, contract_id, organization_id, requested_to_user_id,
             request_status, requested_action, due_date, due_at, created
      from public.renewal_action_requests rar
      where rar.organization_id = v_contract.organization_id
        and rar.contract_id = p_contract_id
        and rar.requested_action = 'decide_renewal'
        and rar.request_status = 'pending'
      limit 1;
  end;

  return next;
end;
$$;

create or replace function public.respond_renewal_action_request(
  p_request_id uuid,
  p_target_status text,
  p_response_status text,
  p_response_note text default null
)
returns table (
  id uuid,
  contract_id uuid,
  organization_id uuid,
  requested_to_user_id uuid,
  request_status text,
  response_status text,
  completed_at timestamptz,
  transitioned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request record;
  v_role text;
  v_completed_at timestamptz := timezone('utc', now());
  v_note text;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_target_status not in ('completed', 'dismissed') then
    raise exception 'Unsupported renewal action transition.' using errcode = '22023';
  end if;

  if p_response_status is null or p_response_status not in ('renew', 'cancel', 'renegotiate', 'defer', 'needs_more_info', 'completed', 'dismissed') then
    raise exception 'Unsupported renewal action response.' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.renewal_action_requests rar
  where rar.id = p_request_id;

  if not found then
    raise exception 'Renewal action request not found.' using errcode = 'P0002';
  end if;

  v_role := public.current_user_org_role(v_request.organization_id);
  if not (v_request.requested_to_user_id = v_actor or v_role in ('owner', 'admin', 'operator')) then
    raise exception 'Only the assigned owner or an operator can respond to this request.' using errcode = '42501';
  end if;

  v_note := nullif(left(regexp_replace(coalesce(p_response_note, ''), '\s+', ' ', 'g'), 500), '');

  update public.renewal_action_requests rar
  set request_status = p_target_status,
      response_status = p_response_status,
      response_note = v_note,
      completed_at = v_completed_at
  where rar.id = p_request_id
    and rar.organization_id = v_request.organization_id
    and rar.request_status = 'pending'
  returning rar.id, rar.contract_id, rar.organization_id, rar.requested_to_user_id,
            rar.request_status, rar.response_status, rar.completed_at, true
  into id, contract_id, organization_id, requested_to_user_id,
       request_status, response_status, completed_at, transitioned;

  if not found then
    raise exception 'Renewal action request is no longer pending.' using errcode = '40001';
  end if;

  return next;
end;
$$;

create or replace function public.expire_renewal_action_request(p_request_id uuid)
returns table (
  id uuid,
  contract_id uuid,
  organization_id uuid,
  requested_to_user_id uuid,
  request_status text,
  completed_at timestamptz,
  transitioned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request record;
  v_role text;
  v_completed_at timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.renewal_action_requests rar
  where rar.id = p_request_id;

  if not found then
    raise exception 'Renewal action request not found.' using errcode = 'P0002';
  end if;

  v_role := public.current_user_org_role(v_request.organization_id);
  if v_role not in ('owner', 'admin', 'operator') then
    raise exception 'Only owners, admins, or operators can expire renewal action requests.' using errcode = '42501';
  end if;

  update public.renewal_action_requests rar
  set request_status = 'expired',
      completed_at = v_completed_at
  where rar.id = p_request_id
    and rar.organization_id = v_request.organization_id
    and rar.request_status = 'pending'
  returning rar.id, rar.contract_id, rar.organization_id, rar.requested_to_user_id,
            rar.request_status, rar.completed_at, true
  into id, contract_id, organization_id, requested_to_user_id,
       request_status, completed_at, transitioned;

  if not found then
    raise exception 'Renewal action request is no longer pending.' using errcode = '40001';
  end if;

  return next;
end;
$$;

create or replace function public.assign_contract_owner_and_expire_requests(
  p_contract_id uuid,
  p_new_owner_user_id uuid default null
)
returns table (
  contract_id uuid,
  organization_id uuid,
  previous_owner_user_id uuid,
  new_owner_user_id uuid,
  expired_request_ids uuid[],
  expired_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract record;
  v_completed_at timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select c.id, c.organization_id, c.owner_user_id
    into v_contract
  from public.contracts c
  where c.id = p_contract_id
  for update;

  if not found then
    raise exception 'Contract not found.' using errcode = 'P0002';
  end if;

  v_role := public.current_user_org_role(v_contract.organization_id);
  if v_role not in ('owner', 'admin', 'operator') then
    raise exception 'Only owners, admins, or operators can manage renewal owners.' using errcode = '42501';
  end if;

  if p_new_owner_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = v_contract.organization_id
      and m.user_id = p_new_owner_user_id
  ) then
    raise exception 'Owner must be a member of the active organization.' using errcode = '23503';
  end if;

  contract_id := p_contract_id;
  organization_id := v_contract.organization_id;
  previous_owner_user_id := v_contract.owner_user_id;
  new_owner_user_id := p_new_owner_user_id;
  expired_request_ids := array[]::uuid[];
  expired_count := 0;

  if previous_owner_user_id is not distinct from new_owner_user_id then
    return next;
    return;
  end if;

  update public.contracts c
  set owner_user_id = p_new_owner_user_id
  where c.id = p_contract_id
    and c.organization_id = v_contract.organization_id;

  with expired as (
    update public.renewal_action_requests rar
    set request_status = 'expired',
        completed_at = v_completed_at
    where rar.organization_id = v_contract.organization_id
      and rar.contract_id = p_contract_id
      and rar.request_status = 'pending'
      and rar.requested_action = 'decide_renewal'
      and (
        previous_owner_user_id is null
        or rar.requested_to_user_id = previous_owner_user_id
      )
    returning rar.id
  )
  select coalesce(array_agg(expired.id), array[]::uuid[]), count(*)::integer
    into expired_request_ids, expired_count
  from expired;

  return next;
end;
$$;

revoke all on function public.current_user_org_role(uuid) from public;
revoke all on function public.create_renewal_action_request(uuid, date, text) from public;
revoke all on function public.respond_renewal_action_request(uuid, text, text, text) from public;
revoke all on function public.expire_renewal_action_request(uuid) from public;
revoke all on function public.assign_contract_owner_and_expire_requests(uuid, uuid) from public;

grant execute on function public.create_renewal_action_request(uuid, date, text) to authenticated;
grant execute on function public.respond_renewal_action_request(uuid, text, text, text) to authenticated;
grant execute on function public.expire_renewal_action_request(uuid) to authenticated;
grant execute on function public.assign_contract_owner_and_expire_requests(uuid, uuid) to authenticated;
