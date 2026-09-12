-- Close the final extraction/review race and reject terminated clock activation.
-- This migration is forward-only and preserves the previously deployed upload flow.

create or replace function public.persist_saas_pdf_extraction_for_review(
  p_organization_id uuid,
  p_contract_id uuid,
  p_contract_file_id uuid,
  p_upload_attempt_id uuid,
  p_job_id uuid,
  p_metadata jsonb,
  p_evidence jsonb,
  p_ocr_status text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contract public.contracts%rowtype;
  v_file public.contract_files%rowtype;
  v_existing_metadata public.contract_metadata%rowtype;
  v_input public.contract_metadata%rowtype;
  v_metadata public.contract_metadata%rowtype;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'PDF extraction metadata must be an object.' using errcode = '22023';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' then
    raise exception 'PDF extraction evidence must be an array.' using errcode = '22023';
  end if;
  if p_ocr_status not in ('completed', 'partial') then
    raise exception 'PDF extraction OCR status is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saas-pdf-upload:' || p_upload_attempt_id::text, 0)
  );

  select c.* into v_contract
  from public.contracts c
  where c.id = p_contract_id
    and c.organization_id = p_organization_id
    and c.pdf_upload_attempt_id = p_upload_attempt_id
  for update;

  if v_contract.id is null then
    return jsonb_build_object('persisted', false, 'reason', 'scoped_contract_unavailable');
  end if;

  select f.* into v_file
  from public.contract_files f
  where f.id = p_contract_file_id
    and f.contract_id = p_contract_id
  for update;

  if v_file.id is null or v_file.storage_deleted_at is not null then
    return jsonb_build_object('persisted', false, 'reason', 'scoped_file_unavailable');
  end if;

  select m.* into v_existing_metadata
  from public.contract_metadata m
  where m.contract_id = p_contract_id
  for update;

  if v_existing_metadata.id is not null and v_existing_metadata.reviewed_at is not null then
    return jsonb_build_object('persisted', false, 'reason', 'contract_reviewed');
  end if;
  if exists (
    select 1
    from public.saas_contract_terms t
    where t.organization_id = p_organization_id
      and t.contract_id = p_contract_id
  ) then
    return jsonb_build_object('persisted', false, 'reason', 'contract_activated');
  end if;
  if v_contract.pdf_upload_attempt_status <> 'processing'
     or v_contract.pdf_extraction_job_id is distinct from p_job_id then
    return jsonb_build_object('persisted', false, 'reason', 'upload_state_changed');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_evidence) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item->>'field_name', '') !~ '^[a-z][a-z0-9_]{0,63}$'
       or nullif(btrim(item->>'snippet'), '') is null
       or length(item->>'snippet') > 240
       or (
         item ? 'confidence'
         and item->>'confidence' is not null
         and item->>'confidence' !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
       )
  ) then
    raise exception 'PDF extraction evidence contains an invalid safe field.' using errcode = '22023';
  end if;

  select * into v_input
  from jsonb_populate_record(null::public.contract_metadata, p_metadata);

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
    pdf_renewal_review_reasons,
    has_conflict,
    has_derived_date,
    has_weak_evidence,
    is_ocr_assisted,
    is_manual_without_evidence,
    changes_previously_verified_p0,
    accepted_unverified_risk_requested
  ) values (
    p_contract_id,
    v_input.contract_title,
    v_input.counterparty_name,
    v_input.contract_type,
    v_input.effective_date,
    v_input.renewal_date,
    v_input.expiration_date,
    v_input.auto_renewal,
    v_input.renewal_term,
    v_input.notice_period_value,
    v_input.notice_period_unit,
    v_input.notice_deadline_date,
    v_input.termination_window,
    v_input.governing_law,
    v_input.payment_terms,
    v_input.contract_value_amount,
    v_input.contract_value_currency,
    v_input.contract_value_period,
    v_input.price_change_trigger,
    v_input.payment_trigger,
    v_input.financial_data_trust_status,
    coalesce(v_input.extracted_clauses, '[]'::jsonb),
    coalesce(v_input.field_confidence, '{}'::jsonb),
    coalesce(v_input.field_source_snippets, '{}'::jsonb),
    coalesce(v_input.reminder_recommendations, '[]'::jsonb),
    true,
    v_input.reviewer_notes,
    'exception_review',
    v_input.review_reason,
    coalesce(v_input.pdf_renewal_review_reasons, '{}'::text[]),
    coalesce(v_input.has_conflict, false),
    coalesce(v_input.has_derived_date, false),
    coalesce(v_input.has_weak_evidence, false),
    coalesce(v_input.is_ocr_assisted, false),
    false,
    false,
    false
  )
  on conflict (contract_id) do update set
    contract_title = excluded.contract_title,
    counterparty_name = excluded.counterparty_name,
    contract_type = excluded.contract_type,
    effective_date = excluded.effective_date,
    renewal_date = excluded.renewal_date,
    expiration_date = excluded.expiration_date,
    auto_renewal = excluded.auto_renewal,
    renewal_term = excluded.renewal_term,
    notice_period_value = excluded.notice_period_value,
    notice_period_unit = excluded.notice_period_unit,
    notice_deadline_date = excluded.notice_deadline_date,
    termination_window = excluded.termination_window,
    governing_law = excluded.governing_law,
    payment_terms = excluded.payment_terms,
    contract_value_amount = excluded.contract_value_amount,
    contract_value_currency = excluded.contract_value_currency,
    contract_value_period = excluded.contract_value_period,
    price_change_trigger = excluded.price_change_trigger,
    payment_trigger = excluded.payment_trigger,
    financial_data_trust_status = excluded.financial_data_trust_status,
    extracted_clauses = excluded.extracted_clauses,
    field_confidence = excluded.field_confidence,
    field_source_snippets = excluded.field_source_snippets,
    reminder_recommendations = excluded.reminder_recommendations,
    needs_review = true,
    reviewer_notes = excluded.reviewer_notes,
    review_mode = 'exception_review',
    review_reason = excluded.review_reason,
    pdf_renewal_review_reasons = excluded.pdf_renewal_review_reasons,
    has_conflict = excluded.has_conflict,
    has_derived_date = excluded.has_derived_date,
    has_weak_evidence = excluded.has_weak_evidence,
    is_ocr_assisted = excluded.is_ocr_assisted,
    is_manual_without_evidence = false,
    changes_previously_verified_p0 = false,
    accepted_unverified_risk_requested = false,
    updated_at = timezone('utc', now())
  returning * into v_metadata;

  delete from public.extracted_field_evidence e
  where e.contract_metadata_id = v_metadata.id;

  insert into public.extracted_field_evidence (
    contract_metadata_id,
    field_name,
    snippet,
    confidence,
    source
  )
  select
    v_metadata.id,
    item->>'field_name',
    btrim(item->>'snippet'),
    case when item->>'confidence' is null then null else (item->>'confidence')::numeric end,
    'extraction'
  from jsonb_array_elements(p_evidence) item;

  update public.contract_files f
  set extraction_error = null,
      extraction_source = 'page_aware',
      ocr_status = p_ocr_status
  where f.id = p_contract_file_id
    and f.contract_id = p_contract_id
    and f.storage_deleted_at is null;

  update public.contracts c
  set status = 'needs_review',
      pdf_upload_attempt_status = 'needs_review',
      pdf_upload_completed_at = p_completed_at,
      pdf_upload_failure_code = null,
      updated_at = timezone('utc', now())
  where c.id = p_contract_id
    and c.organization_id = p_organization_id
    and c.pdf_upload_attempt_id = p_upload_attempt_id
    and c.pdf_upload_attempt_status = 'processing'
    and c.pdf_extraction_job_id = p_job_id;

  if not found then
    raise exception 'PDF extraction state changed during guarded persistence.' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'persisted', true,
    'contractId', p_contract_id,
    'contractFileId', p_contract_file_id,
    'metadataId', v_metadata.id,
    'status', 'needs_review'
  );
end;
$$;

revoke all on function public.persist_saas_pdf_extraction_for_review(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.persist_saas_pdf_extraction_for_review(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, timestamptz)
  to service_role;

comment on function public.persist_saas_pdf_extraction_for_review(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, timestamptz) is
  'Atomically persists proposed PDF metadata and bounded evidence only while the scoped contract remains unreviewed, unactivated, and owned by the active extraction job.';

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
  v_selected_software_id uuid;
  v_wrapper_created_software boolean := false;
  v_wrapper_created_term boolean := false;
begin
  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id and m.user_id = v_actor
  limit 1;
  if v_actor is null or v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can activate the Opt-Out Clock.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saas-clock-activation:' || p_organization_id::text || ':' || p_contract_id::text, 0)
  );

  select c.* into v_contract
  from public.contracts c
  where c.id = p_contract_id and c.organization_id = p_organization_id;
  if v_contract.id is null then
    raise exception 'Contract is not available in the active organization.' using errcode = '42501';
  end if;
  if v_contract.status = 'archived' or v_contract.status_tag = 'terminated' then
    raise exception 'Terminated contracts cannot be activated for the Opt-Out Clock.' using errcode = '55000';
  end if;

  select m.* into v_metadata
  from public.contract_metadata m
  where m.contract_id = p_contract_id;
  if v_metadata.id is null then
    raise exception 'Contract metadata must be extracted and reviewed before activation.' using errcode = '55000';
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
      and s.status = 'active'
      and regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(btrim(v_metadata.contract_title)), '[^a-z0-9]+', '', 'g')
      and regexp_replace(lower(btrim(coalesce(s.vendor_name, ''))), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(btrim(v_metadata.counterparty_name)), '[^a-z0-9]+', '', 'g');

    if p_software_id is not null then
      if not exists (
        select 1 from public.saas_software_inventory s
        where s.id = p_software_id
          and s.organization_id = p_organization_id
          and s.status = 'active'
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

    if p_software_id is not null then
      v_selected_software_id := p_software_id;
    elsif v_match_count = 1 then
      select s.id into v_selected_software_id
      from public.saas_software_inventory s
      where s.organization_id = p_organization_id
        and s.status = 'active'
        and regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(btrim(v_metadata.contract_title)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(btrim(coalesce(s.vendor_name, ''))), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(btrim(v_metadata.counterparty_name)), '[^a-z0-9]+', '', 'g')
      limit 1;
    elsif p_create_new then
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
      ) returning id into v_selected_software_id;
      v_wrapper_created_software := true;
    end if;
  elsif p_software_id is not null and v_existing_term.software_id <> p_software_id then
    raise exception 'The reviewed contract is already linked to a different SaaS product.' using errcode = '55000';
  end if;

  if v_existing_term.id is null and v_selected_software_id is not null then
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
      v_selected_software_id,
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
    v_wrapper_created_term := true;
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
    'deadlineClassification', v_classification,
    'createdSoftware', coalesce((a.details->>'createdSoftware')::boolean, false) or v_wrapper_created_software,
    'createdTerm', coalesce((a.details->>'createdTerm')::boolean, false) or v_wrapper_created_term
  )
  where a.organization_id = p_organization_id
    and a.contract_id = p_contract_id
    and a.action = 'saas.contract_activated_for_opt_out_clock'
    and a.entity_id = (v_result->>'saasTermId')::uuid;

  return v_result || jsonb_build_object(
    'deadlineClassification', v_classification,
    'createdSoftware', coalesce((v_result->>'createdSoftware')::boolean, false) or v_wrapper_created_software,
    'createdTerm', coalesce((v_result->>'createdTerm')::boolean, false) or v_wrapper_created_term
  );
end;
$$;

revoke all on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  to authenticated;

comment on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean) is
  'Admin/Operator-only reviewed-contract projection that rejects archived or canonically terminated contracts.';
