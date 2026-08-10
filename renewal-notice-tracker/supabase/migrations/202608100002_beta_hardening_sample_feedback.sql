create or replace function public.create_sample_contract_with_metadata(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_metadata jsonb,
  p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_id uuid;
  v_metadata_id uuid;
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
    p_actor_user_id,
    'reviewed',
    'open',
    'sample',
    true,
    p_actor_user_id,
    'renewal_watch'
  )
  returning id into v_contract_id;

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
    p_metadata->>'contract_title',
    p_metadata->>'counterparty_name',
    p_metadata->>'contract_type',
    nullif(p_metadata->>'effective_date', '')::date,
    nullif(p_metadata->>'renewal_date', '')::date,
    nullif(p_metadata->>'expiration_date', '')::date,
    coalesce((p_metadata->>'auto_renewal')::boolean, false),
    p_metadata->>'renewal_term',
    nullif(p_metadata->>'notice_period_value', '')::integer,
    p_metadata->>'notice_period_unit',
    nullif(p_metadata->>'notice_deadline_date', '')::date,
    p_metadata->>'termination_window',
    p_metadata->>'governing_law',
    p_metadata->>'payment_terms',
    nullif(p_metadata->>'contract_value_amount', '')::numeric,
    p_metadata->>'contract_value_currency',
    p_metadata->>'contract_value_period',
    p_metadata->>'price_change_trigger',
    p_metadata->>'payment_trigger',
    p_metadata->>'financial_data_trust_status',
    coalesce(p_metadata->'extracted_clauses', '[]'::jsonb),
    coalesce(p_metadata->'field_confidence', '{}'::jsonb),
    coalesce(p_metadata->'field_source_snippets', '{}'::jsonb),
    coalesce(p_metadata->'reminder_recommendations', '[]'::jsonb),
    coalesce((p_metadata->>'needs_review')::boolean, false),
    p_metadata->>'reviewer_notes',
    p_metadata->>'review_mode',
    p_metadata->>'review_reason',
    coalesce((p_metadata->>'has_conflict')::boolean, false),
    coalesce((p_metadata->>'has_derived_date')::boolean, false),
    coalesce((p_metadata->>'has_weak_evidence')::boolean, false),
    coalesce((p_metadata->>'is_ocr_assisted')::boolean, false),
    coalesce((p_metadata->>'is_manual_without_evidence')::boolean, false),
    coalesce((p_metadata->>'changes_previously_verified_p0')::boolean, false),
    coalesce((p_metadata->>'accepted_unverified_risk_requested')::boolean, false),
    p_metadata->>'contract_template_key',
    timezone('utc', now()),
    p_actor_user_id
  )
  returning id into v_metadata_id;

  insert into public.extracted_field_evidence (
    contract_metadata_id,
    field_name,
    snippet,
    confidence,
    source
  )
  select
    v_metadata_id,
    value->>'field_name',
    value->>'snippet',
    coalesce((value->>'confidence')::numeric, 1),
    coalesce(value->>'source', 'sample')
  from jsonb_array_elements(p_evidence) as value;

  return v_contract_id;
end;
$$;

comment on function public.create_sample_contract_with_metadata(uuid, uuid, jsonb, jsonb) is
  'Creates the fictional onboarding sample contract, reviewed metadata, and sample evidence in one transaction. The caller must enforce active organization, RBAC, and plan limits before invoking this RPC.';

comment on index public.idx_customer_feedback_idempotency is
  'Immediate duplicate protection only. Application idempotency keys include a short server time bucket and SHA-256 fingerprint so identical later feedback is allowed.';
