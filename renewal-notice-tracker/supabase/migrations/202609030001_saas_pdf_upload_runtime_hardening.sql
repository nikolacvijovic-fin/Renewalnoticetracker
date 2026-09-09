-- Production hardening for the SaaS PDF upload-to-Opt-Out Clock workflow.
-- This migration is forward-only and intentionally leaves the original
-- 202609020001 migration unchanged.

alter table public.contracts
  add column if not exists pdf_extraction_job_id uuid references public.background_jobs(id) on delete set null,
  add column if not exists pdf_upload_abandoned_at timestamptz,
  add column if not exists pdf_upload_cleaned_at timestamptz,
  add column if not exists pdf_upload_recovery_count integer not null default 0;

alter table public.contract_metadata
  add column if not exists pdf_renewal_review_reasons text[] not null default '{}';

alter table public.contracts
  drop constraint if exists contracts_pdf_upload_attempt_status_check;

alter table public.contracts
  add constraint contracts_pdf_upload_attempt_status_check
  check (
    pdf_upload_attempt_status is null
    or pdf_upload_attempt_status in (
      'processing',
      'needs_review',
      'extraction_failed',
      'failed',
      'abandoned',
      'cleaned'
    )
  );

alter table public.background_jobs
  add column if not exists lease_expires_at timestamptz;

alter table public.background_jobs
  drop constraint if exists background_jobs_job_type_check;

alter table public.background_jobs
  add constraint background_jobs_job_type_check check (
    job_type in (
      'trusted_reminder_delivery',
      'contract_import_processing',
      'contract_pdf_extraction',
      'audit_event_flush',
      'webhook_dispatch',
      'revenue_intelligence_refresh',
      'add_on_task'
    )
  );

create index if not exists idx_background_jobs_processing_lease
  on public.background_jobs(lease_expires_at)
  where status = 'processing';

alter table public.saas_opt_out_windows
  add column if not exists deadline_classification text not null default 'auto_renewal';

alter table public.saas_opt_out_windows
  drop constraint if exists saas_opt_out_windows_deadline_classification_check;

alter table public.saas_opt_out_windows
  add constraint saas_opt_out_windows_deadline_classification_check
  check (deadline_classification in ('auto_renewal', 'notice_only'));

create or replace function public.claim_saas_pdf_contract_upload(
  p_organization_id uuid,
  p_upload_attempt_id uuid,
  p_contract_title text,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract public.contracts%rowtype;
  v_organization public.organizations%rowtype;
  v_control public.design_partner_beta_controls%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_stale_before timestamptz := timezone('utc', now()) - interval '15 minutes';
  v_capacity_limit integer;
  v_capacity_count integer;
  v_requires_capacity_slot boolean := true;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_upload_attempt_id is null then
    raise exception 'PDF upload attempt id is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_contract_title), '') is null then
    raise exception 'Contract title is required.' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
  limit 1;

  if v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can upload contract PDFs.' using errcode = '42501';
  end if;
  if p_owner_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_owner_user_id
  ) then
    raise exception 'Assigned owner must belong to the active organization.' using errcode = '42501';
  end if;

  -- One organization lock serializes the capacity check with contract creation.
  perform pg_advisory_xact_lock(hashtextextended('contract-capacity:' || p_organization_id::text, 0));
  select o.* into v_organization
  from public.organizations o
  where o.id = p_organization_id
  for update;
  if v_organization.id is null then
    raise exception 'Organization is not available.' using errcode = '42501';
  end if;

  -- The attempt lock keeps replay/recovery deterministic inside the org lock.
  perform pg_advisory_xact_lock(hashtextextended('saas-pdf-upload:' || p_upload_attempt_id::text, 0));
  select c.* into v_contract
  from public.contracts c
  where c.pdf_upload_attempt_id = p_upload_attempt_id
  for update;

  if v_contract.id is not null then
    if v_contract.organization_id <> p_organization_id then
      raise exception 'PDF upload attempt is not available.' using errcode = '42501';
    end if;
    if v_contract.pdf_upload_attempt_status in ('abandoned', 'cleaned') then
      return jsonb_build_object(
        'contractId', v_contract.id,
        'status', v_contract.pdf_upload_attempt_status,
        'isNew', false,
        'claimed', false
      );
    end if;
    if v_contract.pdf_upload_attempt_status not in ('failed', 'extraction_failed')
       and not (
         v_contract.pdf_upload_attempt_status = 'processing'
         and v_contract.pdf_upload_claimed_at < v_stale_before
       ) then
      return jsonb_build_object(
        'contractId', v_contract.id,
        'status', coalesce(v_contract.pdf_upload_attempt_status, 'processing'),
        'isNew', false,
        'claimed', false
      );
    end if;
    -- A stale processing or extraction-failed attempt already occupies a paid
    -- contract slot. Only a failed placeholder, which is excluded from the
    -- count below, needs capacity restored before it can be retried.
    v_requires_capacity_slot := v_contract.pdf_upload_attempt_status = 'failed';
  end if;

  select c.* into v_control
  from public.design_partner_beta_controls c
  where c.organization_id = p_organization_id
    and c.status = 'active'
    and c.founder_approved_at is not null
    and (c.expires_at is null or c.expires_at > v_now);

  v_capacity_limit := case
    when v_control.organization_id is not null then v_control.maximum_contracts
    when (
      v_organization.subscription_status = 'active'
      or (
        v_organization.subscription_status = 'trialing'
        and (v_organization.trial_ends_at is null or v_organization.trial_ends_at >= v_now)
      )
    )
      and v_organization.plan_tier = 'growth' then 500
    when (
      v_organization.subscription_status = 'active'
      or (
        v_organization.subscription_status = 'trialing'
        and (v_organization.trial_ends_at is null or v_organization.trial_ends_at >= v_now)
      )
    )
      and v_organization.plan_tier = 'starter' then 100
    else 5
  end;

  select count(*)::integer into v_capacity_count
  from public.contracts c
  where c.organization_id = p_organization_id
    and c.status <> 'archived'
    and coalesce(c.status_tag, 'active') <> 'archived'
    and coalesce(c.pdf_upload_attempt_status, '') not in ('failed', 'abandoned', 'cleaned');

  if v_requires_capacity_slot and v_capacity_count >= v_capacity_limit then
    raise exception 'Contract tracking capacity has been reached.'
      using errcode = 'P0001', hint = 'contract_limit_reached';
  end if;

  if v_contract.id is not null then
    update public.contracts
    set pdf_upload_attempt_status = 'processing',
        pdf_upload_claimed_at = v_now,
        pdf_upload_completed_at = null,
        pdf_upload_failure_code = null,
        pdf_upload_abandoned_at = null,
        pdf_upload_cleaned_at = null,
        pdf_upload_recovery_count = coalesce(pdf_upload_recovery_count, 0) + 1,
        status = 'uploaded',
        status_tag = 'active',
        updated_at = v_now
    where id = v_contract.id
      and organization_id = p_organization_id
    returning * into v_contract;

    return jsonb_build_object(
      'contractId', v_contract.id,
      'status', v_contract.pdf_upload_attempt_status,
      'isNew', false,
      'claimed', true,
      'capacityCount', v_capacity_count,
      'capacityLimit', v_capacity_limit
    );
  end if;

  insert into public.contracts (
    organization_id, created_by, status, cycle_status, source_type,
    owner_user_id, status_tag, pdf_upload_attempt_id,
    pdf_upload_attempt_status, pdf_upload_claimed_at
  ) values (
    p_organization_id, v_actor, 'uploaded', 'open', 'upload',
    p_owner_user_id, 'active', p_upload_attempt_id, 'processing', v_now
  ) returning * into v_contract;

  return jsonb_build_object(
    'contractId', v_contract.id,
    'status', v_contract.pdf_upload_attempt_status,
    'isNew', true,
    'claimed', true,
    'capacityCount', v_capacity_count + 1,
    'capacityLimit', v_capacity_limit
  );
end;
$$;

revoke all on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  to authenticated;

create or replace function public.abandon_saas_pdf_contract_upload(
  p_organization_id uuid,
  p_upload_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract public.contracts%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id and m.user_id = v_actor
  limit 1;
  if v_actor is null or v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'PDF upload attempt is not available.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saas-pdf-upload:' || p_upload_attempt_id::text, 0));
  select c.* into v_contract
  from public.contracts c
  where c.organization_id = p_organization_id
    and c.pdf_upload_attempt_id = p_upload_attempt_id
  for update;
  if v_contract.id is null then
    raise exception 'PDF upload attempt is not available.' using errcode = '42501';
  end if;
  if v_contract.pdf_upload_attempt_status in ('abandoned', 'cleaned') then
    return jsonb_build_object(
      'contractId', v_contract.id,
      'fileId', v_contract.latest_file_id,
      'status', v_contract.pdf_upload_attempt_status,
      'replayed', true
    );
  end if;
  if v_contract.pdf_upload_attempt_status not in ('processing', 'extraction_failed', 'failed')
     or exists (
        select 1 from public.contract_metadata m
        where m.contract_id = v_contract.id
          and m.reviewed_at is not null
      )
     or exists (
       select 1 from public.saas_contract_terms t
       where t.organization_id = p_organization_id and t.contract_id = v_contract.id
     ) then
    raise exception 'Reviewed or activated contracts cannot be abandoned.' using errcode = '55000';
  end if;

  update public.contracts
  set pdf_upload_attempt_status = 'abandoned',
      pdf_upload_abandoned_at = v_now,
      pdf_upload_failure_code = 'upload_abandoned_by_user',
      status = 'archived',
      status_tag = 'archived',
      updated_at = v_now
  where id = v_contract.id;

  update public.background_jobs
  set status = 'cancelled',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      last_error_code = 'upload_abandoned_by_user',
      last_error_message = 'PDF extraction was cancelled after the upload was abandoned.',
      updated_at = v_now
  where id = v_contract.pdf_extraction_job_id
    and organization_id = p_organization_id
    and status in ('queued', 'retry_scheduled');

  insert into public.audit_logs (
    organization_id, actor_user_id, contract_id, action,
    entity_type, entity_id, details
  ) values (
    p_organization_id, v_actor, v_contract.id, 'saas.pdf_upload_abandoned',
    'contract', v_contract.id,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'contractId', v_contract.id,
      'uploadAttemptId', p_upload_attempt_id,
      'status', 'abandoned'
    )
  );

  return jsonb_build_object(
    'contractId', v_contract.id,
    'fileId', v_contract.latest_file_id,
    'status', 'abandoned',
    'replayed', false
  );
end;
$$;

revoke all on function public.abandon_saas_pdf_contract_upload(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.abandon_saas_pdf_contract_upload(uuid, uuid)
  to authenticated;

create or replace function public.rescue_stale_background_jobs(
  p_job_types text[],
  p_now timestamptz default timezone('utc', now())
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  return query
  update public.background_jobs j
  set attempts = j.attempts + 1,
      status = case
        when j.attempts + 1 >= j.max_attempts then 'dead_lettered'
        else 'retry_scheduled'
      end,
      scheduled_for = case
        when j.attempts + 1 >= j.max_attempts then j.scheduled_for
        else p_now + make_interval(secs => least(300, 15 * power(2, j.attempts)::integer))
      end,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      last_error_code = 'background_job_stale_lease',
      last_error_message = 'Background job lease expired and was recovered safely.',
      dead_lettered_at = case
        when j.attempts + 1 >= j.max_attempts then p_now
        else j.dead_lettered_at
      end,
      updated_at = p_now
  where j.status = 'processing'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= p_now
    and (p_job_types is null or j.job_type = any(p_job_types))
  returning j.*;
end;
$$;

revoke all on function public.rescue_stale_background_jobs(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.rescue_stale_background_jobs(text[], timestamptz)
  to service_role;

-- The original RPC remains as the transactional projection implementation, but
-- customer sessions must use the stricter Admin/Operator wrapper below.
revoke all on function public.activate_reviewed_contract_for_saas_clock(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.activate_reviewed_contract_for_saas_clock_v2(
  p_organization_id uuid,
  p_contract_id uuid,
  p_software_id uuid default null,
  p_create_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_contract public.contracts%rowtype;
  v_metadata public.contract_metadata%rowtype;
  v_match_count integer;
  v_existing_term public.saas_contract_terms%rowtype;
  v_result jsonb;
  v_classification text;
begin
  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id and m.user_id = v_actor
  limit 1;
  if v_actor is null or v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can activate the Opt-Out Clock.' using errcode = '42501';
  end if;

  -- Serialize the wrapper before it can bind an explicit SaaS product. The
  -- delegated projection takes the same transaction lock reentrantly.
  perform pg_advisory_xact_lock(
    hashtextextended('saas-clock-activation:' || p_organization_id::text || ':' || p_contract_id::text, 0)
  );

  select c.* into v_contract
  from public.contracts c
  where c.id = p_contract_id and c.organization_id = p_organization_id;
  if v_contract.id is null then
    raise exception 'Contract is not available in the active organization.' using errcode = '42501';
  end if;

  select m.* into v_metadata
  from public.contract_metadata m
  where m.contract_id = p_contract_id;
  if v_metadata.id is null then
    raise exception 'Contract is not available in the active organization.' using errcode = '42501';
  end if;

  select t.* into v_existing_term
  from public.saas_contract_terms t
  where t.organization_id = p_organization_id
    and t.contract_id = p_contract_id
  limit 1
  for update;

  if v_existing_term.id is null then
    select count(*)::integer into v_match_count
    from public.saas_software_inventory s
    where s.organization_id = p_organization_id
      and regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(btrim(v_metadata.contract_title)), '[^a-z0-9]+', '', 'g')
      and regexp_replace(lower(btrim(coalesce(s.vendor_name, ''))), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(btrim(v_metadata.counterparty_name)), '[^a-z0-9]+', '', 'g');

    if p_software_id is not null then
      if not exists (
        select 1 from public.saas_software_inventory s
        where s.id = p_software_id
          and s.organization_id = p_organization_id
          and regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(btrim(v_metadata.contract_title)), '[^a-z0-9]+', '', 'g')
          and regexp_replace(lower(btrim(coalesce(s.vendor_name, ''))), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(btrim(v_metadata.counterparty_name)), '[^a-z0-9]+', '', 'g')
      ) then
        raise exception 'Selected SaaS product is not a safe organization-scoped match.' using errcode = '55000';
      end if;
    elsif v_match_count = 0 and not p_create_new then
      raise exception 'Choose an existing SaaS product or explicitly create a new one.' using errcode = '55000';
    elsif v_match_count > 1 then
      raise exception 'Multiple matching SaaS records require manual selection.' using errcode = '55000';
    elsif v_match_count = 1 and p_create_new then
      raise exception 'A matching SaaS product already exists; select it instead.' using errcode = '55000';
    end if;
  elsif p_software_id is not null and v_existing_term.software_id <> p_software_id then
    raise exception 'The reviewed contract is already linked to a different SaaS product.' using errcode = '55000';
  end if;

  -- Bind an explicit organization-scoped selection before delegating to the
  -- original transactional projection. The delegated function then treats the
  -- term as an existing link and cannot silently select another product.
  if v_existing_term.id is null and p_software_id is not null then
    insert into public.saas_contract_terms (
      organization_id,
      software_id,
      contract_id,
      renewal_date,
      expiration_date,
      auto_renewal,
      notice_period_value,
      notice_period_unit,
      notice_deadline_date,
      term_summary,
      contract_value_amount,
      contract_value_currency,
      created_by
    ) values (
      p_organization_id,
      p_software_id,
      p_contract_id,
      v_metadata.renewal_date,
      v_metadata.expiration_date,
      v_metadata.auto_renewal,
      v_metadata.notice_period_value,
      v_metadata.notice_period_unit,
      v_metadata.notice_deadline_date,
      'Activated from human-reviewed contract metadata',
      v_metadata.contract_value_amount,
      upper(v_metadata.contract_value_currency),
      v_actor
    ) returning * into v_existing_term;
  end if;

  v_result := public.activate_reviewed_contract_for_saas_clock(p_organization_id, p_contract_id);
  v_classification := case when v_metadata.auto_renewal then 'auto_renewal' else 'notice_only' end;

  update public.saas_opt_out_windows w
  set deadline_classification = v_classification,
      updated_at = timezone('utc', now())
  where w.id = (v_result->>'optOutWindowId')::uuid
    and w.organization_id = p_organization_id;

  if not v_metadata.auto_renewal then
    delete from public.saas_contract_risk_findings f
    where f.organization_id = p_organization_id
      and f.contract_term_id = (v_result->>'saasTermId')::uuid
      and f.finding_type = 'auto_renewal';
  end if;

  update public.audit_logs a
  set details = coalesce(a.details, '{}'::jsonb) || jsonb_build_object(
    'deadlineClassification', v_classification
  )
  where a.organization_id = p_organization_id
    and a.contract_id = p_contract_id
    and a.action = 'saas.contract_activated_for_opt_out_clock'
    and a.entity_id = (v_result->>'saasTermId')::uuid;

  return v_result || jsonb_build_object('deadlineClassification', v_classification);
end;
$$;

revoke all on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  to authenticated;

comment on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid) is
  'Atomically enforces canonical organization contract capacity and claims one idempotent SaaS PDF upload attempt.';
comment on function public.abandon_saas_pdf_contract_upload(uuid, uuid) is
  'Archives an unreviewed processing or failed PDF placeholder and cancels queued extraction without deleting customer-reviewed data.';
comment on function public.rescue_stale_background_jobs(text[], timestamptz) is
  'Service-only stale-lease recovery with bounded retry and dead-letter behavior.';
comment on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean) is
  'Admin/Operator-only reviewed-contract projection with explicit SaaS matching and notice-only classification.';
