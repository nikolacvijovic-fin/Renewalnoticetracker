begin;

select plan(15);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000ca01', 'commercial-atomic-reviewer@example.test')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values (
  '00000000-0000-0000-0000-00000000ca02',
  'Commercial atomicity',
  'commercial-atomicity',
  '00000000-0000-0000-0000-00000000ca01'
) on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values (
  '00000000-0000-0000-0000-00000000ca02',
  '00000000-0000-0000-0000-00000000ca01',
  'reviewer'
) on conflict do nothing;

insert into public.contracts (id, organization_id, created_by, status, source_type)
values (
  '00000000-0000-0000-0000-00000000ca03',
  '00000000-0000-0000-0000-00000000ca02',
  '00000000-0000-0000-0000-00000000ca01',
  'active',
  'upload'
) on conflict (id) do nothing;

insert into public.contract_extraction_runs (
  id, organization_id, contract_id, provider, status, extraction_mode, requested_by_user_id
) values (
  '00000000-0000-0000-0000-00000000ca04',
  '00000000-0000-0000-0000-00000000ca02',
  '00000000-0000-0000-0000-00000000ca03',
  'test', 'completed', 'deterministic_scaffold',
  '00000000-0000-0000-0000-00000000ca01'
) on conflict (id) do nothing;

insert into public.contract_commercial_baselines (
  id, organization_id, contract_id, version, source_extraction_run_id,
  source_extraction_run_ids, reviewed_by_user_id, calculation_version,
  completeness_status, evidence_field_ids, evidence_fingerprint, terms_snapshot
) values (
  '00000000-0000-0000-0000-00000000ca05',
  '00000000-0000-0000-0000-00000000ca02',
  '00000000-0000-0000-0000-00000000ca03',
  1,
  '00000000-0000-0000-0000-00000000ca04',
  array['00000000-0000-0000-0000-00000000ca04']::uuid[],
  '00000000-0000-0000-0000-00000000ca01',
  'commercial-comparison-v1', 'complete', '{}', repeat('a', 64), '{}'::jsonb
) on conflict (id) do nothing;

select is(
  has_function_privilege(
    'service_role',
    'public.persist_commercial_comparison_transaction(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'execute'
  ),
  true,
  'service role can execute the atomic persistence boundary'
);

select is(
  has_function_privilege(
    'anon',
    'public.persist_commercial_comparison_transaction(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'execute'
  ),
  false,
  'anonymous callers cannot execute the atomic persistence boundary'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.persist_commercial_comparison_transaction(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
    'execute'
  ),
  false,
  'authenticated callers cannot execute the atomic persistence boundary directly'
);

set local role service_role;

select throws_ok(
  $$select public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca99',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca05',
    null,
    repeat('c', 64),
    '{}'::jsonb
  )$$,
  '42501',
  'commercial comparison contract organization mismatch',
  'contract scope mismatch fails before persistence'
);

select throws_ok(
  $$select public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca03',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca99',
    null,
    repeat('b', 64),
    '{}'::jsonb
  )$$,
  '42501',
  'commercial comparison baseline organization mismatch',
  'baseline scope mismatch fails before persistence'
);

select throws_ok(
  $$select public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca03',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca05',
    '00000000-0000-0000-0000-00000000ca99',
    repeat('q', 64),
    '{}'::jsonb
  )$$,
  '42501',
  'commercial comparison proposal file organization mismatch',
  'proposal file scope mismatch fails before persistence'
);

select throws_ok(
  $$select public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca03',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca05',
    null,
    repeat('f', 64),
    '{
      "comparison":{"source":"manual","status":"completed","currentTotalAmount":10000,"proposedTotalAmount":12000,"currency":"EUR","priceDeltaAmount":2000,"overallRiskLevel":"medium","recommendationSummary":"Reviewed recurring delta.","warningCodes":[],"calculationVersion":"commercial-comparison-v1","taxonomyVersion":"commercial-findings-v1","costBridgeStatus":"reconciled","evidenceFingerprint":"failed-fingerprint"},
      "proposal":{"documentType":"renewal_quote","termsSnapshot":{},"evidenceFieldIds":[],"evidenceFingerprint":"failed-fingerprint","warningCodes":[]},
      "proposalLines":[
        {"lineKey":"duplicate","productName":"Plan","chargeType":"recurring","pricingModel":"flat","billingPeriod":"annual","totalAmount":12000,"oneTimeAmount":0,"annualizedAmount":12000,"totalCommitmentAmount":12000,"currency":"EUR","evidenceFieldIds":[],"citations":[],"warningCodes":[]},
        {"lineKey":"duplicate","productName":"Plan duplicate","chargeType":"recurring","pricingModel":"flat","billingPeriod":"annual","totalAmount":12000,"oneTimeAmount":0,"annualizedAmount":12000,"totalCommitmentAmount":12000,"currency":"EUR","evidenceFieldIds":[],"citations":[],"warningCodes":[]}
      ],
      "bridge":{"status":"reconciled","currency":"EUR","currentAnnualCost":10000,"proposedAnnualCost":12000,"currentOneTimeCost":0,"proposedOneTimeCost":0,"currentCommitmentCost":10000,"proposedCommitmentCost":12000,"attributedDelta":2000,"residualAmount":0,"recurringDelta":2000,"oneTimeDelta":0,"attributedRecurringDelta":2000,"attributedOneTimeDelta":0,"residualRecurringAmount":0,"residualOneTimeAmount":0,"components":[],"explanation":"Reviewed recurring delta.","limitations":[],"calculationVersion":"commercial-comparison-v1","evidenceFingerprint":"failed-fingerprint"},
      "findings":[],"opportunities":[],"scenarios":[]
    }'::jsonb
  )$$,
  '23505', null,
  'an intermediate proposal-line failure aborts the RPC'
);

select is(
  (select count(*)::integer from public.renewal_quote_comparisons where idempotency_key = repeat('f', 64)),
  0,
  'the failed RPC leaves no partial comparison'
);

select is(
  (select count(*)::integer from public.renewal_quote_proposal_versions where evidence_fingerprint = 'failed-fingerprint'),
  0,
  'the failed RPC leaves no partial proposal version'
);

select is(
  public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca03',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca05',
    null,
    repeat('s', 64),
    '{
      "comparison":{"source":"manual","status":"completed","currentTotalAmount":10000,"proposedTotalAmount":12000,"currency":"EUR","priceDeltaAmount":2000,"overallRiskLevel":"medium","recommendationSummary":"Reviewed recurring and one-time deltas.","warningCodes":[],"calculationVersion":"commercial-comparison-v1","taxonomyVersion":"commercial-findings-v1","costBridgeStatus":"reconciled","evidenceFingerprint":"success-fingerprint"},
      "proposal":{"documentType":"renewal_quote","termsSnapshot":{},"evidenceFieldIds":[],"evidenceFingerprint":"success-fingerprint","warningCodes":[]},
      "proposalLines":[{"lineKey":"plan","productName":"Plan","chargeType":"recurring","pricingModel":"flat","billingPeriod":"annual","totalAmount":12000,"oneTimeAmount":0,"annualizedAmount":12000,"totalCommitmentAmount":12000,"currency":"EUR","evidenceFieldIds":[],"citations":[],"warningCodes":[]}],
      "bridge":{"status":"reconciled","currency":"EUR","currentAnnualCost":10000,"proposedAnnualCost":12000,"currentOneTimeCost":150,"proposedOneTimeCost":350,"currentCommitmentCost":10150,"proposedCommitmentCost":12350,"attributedDelta":2200,"residualAmount":100,"recurringDelta":2000,"oneTimeDelta":200,"attributedRecurringDelta":1975,"attributedOneTimeDelta":125,"residualRecurringAmount":25,"residualOneTimeAmount":75,"components":[],"explanation":"Reviewed recurring and one-time deltas.","limitations":[],"calculationVersion":"commercial-comparison-v1","evidenceFingerprint":"success-fingerprint"},
      "findings":[],"opportunities":[],"scenarios":[{"type":"accept_proposal","status":"draft","annualCost":12000,"firstYearEffect":2000,"multiYearCommitment":12000,"transitionCost":0,"estimatedSavingsLow":0,"estimatedSavingsHigh":0,"majorRisks":[],"evidenceFingerprint":"success-fingerprint","calculationVersion":"commercial-comparison-v1"}]
    }'::jsonb
  )->>'isNew',
  'true',
  'a valid artifact graph commits in one call'
);

select is(
  public.persist_commercial_comparison_transaction(
    '00000000-0000-0000-0000-00000000ca02',
    '00000000-0000-0000-0000-00000000ca03',
    '00000000-0000-0000-0000-00000000ca01',
    '00000000-0000-0000-0000-00000000ca05',
    null,
    repeat('s', 64),
    '{}'::jsonb
  )->>'isNew',
  'false',
  'a retry returns the existing artifact graph before reading duplicate payload data'
);

select is(
  (select count(*)::integer from public.renewal_quote_comparisons where idempotency_key = repeat('s', 64)),
  1,
  'retry creates no duplicate comparison'
);

select is(
  (select count(*)::integer from public.renewal_quote_proposal_versions where evidence_fingerprint = 'success-fingerprint'),
  1,
  'retry creates no duplicate proposal version'
);

select is(
  (select count(*)::integer from public.renewal_quote_scenarios where evidence_fingerprint = 'success-fingerprint'),
  1,
  'retry creates no duplicate scenario'
);

select is(
  (
    select jsonb_build_object(
      'currentOneTimeCost', current_one_time_cost,
      'proposedOneTimeCost', proposed_one_time_cost,
      'currentCommitmentCost', current_commitment_cost,
      'proposedCommitmentCost', proposed_commitment_cost,
      'recurringDelta', recurring_delta,
      'oneTimeDelta', one_time_delta,
      'residualRecurringAmount', residual_recurring_amount,
      'residualOneTimeAmount', residual_one_time_amount
    )
    from public.renewal_quote_cost_bridges
    where evidence_fingerprint = 'success-fingerprint'
  ),
  '{
    "currentOneTimeCost": 150,
    "proposedOneTimeCost": 350,
    "currentCommitmentCost": 10150,
    "proposedCommitmentCost": 12350,
    "recurringDelta": 2000,
    "oneTimeDelta": 200,
    "residualRecurringAmount": 25,
    "residualOneTimeAmount": 75
  }'::jsonb,
  'recurring, one-time, commitment, and residual amounts persist independently'
);

select * from finish();
rollback;
