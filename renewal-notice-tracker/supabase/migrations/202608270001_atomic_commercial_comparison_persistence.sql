-- Persist a complete commercial comparison as one idempotent transaction.

alter table public.renewal_quote_comparisons
  add column if not exists idempotency_key text null;

create unique index if not exists renewal_quote_comparisons_idempotency_idx
  on public.renewal_quote_comparisons (organization_id, contract_id, idempotency_key)
  where idempotency_key is not null;

alter table public.contract_commercial_baseline_line_items
  add column if not exists one_time_amount numeric not null default 0 check (one_time_amount >= 0);

alter table public.renewal_quote_proposal_line_items
  add column if not exists one_time_amount numeric not null default 0 check (one_time_amount >= 0);

alter table public.renewal_quote_cost_bridges
  add column if not exists current_one_time_cost numeric null,
  add column if not exists proposed_one_time_cost numeric null,
  add column if not exists current_commitment_cost numeric null,
  add column if not exists proposed_commitment_cost numeric null,
  add column if not exists recurring_delta numeric null,
  add column if not exists one_time_delta numeric null,
  add column if not exists attributed_recurring_delta numeric null,
  add column if not exists attributed_one_time_delta numeric null,
  add column if not exists residual_recurring_amount numeric null,
  add column if not exists residual_one_time_amount numeric null;

create or replace function public.persist_commercial_comparison_transaction(
  p_organization_id uuid,
  p_contract_id uuid,
  p_actor_user_id uuid,
  p_baseline_id uuid,
  p_quote_file_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_comparison_id uuid;
  v_proposal_version_id uuid;
  v_proposal_version integer;
  v_existing record;
  v_source text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 32 then
    raise exception 'commercial comparison idempotency key is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'commercial comparison payload must be an object' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  ) then
    raise exception 'commercial comparison actor is not authorized for organization' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contracts c
    where c.id = p_contract_id and c.organization_id = p_organization_id
  ) then
    raise exception 'commercial comparison contract organization mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contract_commercial_baselines b
    where b.id = p_baseline_id
      and b.contract_id = p_contract_id
      and b.organization_id = p_organization_id
  ) then
    raise exception 'commercial comparison baseline organization mismatch' using errcode = '42501';
  end if;
  if p_quote_file_id is not null and not exists (
    select 1 from public.contract_files f
    join public.contracts c on c.id = f.contract_id
    where f.id = p_quote_file_id
      and c.id = p_contract_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'commercial comparison proposal file organization mismatch' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_contract_id::text, 0));

  select c.id, c.proposal_version_id into v_existing
  from public.renewal_quote_comparisons c
  where c.organization_id = p_organization_id
    and c.contract_id = p_contract_id
    and c.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'comparisonId', v_existing.id,
      'proposalVersionId', v_existing.proposal_version_id,
      'isNew', false
    );
  end if;

  v_source := coalesce(p_payload #>> '{comparison,source}', 'manual');
  if v_source not in ('manual', 'file_upload', 'python_intelligence') then
    raise exception 'invalid commercial comparison source' using errcode = '22023';
  end if;

  insert into public.renewal_quote_comparisons (
    organization_id, contract_id, quote_file_id, status, source, requested_by_user_id,
    current_total_amount, proposed_total_amount, currency, price_delta_amount,
    overall_risk_level, recommendation_summary, warning_codes, baseline_id,
    calculation_version, taxonomy_version, cost_bridge_status, evidence_fingerprint,
    idempotency_key
  ) values (
    p_organization_id, p_contract_id, p_quote_file_id,
    coalesce(p_payload #>> '{comparison,status}', 'failed'), v_source, p_actor_user_id,
    (p_payload #>> '{comparison,currentTotalAmount}')::numeric,
    (p_payload #>> '{comparison,proposedTotalAmount}')::numeric,
    p_payload #>> '{comparison,currency}',
    (p_payload #>> '{comparison,priceDeltaAmount}')::numeric,
    coalesce(p_payload #>> '{comparison,overallRiskLevel}', 'unknown'),
    p_payload #>> '{comparison,recommendationSummary}',
    coalesce(array(select jsonb_array_elements_text(p_payload #> '{comparison,warningCodes}')), '{}'),
    p_baseline_id,
    p_payload #>> '{comparison,calculationVersion}',
    p_payload #>> '{comparison,taxonomyVersion}',
    p_payload #>> '{comparison,costBridgeStatus}',
    p_payload #>> '{comparison,evidenceFingerprint}',
    p_idempotency_key
  ) returning id into v_comparison_id;

  select coalesce(max(version), 0) + 1 into v_proposal_version
  from public.renewal_quote_proposal_versions
  where organization_id = p_organization_id and contract_id = p_contract_id;

  insert into public.renewal_quote_proposal_versions (
    organization_id, contract_id, comparison_id, quote_file_id, extraction_run_id,
    version, document_type, review_status, terms_snapshot, evidence_field_ids,
    evidence_fingerprint, missing_data_warnings
  ) values (
    p_organization_id, p_contract_id, v_comparison_id, p_quote_file_id,
    nullif(p_payload #>> '{proposal,extractionRunId}', '')::uuid,
    v_proposal_version, p_payload #>> '{proposal,documentType}',
    'pending_review', coalesce(p_payload #> '{proposal,termsSnapshot}', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(p_payload #> '{proposal,evidenceFieldIds}'))::uuid[], '{}'),
    p_payload #>> '{proposal,evidenceFingerprint}',
    coalesce(array(select jsonb_array_elements_text(p_payload #> '{proposal,warningCodes}')), '{}')
  ) returning id into v_proposal_version_id;

  insert into public.renewal_quote_proposal_line_items (
    organization_id, contract_id, proposal_version_id, line_key, product_name, sku,
    charge_type, pricing_model, billing_period, quantity, unit_price, total_amount,
    one_time_amount, annualized_amount, total_commitment_amount, currency, term_months,
    service_period_months, discount_amount, discount_percent, evidence_field_ids,
    citations, warning_codes
  )
  select p_organization_id, p_contract_id, v_proposal_version_id,
    item->>'lineKey', item->>'productName', item->>'sku', item->>'chargeType',
    item->>'pricingModel', item->>'billingPeriod', (item->>'quantity')::numeric,
    (item->>'unitPrice')::numeric, (item->>'totalAmount')::numeric,
    coalesce((item->>'oneTimeAmount')::numeric, 0), (item->>'annualizedAmount')::numeric,
    (item->>'totalCommitmentAmount')::numeric, item->>'currency',
    (item->>'termMonths')::integer, (item->>'servicePeriodMonths')::numeric,
    (item->>'discountAmount')::numeric, (item->>'discountPercent')::numeric,
    coalesce(array(select jsonb_array_elements_text(item->'evidenceFieldIds'))::uuid[], '{}'),
    coalesce(item->'citations', '[]'::jsonb),
    coalesce(array(select jsonb_array_elements_text(item->'warningCodes')), '{}')
  from jsonb_array_elements(coalesce(p_payload->'proposalLines', '[]'::jsonb)) item;

  insert into public.renewal_quote_cost_bridges (
    organization_id, contract_id, comparison_id, baseline_id, proposal_version_id,
    status, currency, current_annual_cost, proposed_annual_cost, current_one_time_cost,
    proposed_one_time_cost, current_commitment_cost, proposed_commitment_cost,
    attributed_delta, residual_amount, recurring_delta, one_time_delta,
    attributed_recurring_delta, attributed_one_time_delta, residual_recurring_amount,
    residual_one_time_amount, components, explanation, limitation_codes,
    calculation_version, evidence_fingerprint
  ) values (
    p_organization_id, p_contract_id, v_comparison_id, p_baseline_id, v_proposal_version_id,
    p_payload #>> '{bridge,status}', p_payload #>> '{bridge,currency}',
    (p_payload #>> '{bridge,currentAnnualCost}')::numeric,
    (p_payload #>> '{bridge,proposedAnnualCost}')::numeric,
    (p_payload #>> '{bridge,currentOneTimeCost}')::numeric,
    (p_payload #>> '{bridge,proposedOneTimeCost}')::numeric,
    (p_payload #>> '{bridge,currentCommitmentCost}')::numeric,
    (p_payload #>> '{bridge,proposedCommitmentCost}')::numeric,
    (p_payload #>> '{bridge,attributedDelta}')::numeric,
    (p_payload #>> '{bridge,residualAmount}')::numeric,
    (p_payload #>> '{bridge,recurringDelta}')::numeric,
    (p_payload #>> '{bridge,oneTimeDelta}')::numeric,
    (p_payload #>> '{bridge,attributedRecurringDelta}')::numeric,
    (p_payload #>> '{bridge,attributedOneTimeDelta}')::numeric,
    (p_payload #>> '{bridge,residualRecurringAmount}')::numeric,
    (p_payload #>> '{bridge,residualOneTimeAmount}')::numeric,
    coalesce(p_payload #> '{bridge,components}', '[]'::jsonb),
    p_payload #>> '{bridge,explanation}',
    coalesce(array(select jsonb_array_elements_text(p_payload #> '{bridge,limitations}')), '{}'),
    p_payload #>> '{bridge,calculationVersion}',
    p_payload #>> '{bridge,evidenceFingerprint}'
  );

  insert into public.renewal_quote_comparison_findings (
    organization_id, contract_id, comparison_id, finding_type, reason_code, severity,
    title, description, current_value, proposed_value, delta_value, absolute_delta,
    percentage_delta, annualized_impact, total_commitment_impact, confidence,
    current_evidence_field_ids, proposed_evidence_field_ids, limitation_codes,
    calculation_version, taxonomy_version, status
  )
  select p_organization_id, p_contract_id, v_comparison_id,
    item->>'findingType', item->>'reasonCode', item->>'severity', item->>'title',
    item->>'description', item->'currentValue', item->'proposedValue',
    jsonb_build_object('amount', item->'absoluteDelta', 'percent', item->'percentageDelta'),
    (item->>'absoluteDelta')::numeric, (item->>'percentageDelta')::numeric,
    (item->>'annualizedImpact')::numeric, (item->>'totalCommitmentImpact')::numeric,
    (item->>'confidence')::numeric,
    coalesce(array(select jsonb_array_elements_text(item->'currentEvidenceIds'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(item->'proposedEvidenceIds'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(item->'limitations')), '{}'),
    item->>'calculationVersion', item->>'taxonomyVersion', 'open'
  from jsonb_array_elements(coalesce(p_payload->'findings', '[]'::jsonb)) item;

  insert into public.savings_opportunities (
    organization_id, contract_id, comparison_id, opportunity_type, title,
    estimated_savings_amount, estimated_savings_low, estimated_savings_high,
    currency, confidence, evidence_completeness, rationale, assumptions,
    missing_evidence, action_deadline, estimate_status, evidence
  )
  select p_organization_id, p_contract_id, v_comparison_id,
    item->>'type', item->>'recommendedAction', (item->>'highSavingsAmount')::numeric,
    (item->>'lowSavingsAmount')::numeric, (item->>'highSavingsAmount')::numeric,
    item->>'currency', case when item->>'evidenceCompleteness' = 'complete' then 0.9 else 0.5 end,
    item->>'evidenceCompleteness', item->>'rationale',
    coalesce(array(select jsonb_array_elements_text(item->'assumptions')), '{}'),
    coalesce(array(select jsonb_array_elements_text(item->'missingEvidence')), '{}'),
    nullif(item->>'actionDeadline', '')::date, 'estimated',
    jsonb_build_object('supportingFindingReasonCodes', coalesce(item->'supportingFindingReasonCodes', '[]'::jsonb))
  from jsonb_array_elements(coalesce(p_payload->'opportunities', '[]'::jsonb)) item;

  insert into public.renewal_quote_scenarios (
    organization_id, contract_id, comparison_id, scenario_type, status, annual_cost,
    first_year_effect, multi_year_commitment, transition_cost, estimated_savings_low,
    estimated_savings_high, major_risks, evidence_fingerprint, calculation_version
  )
  select p_organization_id, p_contract_id, v_comparison_id,
    item->>'type', item->>'status', (item->>'annualCost')::numeric,
    (item->>'firstYearEffect')::numeric, (item->>'multiYearCommitment')::numeric,
    coalesce((item->>'transitionCost')::numeric, 0), (item->>'estimatedSavingsLow')::numeric,
    (item->>'estimatedSavingsHigh')::numeric,
    coalesce(array(select jsonb_array_elements_text(item->'majorRisks')), '{}'),
    item->>'evidenceFingerprint', item->>'calculationVersion'
  from jsonb_array_elements(coalesce(p_payload->'scenarios', '[]'::jsonb)) item;

  update public.renewal_quote_comparisons
  set proposal_version_id = v_proposal_version_id, updated_at = timezone('utc', now())
  where id = v_comparison_id and organization_id = p_organization_id;

  return jsonb_build_object(
    'comparisonId', v_comparison_id,
    'proposalVersionId', v_proposal_version_id,
    'isNew', true
  );
end;
$$;

revoke all on function public.persist_commercial_comparison_transaction(uuid, uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_commercial_comparison_transaction(uuid, uuid, uuid, uuid, uuid, text, jsonb)
  to service_role;

comment on function public.persist_commercial_comparison_transaction(uuid, uuid, uuid, uuid, uuid, text, jsonb) is
  'Atomically persists one organization-scoped commercial comparison artifact graph. Stable idempotency keys return the existing graph on retry.';
