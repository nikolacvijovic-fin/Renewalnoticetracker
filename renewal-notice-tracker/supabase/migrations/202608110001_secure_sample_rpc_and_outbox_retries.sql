revoke all on function public.create_sample_contract_with_metadata(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.create_sample_contract_with_metadata(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function public.create_sample_contract_with_metadata(uuid, uuid, jsonb, jsonb) from authenticated;

drop function if exists public.create_sample_contract_with_metadata(uuid, uuid, jsonb, jsonb);

create or replace function public.create_sample_contract_with_metadata(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract_id uuid;
  v_metadata_id uuid;
  v_base date := current_date;
  v_effective_date date := current_date - 320;
  v_notice_deadline_date date := current_date + 10;
  v_renewal_date date := current_date + 45;
  v_expiration_date date := current_date + 45;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select m.role
    into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
  limit 1;

  if v_role is null then
    raise exception 'Active organization membership is required.' using errcode = '42501';
  end if;

  if v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can create the onboarding sample contract.' using errcode = '42501';
  end if;

  select c.id
    into v_contract_id
  from public.contracts c
  where c.organization_id = p_organization_id
    and c.is_sample = true
    and c.status <> 'archived'
  limit 1;

  if v_contract_id is not null then
    return v_contract_id;
  end if;

  begin
    insert into public.contracts (
      organization_id,
      created_by,
      status,
      cycle_status,
      source_type,
      is_sample,
      owner_user_id,
      status_tag
    )
    values (
      p_organization_id,
      v_actor,
      'reviewed',
      'open',
      'sample',
      true,
      v_actor,
      'renewal_watch'
    )
    returning id into v_contract_id;
  exception
    when unique_violation then
      select c.id
        into v_contract_id
      from public.contracts c
      where c.organization_id = p_organization_id
        and c.is_sample = true
        and c.status <> 'archived'
      limit 1;
  end;

  if v_contract_id is null then
    raise exception 'Sample contract could not be created or found.' using errcode = 'P0002';
  end if;

  insert into public.contract_metadata (
    contract_id,
    contract_title,
    counterparty_name,
    contract_type,
    effective_date,
    renewal_date,
    expiration_date,
    auto_renewal,
    renewal_term,
    notice_period_value,
    notice_period_unit,
    notice_deadline_date,
    termination_window,
    governing_law,
    payment_terms,
    contract_value_amount,
    contract_value_currency,
    contract_value_period,
    price_change_trigger,
    payment_trigger,
    financial_data_trust_status,
    extracted_clauses,
    field_confidence,
    field_source_snippets,
    reminder_recommendations,
    needs_review,
    reviewer_notes,
    review_mode,
    review_reason,
    has_conflict,
    has_derived_date,
    has_weak_evidence,
    is_ocr_assisted,
    is_manual_without_evidence,
    changes_previously_verified_p0,
    accepted_unverified_risk_requested,
    contract_template_key,
    reviewed_at,
    reviewed_by
  )
  values (
    v_contract_id,
    'Sample SaaS Renewal Agreement',
    'Acme Analytics Cloud',
    'SaaS subscription',
    v_effective_date,
    v_renewal_date,
    v_expiration_date,
    true,
    'Annual',
    35,
    'days',
    v_notice_deadline_date,
    'Submit written opt-out notice before the fictional notice deadline.',
    null,
    'Annual prepaid',
    48000,
    'USD',
    'annual',
    null,
    null,
    'reviewed_sample',
    '[]'::jsonb,
    jsonb_build_object(
      'contract_title', 1,
      'counterparty_name', 1,
      'effective_date', 1,
      'notice_deadline_date', 1,
      'renewal_date', 1,
      'expiration_date', 1,
      'auto_renewal', 1,
      'contract_value_amount', 1,
      'contract_value_currency', 1
    ),
    jsonb_build_object(
      'contract_title', 'Synthetic sample evidence: fictional SaaS renewal agreement title.',
      'counterparty_name', 'Synthetic sample evidence: fictional vendor Acme Analytics Cloud.',
      'notice_deadline_date', 'Synthetic sample evidence: opt-out notice is due 35 days before renewal.',
      'renewal_date', 'Synthetic sample evidence: fictional renewal date is shown for the demo.',
      'expiration_date', 'Synthetic sample evidence: fictional expiration date matches the renewal date.',
      'auto_renewal', 'Synthetic sample evidence: fictional agreement auto-renews unless notice is given.',
      'contract_value_amount', 'Synthetic sample evidence: fictional annual value is 48000 USD.',
      'contract_value_currency', 'Synthetic sample evidence: fictional currency is USD.'
    ),
    '[]'::jsonb,
    false,
    null,
    'sample_reviewed',
    'Synthetic sample data for first-run onboarding.',
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    'sample_contract',
    timezone('utc', now()),
    v_actor
  )
  returning id into v_metadata_id;

  insert into public.extracted_field_evidence (
    contract_metadata_id,
    field_name,
    snippet,
    confidence,
    source
  )
  values
    (v_metadata_id, 'contract_title', 'Synthetic sample evidence: fictional SaaS renewal agreement title.', 1, 'sample'),
    (v_metadata_id, 'counterparty_name', 'Synthetic sample evidence: fictional vendor Acme Analytics Cloud.', 1, 'sample'),
    (v_metadata_id, 'notice_deadline_date', 'Synthetic sample evidence: opt-out notice is due 35 days before renewal.', 1, 'sample'),
    (v_metadata_id, 'renewal_date', 'Synthetic sample evidence: fictional renewal date is shown for the demo.', 1, 'sample'),
    (v_metadata_id, 'expiration_date', 'Synthetic sample evidence: fictional expiration date matches the renewal date.', 1, 'sample'),
    (v_metadata_id, 'auto_renewal', 'Synthetic sample evidence: fictional agreement auto-renews unless notice is given.', 1, 'sample'),
    (v_metadata_id, 'contract_value_amount', 'Synthetic sample evidence: fictional annual value is 48000 USD.', 1, 'sample'),
    (v_metadata_id, 'contract_value_currency', 'Synthetic sample evidence: fictional currency is USD.', 1, 'sample');

  return v_contract_id;
end;
$$;

revoke all on function public.create_sample_contract_with_metadata(uuid) from public;
revoke all on function public.create_sample_contract_with_metadata(uuid) from anon;
grant execute on function public.create_sample_contract_with_metadata(uuid) to authenticated;

comment on function public.create_sample_contract_with_metadata(uuid) is
  'Creates the fixed fictional onboarding sample contract, reviewed metadata, and sample evidence in one transaction. Actor is derived from auth.uid(), must be an admin/operator member of the target organization, and callers cannot supply arbitrary metadata or evidence.';

alter table public.notification_logs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 4,
  add column if not exists next_retry_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token text,
  add column if not exists last_attempt_at timestamptz;

update public.notification_logs
set next_retry_at = sent_at
where notification_kind = 'renewal_action_request'
  and status in ('queued', 'failed')
  and next_retry_at is null;

create index if not exists idx_notification_logs_renewal_action_outbox_due
  on public.notification_logs (notification_kind, status, next_retry_at, sent_at)
  where notification_kind = 'renewal_action_request';

comment on column public.notification_logs.attempt_count is
  'Outbox delivery attempts for renewal-action request notifications. Operational only; no recipient/body/provider payload should be written here.';

comment on column public.notification_logs.processing_token is
  'Opaque worker claim token for renewal-action request notification processing.';
