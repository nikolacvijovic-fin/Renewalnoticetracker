do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_logs_id_organization_id_unique'
  ) then
    alter table public.notification_logs
      add constraint notification_logs_id_organization_id_unique unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'renewal_action_requests_id_organization_id_unique'
  ) then
    alter table public.renewal_action_requests
      add constraint renewal_action_requests_id_organization_id_unique unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contracts_id_organization_id_unique'
  ) then
    alter table public.contracts
      add constraint contracts_id_organization_id_unique unique (id, organization_id);
  end if;
end $$;

create table if not exists public.renewal_action_notification_payloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  notification_log_id uuid not null,
  request_id uuid not null,
  contract_id uuid not null,
  delivery_key text not null,
  template_version text not null,
  delivery_payload jsonb not null,
  payload_fingerprint text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint renewal_action_notification_payloads_notification_unique unique (notification_log_id),
  constraint renewal_action_notification_payloads_org_delivery_key_unique unique (organization_id, delivery_key),
  constraint renewal_action_notification_payloads_notification_org_fk
    foreign key (notification_log_id, organization_id)
    references public.notification_logs (id, organization_id)
    on delete cascade,
  constraint renewal_action_notification_payloads_request_org_fk
    foreign key (request_id, organization_id)
    references public.renewal_action_requests (id, organization_id)
    on delete cascade,
  constraint renewal_action_notification_payloads_contract_org_fk
    foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id)
    on delete cascade,
  constraint renewal_action_notification_payloads_template_check
    check (template_version in ('renewal_action_request_email.v2', 'renewal_action_request_email.v1_protected')),
  constraint renewal_action_notification_payloads_kind_check
    check (delivery_payload ? 'kind'),
  constraint renewal_action_notification_payloads_expiry_check
    check (expires_at > created_at)
);

alter table public.renewal_action_notification_payloads enable row level security;

create policy "deny customer reads for renewal action notification payloads"
  on public.renewal_action_notification_payloads
  for select
  using (false);

create policy "deny customer inserts for renewal action notification payloads"
  on public.renewal_action_notification_payloads
  for insert
  with check (false);

create policy "deny customer updates for renewal action notification payloads"
  on public.renewal_action_notification_payloads
  for update
  using (false)
  with check (false);

create policy "deny customer deletes for renewal action notification payloads"
  on public.renewal_action_notification_payloads
  for delete
  using (false);

revoke all on table public.renewal_action_notification_payloads from public;
revoke all on table public.renewal_action_notification_payloads from anon;
revoke all on table public.renewal_action_notification_payloads from authenticated;

create index if not exists idx_renewal_action_notification_payloads_lookup
  on public.renewal_action_notification_payloads (organization_id, notification_log_id);

create index if not exists idx_renewal_action_notification_payloads_expiry
  on public.renewal_action_notification_payloads (expires_at);

comment on table public.renewal_action_notification_payloads is
  'Protected service-role-only payload boundary for immutable renewal-action email delivery data. Customer roles cannot read this table; operational notification logs store only safe references and state.';

comment on column public.renewal_action_notification_payloads.delivery_payload is
  'Protected delivery payload required to render an idempotent renewal-action email retry. May contain recipient PII and email rendering inputs; never expose in customer exports, audit logs, beta health, or operational events.';

insert into public.renewal_action_notification_payloads (
  organization_id,
  notification_log_id,
  request_id,
  contract_id,
  delivery_key,
  template_version,
  delivery_payload,
  payload_fingerprint,
  expires_at
)
select
  nl.organization_id,
  nl.id,
  coalesce(
    case
      when (nl.provider_payload #>> '{email_delivery_snapshot,requestId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (nl.provider_payload #>> '{email_delivery_snapshot,requestId}')::uuid
      else null
    end,
    case
      when (nl.provider_payload ->> 'request_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (nl.provider_payload ->> 'request_id')::uuid
      else null
    end
  ),
  coalesce(
    case
      when (nl.provider_payload #>> '{email_delivery_snapshot,contractId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (nl.provider_payload #>> '{email_delivery_snapshot,contractId}')::uuid
      else null
    end,
    case
      when (nl.provider_payload ->> 'contract_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (nl.provider_payload ->> 'contract_id')::uuid
      else null
    end
  ),
  nl.delivery_key,
  'renewal_action_request_email.v1_protected',
  jsonb_build_object(
    'kind', 'legacy_provider_request',
    'providerRequest', nl.provider_payload #> '{email_delivery_snapshot,providerRequest}'
  ),
  md5((nl.provider_payload #> '{email_delivery_snapshot,providerRequest}')::text),
  timezone('utc', now()) + interval '48 hours'
from public.notification_logs nl
where nl.notification_kind = 'renewal_action_request'
  and nl.delivery_key is not null
  and nl.provider_payload ? 'email_delivery_snapshot'
  and nl.provider_payload #> '{email_delivery_snapshot,providerRequest}' is not null
  and coalesce(
    nl.provider_payload #>> '{email_delivery_snapshot,requestId}',
    nl.provider_payload ->> 'request_id'
  ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and coalesce(
    nl.provider_payload #>> '{email_delivery_snapshot,contractId}',
    nl.provider_payload ->> 'contract_id'
  ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (notification_log_id) do nothing;

update public.notification_logs nl
set
  recipient_email = 'protected-recipient@noticecontrol.internal',
  destination = null,
  provider_payload = jsonb_strip_nulls(jsonb_build_object(
    'request_id', p.request_id,
    'contract_id', p.contract_id,
    'requested_action', nl.provider_payload #>> '{email_delivery_snapshot,requestedAction}',
    'outbox_scope', 'internal_owner_action_request',
    'delivery_payload_ref', p.id,
    'payload_template_version', p.template_version,
    'payload_fingerprint', p.payload_fingerprint,
    'legacy_email_snapshot_transitioned', true
  ))
from public.renewal_action_notification_payloads p
where nl.id = p.notification_log_id
  and nl.organization_id = p.organization_id
  and nl.notification_kind = 'renewal_action_request'
  and nl.provider_payload ? 'email_delivery_snapshot';

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
set search_path = public, pg_temp
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

  -- The optional operator message remains on the customer-scoped action request
  -- record, but it is not copied into general notification logs or the v2 email
  -- delivery payload.
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
    'protected-recipient@noticecontrol.internal',
    'email',
    'queued',
    'renewal_action_request',
    null,
    v_delivery_key,
    jsonb_build_object(
      'request_id', id,
      'contract_id', contract_id,
      'requested_action', requested_action,
      'due_date', due_date,
      'outbox_scope', 'internal_owner_action_request',
      'delivery_payload_state', 'pending_protected_payload'
    )
  )
  on conflict (delivery_key) where delivery_key is not null do nothing;

  return next;
end;
$$;

revoke all on function public.create_renewal_action_request(uuid, date, text) from public;
revoke all on function public.create_renewal_action_request(uuid, date, text) from anon;
grant execute on function public.create_renewal_action_request(uuid, date, text) to authenticated;

comment on function public.create_renewal_action_request(uuid, date, text) is
  'Creates an internal renewal-action request and safe notification outbox row. Recipient PII and delivery rendering data are resolved by the privileged worker into renewal_action_notification_payloads, not stored in notification_logs provider_payload.';
