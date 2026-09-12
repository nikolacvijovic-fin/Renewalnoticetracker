-- Forward-only: recover interrupted intake without reclaiming a live extraction job.
-- The public wrapper continues to enforce beta state before calling this core.

create or replace function public.claim_saas_pdf_contract_upload_core(
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
    if exists (
         select 1 from public.contract_metadata m
         where m.contract_id = v_contract.id and m.reviewed_at is not null
       ) or exists (
         select 1 from public.saas_contract_terms t
         where t.organization_id = p_organization_id and t.contract_id = v_contract.id
       ) then
      return jsonb_build_object(
        'contractId', v_contract.id,
        'status', coalesce(v_contract.pdf_upload_attempt_status, 'needs_review'),
        'isNew', false,
        'claimed', false
      );
    end if;
    if v_contract.pdf_upload_attempt_status not in ('failed', 'extraction_failed')
       and not (
         v_contract.pdf_upload_attempt_status = 'processing'
         and coalesce(v_contract.pdf_upload_claimed_at, '-infinity'::timestamptz) < v_stale_before
         and not exists (
           select 1 from public.background_jobs j
           where j.id = v_contract.pdf_extraction_job_id
             and j.organization_id = p_organization_id
             and j.contract_id = v_contract.id
             and (j.status in ('queued', 'retry_scheduled')
               or (j.status = 'processing' and j.lease_expires_at > v_now))
         )
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

revoke all on function public.claim_saas_pdf_contract_upload_core(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
