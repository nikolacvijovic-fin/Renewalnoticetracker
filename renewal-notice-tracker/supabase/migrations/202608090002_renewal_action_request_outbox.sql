alter table public.notification_logs
  drop constraint if exists notification_logs_notification_kind_check;

alter table public.notification_logs
  add constraint notification_logs_notification_kind_check
  check (notification_kind in ('reminder', 'monthly_digest', 'billing', 'renewal_action_request'));

alter table public.reminders
  drop constraint if exists reminders_reminder_type_check;

alter table public.reminders
  add constraint reminders_reminder_type_check
  check (
    reminder_type in (
      'notice_deadline',
      'renewal',
      'expiration',
      'decision_request',
      'acknowledgment_request',
      'internal_review_needed',
      'late_activation_action_required',
      'missed_notice_deadline',
      'custom'
    )
  );

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
  v_recipient_email text;
  v_delivery_key text;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select c.id,
         c.organization_id,
         c.owner_user_id,
         cm.notice_deadline_date,
         cm.needs_review,
         nullif(lower(trim(u.notification_email)), '') as owner_notification_email
    into v_contract
  from public.contracts c
  left join public.contract_metadata cm on cm.contract_id = c.id
  left join public.users u on u.id = c.owner_user_id
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

  if v_contract.owner_notification_email is null then
    raise exception 'Assigned owner does not have a notification email.' using errcode = '23514';
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
  v_recipient_email := v_contract.owner_notification_email;

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

  if not found then
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
  end if;

  if id is null then
    raise exception 'Renewal action request could not be created or found.' using errcode = 'P0002';
  end if;

  v_delivery_key := 'renewal_action_request:' || id::text || ':email';

  insert into public.notification_logs (
    reminder_id,
    organization_id,
    recipient_email,
    channel,
    status,
    notification_kind,
    destination,
    delivery_key,
    provider_payload
  )
  values (
    null,
    organization_id,
    v_recipient_email,
    'email',
    'queued',
    'renewal_action_request',
    v_recipient_email,
    v_delivery_key,
    jsonb_build_object(
      'request_id', id,
      'contract_id', contract_id,
      'requested_action', requested_action,
      'due_date', due_date,
      'outbox_scope', 'internal_owner_action_request'
    )
  )
  on conflict (delivery_key) where delivery_key is not null do nothing;

  return next;
end;
$$;
