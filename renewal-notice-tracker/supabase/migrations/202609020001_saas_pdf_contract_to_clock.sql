-- Durable PDF upload attempts and explicit reviewed-contract activation for the
-- SaaS Opt-Out Clock. Provider extraction remains outside these RPCs; neither
-- function accepts contract text, evidence snippets, or provider payloads.

alter table public.contracts
  add column if not exists pdf_upload_attempt_id uuid,
  add column if not exists pdf_upload_attempt_status text,
  add column if not exists pdf_upload_claimed_at timestamptz,
  add column if not exists pdf_upload_completed_at timestamptz,
  add column if not exists pdf_upload_failure_code text;

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
      'failed'
    )
  );

create unique index if not exists contracts_pdf_upload_attempt_id_unique_idx
  on public.contracts (pdf_upload_attempt_id)
  where pdf_upload_attempt_id is not null;

create index if not exists contracts_org_pdf_upload_status_idx
  on public.contracts (organization_id, pdf_upload_attempt_status, pdf_upload_claimed_at desc)
  where pdf_upload_attempt_id is not null;

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
  v_now timestamptz := timezone('utc', now());
  v_stale_before timestamptz := timezone('utc', now()) - interval '15 minutes';
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

  perform pg_advisory_xact_lock(hashtextextended('saas-pdf-upload:' || p_upload_attempt_id::text, 0));

  select c.* into v_contract
  from public.contracts c
  where c.pdf_upload_attempt_id = p_upload_attempt_id
  for update;

  if v_contract.id is not null then
    if v_contract.organization_id <> p_organization_id then
      raise exception 'PDF upload attempt is not available.' using errcode = '42501';
    end if;

    if v_contract.pdf_upload_attempt_status = 'failed'
       or (
         v_contract.pdf_upload_attempt_status = 'processing'
         and v_contract.pdf_upload_claimed_at < v_stale_before
       ) then
      update public.contracts
      set pdf_upload_attempt_status = 'processing',
          pdf_upload_claimed_at = v_now,
          pdf_upload_failure_code = null,
          updated_at = v_now
      where id = v_contract.id
        and organization_id = p_organization_id
      returning * into v_contract;

      return jsonb_build_object(
        'contractId', v_contract.id,
        'status', v_contract.pdf_upload_attempt_status,
        'isNew', false,
        'claimed', true
      );
    end if;

    return jsonb_build_object(
      'contractId', v_contract.id,
      'status', coalesce(v_contract.pdf_upload_attempt_status, 'processing'),
      'isNew', false,
      'claimed', false
    );
  end if;

  insert into public.contracts (
    organization_id,
    created_by,
    status,
    cycle_status,
    source_type,
    owner_user_id,
    status_tag,
    pdf_upload_attempt_id,
    pdf_upload_attempt_status,
    pdf_upload_claimed_at
  ) values (
    p_organization_id,
    v_actor,
    'uploaded',
    'open',
    'upload',
    p_owner_user_id,
    'active',
    p_upload_attempt_id,
    'processing',
    v_now
  )
  returning * into v_contract;

  return jsonb_build_object(
    'contractId', v_contract.id,
    'status', v_contract.pdf_upload_attempt_status,
    'isNew', true,
    'claimed', true
  );
end;
$$;

revoke all on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  to authenticated;

create or replace function public.activate_reviewed_contract_for_saas_clock(
  p_organization_id uuid,
  p_contract_id uuid
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
  v_software public.saas_software_inventory%rowtype;
  v_term public.saas_contract_terms%rowtype;
  v_window public.saas_opt_out_windows%rowtype;
  v_matching_software_count integer := 0;
  v_existing_term_count integer := 0;
  v_existing_window_count integer := 0;
  v_created_software boolean := false;
  v_created_term boolean := false;
  v_created_window boolean := false;
  v_deadline date;
  v_window_status text;
  v_workflow_status text;
  v_now timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
  limit 1;

  if v_role is null or v_role not in ('admin', 'operator', 'reviewer') then
    raise exception 'Only review-capable organization roles can activate the Opt-Out Clock.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saas-clock-activation:' || p_organization_id::text || ':' || p_contract_id::text, 0)
  );

  select c.* into v_contract
  from public.contracts c
  where c.id = p_contract_id
    and c.organization_id = p_organization_id
  for update;

  if v_contract.id is null then
    raise exception 'Contract is not available in the active organization.' using errcode = '42501';
  end if;

  if v_contract.status = 'archived' or v_contract.status_tag = 'archived' then
    raise exception 'Archived contracts cannot be activated for the Opt-Out Clock.' using errcode = '55000';
  end if;

  select cm.* into v_metadata
  from public.contract_metadata cm
  where cm.contract_id = p_contract_id
  for update;

  if v_metadata.id is null then
    raise exception 'Contract metadata must be extracted and reviewed before activation.' using errcode = '55000';
  end if;

  if v_metadata.needs_review
     or v_metadata.reviewed_at is null
     or v_metadata.reviewed_by is null then
    raise exception 'Contract metadata still requires human review.' using errcode = '55000';
  end if;

  if v_metadata.notice_deadline_date is null
     or v_metadata.deadline_verified_at is null then
    raise exception 'A human-verified notice deadline is required before activation.' using errcode = '55000';
  end if;

  if v_metadata.auto_renewal is null then
    raise exception 'Auto-renewal must be reviewed before activation.' using errcode = '55000';
  end if;

  if nullif(btrim(v_metadata.contract_title), '') is null
     or nullif(btrim(v_metadata.counterparty_name), '') is null then
    raise exception 'Contract title and vendor are required before activation.' using errcode = '55000';
  end if;

  if (v_metadata.contract_value_amount is null) <> (v_metadata.contract_value_currency is null) then
    raise exception 'Contract amount and currency must be reviewed together.' using errcode = '55000';
  end if;

  if v_metadata.contract_value_currency is not null
     and upper(v_metadata.contract_value_currency) !~ '^[A-Z]{3}$' then
    raise exception 'Contract currency must be a three-letter code.' using errcode = '22023';
  end if;

  if v_contract.owner_user_id is null or not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = v_contract.owner_user_id
  ) then
    raise exception 'An active organization owner is required before activation.' using errcode = '55000';
  end if;

  select count(*) into v_existing_term_count
  from public.saas_contract_terms t
  where t.organization_id = p_organization_id
    and t.contract_id = p_contract_id;

  if v_existing_term_count > 1 then
    raise exception 'Multiple linked SaaS terms require manual review before activation.' using errcode = '55000';
  end if;

  select t.* into v_term
  from public.saas_contract_terms t
  where t.organization_id = p_organization_id
    and t.contract_id = p_contract_id
  limit 1
  for update;

  if v_term.id is not null then
    select s.* into v_software
    from public.saas_software_inventory s
    where s.id = v_term.software_id
      and s.organization_id = p_organization_id;

    if v_software.id is null then
      raise exception 'Existing SaaS term is not valid for the active organization.' using errcode = '42501';
    end if;
  else
    select count(*) into v_matching_software_count
    from public.saas_software_inventory s
    where s.organization_id = p_organization_id
      and lower(btrim(s.name)) = lower(btrim(v_metadata.contract_title))
      and lower(btrim(coalesce(s.vendor_name, ''))) = lower(btrim(v_metadata.counterparty_name));

    if v_matching_software_count > 1 then
      raise exception 'Multiple matching SaaS records require manual review before activation.' using errcode = '55000';
    end if;

    select s.* into v_software
    from public.saas_software_inventory s
    where s.organization_id = p_organization_id
      and lower(btrim(s.name)) = lower(btrim(v_metadata.contract_title))
      and lower(btrim(coalesce(s.vendor_name, ''))) = lower(btrim(v_metadata.counterparty_name))
    limit 1
    for update;

    if v_software.id is null then
      insert into public.saas_software_inventory (
        organization_id,
        name,
        vendor_name,
        owner_user_id,
        status,
        source_contract_id,
        created_by
      ) values (
        p_organization_id,
        btrim(v_metadata.contract_title),
        btrim(v_metadata.counterparty_name),
        v_contract.owner_user_id,
        'active',
        p_contract_id,
        v_actor
      ) returning * into v_software;
      v_created_software := true;
    end if;

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
      v_software.id,
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
    ) returning * into v_term;
    v_created_term := true;
  end if;

  if v_term.renewal_date is distinct from v_metadata.renewal_date
     or v_term.expiration_date is distinct from v_metadata.expiration_date
     or v_term.notice_deadline_date is distinct from v_metadata.notice_deadline_date
     or v_term.auto_renewal is distinct from v_metadata.auto_renewal
     or v_term.contract_value_amount is distinct from v_metadata.contract_value_amount
     or upper(v_term.contract_value_currency) is distinct from upper(v_metadata.contract_value_currency) then
    raise exception 'Existing SaaS term conflicts with reviewed contract metadata.' using errcode = '55000';
  end if;

  v_deadline := v_metadata.notice_deadline_date;
  v_window_status := case when v_deadline < current_date then 'expired' else 'open' end;
  v_workflow_status := case
    when v_deadline < current_date then 'decision_needed'
    when v_deadline <= current_date + 60 then 'decision_needed'
    else 'ready'
  end;

  select count(*) into v_existing_window_count
  from public.saas_opt_out_windows w
  where w.organization_id = p_organization_id
    and w.contract_term_id = v_term.id;

  if v_existing_window_count > 1 then
    raise exception 'Multiple linked opt-out windows require manual review before activation.' using errcode = '55000';
  end if;

  select w.* into v_window
  from public.saas_opt_out_windows w
  where w.organization_id = p_organization_id
    and w.contract_term_id = v_term.id
  limit 1
  for update;

  if v_window.id is null then
    insert into public.saas_opt_out_windows (
      organization_id,
      software_id,
      contract_term_id,
      opt_out_deadline,
      window_closes_on,
      status,
      source,
      owner_user_id,
      workflow_status
    ) values (
      p_organization_id,
      v_software.id,
      v_term.id,
      v_deadline,
      v_deadline,
      v_window_status,
      'explicit',
      v_contract.owner_user_id,
      v_workflow_status
    ) returning * into v_window;
    v_created_window := true;
  elsif v_window.opt_out_deadline is distinct from v_deadline
     or v_window.software_id <> v_software.id then
    raise exception 'Existing opt-out window conflicts with reviewed contract metadata.' using errcode = '55000';
  end if;

  if v_metadata.auto_renewal then
    insert into public.saas_contract_risk_findings (
      organization_id, software_id, contract_term_id, opt_out_window_id,
      finding_type, severity, evidence_json
    ) select
      p_organization_id, v_software.id, v_term.id, v_window.id,
      'auto_renewal', 'high', jsonb_build_object('auto_renewal', true)
    where not exists (
      select 1 from public.saas_contract_risk_findings f
      where f.organization_id = p_organization_id
        and f.contract_term_id = v_term.id
        and f.finding_type = 'auto_renewal'
    );
  end if;

  if v_deadline < current_date then
    insert into public.saas_contract_risk_findings (
      organization_id, software_id, contract_term_id, opt_out_window_id,
      finding_type, severity, evidence_json
    ) select
      p_organization_id, v_software.id, v_term.id, v_window.id,
      'expired_opt_out', 'critical', jsonb_build_object('deadline_window', 'expired')
    where not exists (
      select 1 from public.saas_contract_risk_findings f
      where f.organization_id = p_organization_id
        and f.contract_term_id = v_term.id
        and f.finding_type = 'expired_opt_out'
    );
  elsif v_deadline <= current_date + 14 then
    insert into public.saas_contract_risk_findings (
      organization_id, software_id, contract_term_id, opt_out_window_id,
      finding_type, severity, evidence_json
    ) select
      p_organization_id, v_software.id, v_term.id, v_window.id,
      'critical_opt_out', 'critical', jsonb_build_object('deadline_window', 'due_14_days')
    where not exists (
      select 1 from public.saas_contract_risk_findings f
      where f.organization_id = p_organization_id
        and f.contract_term_id = v_term.id
        and f.finding_type = 'critical_opt_out'
    );
  elsif v_deadline <= current_date + 60 then
    insert into public.saas_contract_risk_findings (
      organization_id, software_id, contract_term_id, opt_out_window_id,
      finding_type, severity, evidence_json
    ) select
      p_organization_id, v_software.id, v_term.id, v_window.id,
      'deadline_soon', 'high', jsonb_build_object('deadline_window', 'due_60_days')
    where not exists (
      select 1 from public.saas_contract_risk_findings f
      where f.organization_id = p_organization_id
        and f.contract_term_id = v_term.id
        and f.finding_type = 'deadline_soon'
    );
  end if;

  if v_metadata.contract_value_amount is not null
     and v_metadata.contract_value_amount >= 25000 then
    insert into public.saas_contract_risk_findings (
      organization_id, software_id, contract_term_id, opt_out_window_id,
      finding_type, severity, evidence_json
    ) select
      p_organization_id, v_software.id, v_term.id, v_window.id,
      'high_spend_at_risk', 'high',
      jsonb_build_object(
        'amount', v_metadata.contract_value_amount,
        'currency', upper(v_metadata.contract_value_currency)
      )
    where not exists (
      select 1 from public.saas_contract_risk_findings f
      where f.organization_id = p_organization_id
        and f.contract_term_id = v_term.id
        and f.finding_type = 'high_spend_at_risk'
    );
  end if;

  if v_created_term or v_created_window then
    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      contract_id,
      action,
      entity_type,
      entity_id,
      details
    ) values (
      p_organization_id,
      v_actor,
      p_contract_id,
      'saas.contract_activated_for_opt_out_clock',
      'saas_contract_term',
      v_term.id,
      jsonb_build_object(
        'organizationId', p_organization_id,
        'contractId', p_contract_id,
        'softwareId', v_software.id,
        'saasTermId', v_term.id,
        'optOutWindowId', v_window.id,
        'deadlineWindow', case
          when v_deadline < current_date then 'expired'
          when v_deadline <= current_date + 7 then 'due_7_days'
          when v_deadline <= current_date + 30 then 'due_30_days'
          when v_deadline <= current_date + 60 then 'due_60_days'
          else 'future'
        end,
        'createdSoftware', v_created_software,
        'createdTerm', v_created_term,
        'createdWindow', v_created_window
      )
    );
  end if;

  return jsonb_build_object(
    'contractId', p_contract_id,
    'softwareId', v_software.id,
    'saasTermId', v_term.id,
    'optOutWindowId', v_window.id,
    'optOutDeadline', v_deadline,
    'replayed', not (v_created_term or v_created_window),
    'createdSoftware', v_created_software,
    'createdTerm', v_created_term,
    'createdWindow', v_created_window
  );
end;
$$;

revoke all on function public.activate_reviewed_contract_for_saas_clock(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.activate_reviewed_contract_for_saas_clock(uuid, uuid)
  to authenticated;

comment on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid) is
  'Claims one globally unique client upload attempt for an authorized organization and safely recovers failed or stale processing attempts.';

comment on function public.activate_reviewed_contract_for_saas_clock(uuid, uuid) is
  'Atomically projects human-reviewed contract metadata into idempotent, organization-scoped SaaS Opt-Out Clock records.';
