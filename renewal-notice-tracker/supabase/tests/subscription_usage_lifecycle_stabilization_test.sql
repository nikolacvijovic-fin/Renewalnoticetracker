begin;

select plan(43);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'usage-owner@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'usage-member@example.test')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000000011', 'Usage lifecycle A', 'usage-lifecycle-a', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', 'Usage lifecycle B', 'usage-lifecycle-b', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'member')
on conflict do nothing;

insert into public.subscription_usage_provider_connections (
  id, organization_id, provider, provider_tenant_id, provider_tenant_name,
  status, credential_reference, credential_fingerprint
) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'tenant-a', 'Tenant A', 'connected', 'managed-secret:a', 'fingerprint-a'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000011', 'google_workspace', 'customer-a', 'example.test', 'connected', 'managed-secret:b', 'fingerprint-b')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

select throws_ok(
  $$select public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', false
  )$$,
  '42501', 'Insufficient organization role',
  'ordinary members cannot create privileged manual sync attempts'
);

select throws_ok(
  $$select public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', false
  )$$,
  '42501', 'Insufficient organization role',
  'manual sync attempts cannot cross organization scope'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(
  (public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', false
  )->>'attemptNumber')::integer,
  1,
  'first manual sync uses attempt one'
);

select is(
  public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', false
  )->>'isNew',
  'false',
  'an active same-interval attempt is idempotent'
);

reset role;
update public.subscription_usage_sync_runs
set status = 'failed', failed_at = timezone('utc', now()), retry_after = timezone('utc', now()) - interval '1 second'
where organization_id = '00000000-0000-0000-0000-000000000011'
  and logical_interval_key = 'interval-a';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(
  public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', false
  )->>'isNew',
  'false',
  'a failed attempt is not retried implicitly'
);

select is(
  (public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', true
  )->>'attemptNumber')::integer,
  2,
  'an explicit same-day retry creates attempt two'
);

reset role;
select is(
  (select count(*)::integer from public.subscription_usage_sync_runs
   where organization_id = '00000000-0000-0000-0000-000000000011' and logical_interval_key = 'interval-a'),
  2,
  'retry history remains append-only'
);

update public.subscription_usage_sync_runs
set status = 'failed', failed_at = timezone('utc', now()), retry_after = timezone('utc', now()) + interval '5 minutes'
where organization_id = '00000000-0000-0000-0000-000000000011'
  and logical_interval_key = 'interval-a' and attempt_number = 2;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', true
  )$$,
  '55000', 'Manual synchronization retry is not ready',
  'manual retry honors its backoff window'
);
reset role;
update public.subscription_usage_sync_runs
set retry_after = timezone('utc', now()) - interval '1 second'
where organization_id = '00000000-0000-0000-0000-000000000011'
  and logical_interval_key = 'interval-a' and attempt_number = 2;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(
  (public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', true
  )->>'attemptNumber')::integer,
  3,
  'manual retry is bounded to a third attempt'
);
reset role;
update public.subscription_usage_sync_runs
set status = 'failed', failed_at = timezone('utc', now()), retry_after = timezone('utc', now()) - interval '1 second'
where organization_id = '00000000-0000-0000-0000-000000000011'
  and logical_interval_key = 'interval-a' and attempt_number = 3;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
    'microsoft_365', 'interval-a', true
  )$$,
  '22023', 'Manual synchronization retry limit reached',
  'manual retry cannot exceed the maximum attempt count'
);

reset role;
update public.subscription_usage_sync_runs
set status = 'processing', failed_at = null, retry_after = null
where organization_id = '00000000-0000-0000-0000-000000000011'
  and logical_interval_key = 'interval-a' and attempt_number = 3;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select isnt(public.create_subscription_usage_batch_with_rows(
  '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'completed', null,
  'interval-a', 'microsoft_365', '00000000-0000-0000-0000-000000000021',
  (select id from public.subscription_usage_sync_runs
   where logical_interval_key = 'interval-a' order by attempt_number desc limit 1),
  '{"readyCount":1,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb,
  '[{"row_number":1,"vendor_name":"Microsoft","product_name":"Microsoft 365 E3","normalized_product":"microsoft 365 e3","source_row_hash":"retry-row-hash","validation_status":"ready","warning_codes":[],"normalized_payload":{"warningCodes":[],"evidenceState":"complete"}}]'::jsonb
), null, 'retry can persist its logical synchronization batch');
select is(public.create_subscription_usage_batch_with_rows(
  '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'completed', null,
  'interval-a', 'microsoft_365', '00000000-0000-0000-0000-000000000021',
  (select id from public.subscription_usage_sync_runs
   where logical_interval_key = 'interval-a' order by attempt_number desc limit 1),
  '{"readyCount":1,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb,
  '[{"row_number":1,"vendor_name":"Microsoft","product_name":"Microsoft 365 E3","normalized_product":"microsoft 365 e3","source_row_hash":"retry-row-hash","validation_status":"ready","warning_codes":[],"normalized_payload":{"warningCodes":[],"evidenceState":"complete"}}]'::jsonb
), (select id from public.usage_import_batches where organization_id = '00000000-0000-0000-0000-000000000011' and idempotency_key = 'interval-a'),
  'replaying retry persistence reuses the logical batch');
reset role;
select is((select count(*)::integer from public.usage_import_batches where organization_id = '00000000-0000-0000-0000-000000000011' and idempotency_key = 'interval-a'), 1, 'retry cannot duplicate usage batches');
select is((select count(*)::integer from public.usage_import_rows where organization_id = '00000000-0000-0000-0000-000000000011' and source_row_hash = 'retry-row-hash'), 1, 'retry cannot duplicate usage rows');

insert into public.usage_import_batches (id, organization_id, source, status, provider, idempotency_key)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', 'manual', 'completed', 'manual_csv', 'finding-batch-1'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000011', 'manual', 'completed', 'manual_csv', 'finding-batch-2'),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000011', 'manual', 'completed', 'manual_csv', 'finding-batch-3'),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000011', 'manual', 'completed', 'manual_csv', 'finding-batch-4'),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000011', 'manual', 'completed', 'manual_csv', 'finding-batch-5');

insert into public.subscription_usage_analysis_scopes (
  id, organization_id, scope_key, scope_family_key, current_batch_id,
  snapshot_batch_ids, provider_set, calculation_version, created_by_user_id
) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000011', 'scope-1', 'stable-family', '00000000-0000-0000-0000-000000000041', array['00000000-0000-0000-0000-000000000041']::uuid[], array['manual_csv'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000011', 'scope-2', 'stable-family', '00000000-0000-0000-0000-000000000042', array['00000000-0000-0000-0000-000000000042']::uuid[], array['manual_csv'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000011', 'scope-3', 'stable-family', '00000000-0000-0000-0000-000000000043', array['00000000-0000-0000-0000-000000000043']::uuid[], array['manual_csv'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000011', 'scope-4', 'stable-family', '00000000-0000-0000-0000-000000000044', array['00000000-0000-0000-0000-000000000044']::uuid[], array['manual_csv'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000011', 'scope-5', 'rollback-family', '00000000-0000-0000-0000-000000000045', array['00000000-0000-0000-0000-000000000045']::uuid[], array['manual_csv'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.persist_subscription_usage_analysis_findings(
    '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000041', 'manual_csv', null, null, '[]'::jsonb
  )$$,
  '42501', 'Insufficient organization role',
  'finding persistence cannot cross organization scope'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(public.persist_subscription_usage_analysis_findings(
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000041', 'manual_csv', null, null,
  '[{"logical_opportunity_key":"stable-opportunity","evidence_hash":"material-1","material_evidence_hash":"material-1","provenance_hash":"provenance-1","finding_fingerprint":"fingerprint-1","finding_type":"unused_seats","reason_code":"unused_seats","calculation_version":"v1","usage_row_ids":["00000000-0000-0000-0000-000000000061"],"matched_contract_ids":[],"confidence":0.8,"warnings":[],"recommended_action":"reduce_seats","evidence":{"decisionEvidence":{"purchased_seats":10,"active_users_30d":4}}}]'::jsonb
), 1, 'initial finding persists');

reset role;
update public.license_waste_opportunities
set review_status = 'accepted', reviewed_by_user_id = '00000000-0000-0000-0000-000000000001', reviewed_at = timezone('utc', now()), accepted_action = 'reduce_seats'
where logical_opportunity_key = 'stable-opportunity';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(public.persist_subscription_usage_analysis_findings(
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000052',
  '00000000-0000-0000-0000-000000000042', 'manual_csv', null, null,
  '[{"logical_opportunity_key":"stable-opportunity","evidence_hash":"material-1","material_evidence_hash":"material-1","provenance_hash":"provenance-2","finding_fingerprint":"fingerprint-1","finding_type":"unused_seats","reason_code":"unused_seats","calculation_version":"v1","usage_row_ids":["00000000-0000-0000-0000-000000000062"],"matched_contract_ids":[],"confidence":0.8,"warnings":[],"recommended_action":"reduce_seats","evidence":{"decisionEvidence":{"purchased_seats":10,"active_users_30d":4}}}]'::jsonb
), 1, 'provenance-only rerun is accepted');

reset role;
select is((select count(*)::integer from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity'), 1, 'operational ID changes do not create a revision');
select is((select review_status from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity'), 'accepted', 'reviewed decision survives identical evidence');
select is((select count(*)::integer from public.subscription_usage_analysis_findings where finding_id = (select id from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity')), 2, 'provenance scopes retain immutable associations');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(public.persist_subscription_usage_analysis_findings(
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000053',
  '00000000-0000-0000-0000-000000000043', 'manual_csv', null, null,
  '[{"logical_opportunity_key":"stable-opportunity","evidence_hash":"material-2","material_evidence_hash":"material-2","provenance_hash":"provenance-3","finding_fingerprint":"fingerprint-2","finding_type":"unused_seats","reason_code":"unused_seats","calculation_version":"v1","usage_row_ids":["00000000-0000-0000-0000-000000000063"],"matched_contract_ids":[],"confidence":0.65,"warnings":[],"recommended_action":"reduce_seats","evidence":{"decisionEvidence":{"purchased_seats":10,"active_users_30d":2}}}]'::jsonb
), 1, 'materially changed evidence creates a traceable revision');
reset role;

select is((select count(*)::integer from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity'), 2, 'material change preserves historical revision');
select is((select review_status from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity' and superseded_at is null), 'open', 'materially changed recommendation requires review');
select is((select previous_review_status from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity' and superseded_at is null), 'accepted', 'new revision records previous review decision');
select is((select requires_new_review from public.license_waste_opportunities where logical_opportunity_key = 'stable-opportunity' and superseded_at is null), true, 'new material revision is explicitly review-required');

insert into public.license_waste_opportunities (
  organization_id, finding_type, scope_family_key, logical_opportunity_key, review_status
) values (
  '00000000-0000-0000-0000-000000000011', 'unused_seats', 'stable-family', 'stable-opportunity', 'open'
) on conflict do nothing;
select is(
  (select count(*)::integer from public.license_waste_opportunities
   where organization_id = '00000000-0000-0000-0000-000000000011'
     and scope_family_key = 'stable-family' and logical_opportunity_key = 'stable-opportunity'
     and superseded_at is null and resolved_at is null),
  1,
  'database identity constraint prevents duplicate active opportunities'
);

insert into public.license_waste_opportunities (organization_id, finding_type, scope_family_key, logical_opportunity_key, review_status)
values ('00000000-0000-0000-0000-000000000011', 'unused_seats', 'unrelated-family', 'unrelated-opportunity', 'accepted');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(public.persist_subscription_usage_analysis_findings(
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000054',
  '00000000-0000-0000-0000-000000000044', 'manual_csv', null, null, '[]'::jsonb
), 0, 'empty analysis is processed for its exact scope family');
reset role;
select is((select count(*)::integer from public.license_waste_opportunities where scope_family_key = 'stable-family' and resolved_at is null), 0, 'empty analysis resolves only active findings in its family');
select is((select resolved_at is null from public.license_waste_opportunities where logical_opportunity_key = 'unrelated-opportunity'), true, 'empty analysis leaves unrelated families active');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.persist_subscription_usage_analysis_findings(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000055',
    '00000000-0000-0000-0000-000000000045', 'manual_csv', null, null,
    '[{"logical_opportunity_key":"rollback-opportunity","evidence_hash":"material-r","finding_type":"unused_seats","reason_code":"unused_seats","calculation_version":"v1","usage_row_ids":[],"matched_contract_ids":[],"confidence":0.8,"warnings":[],"recommended_action":"reduce_seats"}, {"finding_type":"unused_seats"}]'::jsonb
  )$$,
  '22023', 'Finding identity is required',
  'invalid finding causes the persistence statement to fail'
);
reset role;
select is((select count(*)::integer from public.license_waste_opportunities where logical_opportunity_key = 'rollback-opportunity'), 0, 'failed persistence rolls back earlier findings transactionally');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select isnt(public.create_subscription_usage_consent_attempt(
  '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'nonce-valid',
  array['LicenseAssignment.Read.All', 'Reports.Read.All'], timezone('utc', now()) + interval '5 minutes'
), null, 'valid consent attempt is created');
select isnt(public.consume_subscription_usage_consent_attempt(
  '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'nonce-valid'
), null, 'valid consent attempt is consumed once');
select throws_ok(
  $$select public.consume_subscription_usage_consent_attempt(
    '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'nonce-valid'
  )$$,
  '42501', 'Consent attempt is invalid, expired, or already consumed',
  'same consent attempt cannot be consumed twice'
);
reset role;
insert into public.subscription_usage_consent_attempts (
  organization_id, actor_user_id, provider, nonce_hash, status, requested_permissions, expires_at
) values (
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
  'microsoft_365', 'nonce-expired', 'pending', array['LicenseAssignment.Read.All', 'Reports.Read.All'], timezone('utc', now()) - interval '1 minute'
);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.consume_subscription_usage_consent_attempt(
    '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'nonce-expired'
  )$$,
  '42501', 'Consent attempt is invalid, expired, or already consumed',
  'expired consent attempt cannot be consumed'
);
reset role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(public.cleanup_subscription_usage_consent_attempts(30, 100), 1, 'bounded cleanup removes the expired pending consent attempt');
reset role;
select is((select count(*)::integer from public.subscription_usage_consent_attempts where nonce_hash = 'nonce-expired'), 0, 'expired consent evidence is no longer retained as pending');

insert into public.usage_import_batches (
  id, organization_id, source, status, provider, provider_connection_id, idempotency_key
) values
  ('00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000011', 'microsoft_365', 'completed', 'microsoft_365', '00000000-0000-0000-0000-000000000021', 'disconnect-ms-batch'),
  ('00000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000011', 'google_workspace', 'completed', 'google_workspace', '00000000-0000-0000-0000-000000000022', 'disconnect-google-batch');
insert into public.subscription_usage_analysis_scopes (
  id, organization_id, scope_key, scope_family_key, current_batch_id,
  snapshot_batch_ids, provider_set, calculation_version, created_by_user_id
) values (
  '00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000011',
  'disconnect-scope', 'disconnect-family', '00000000-0000-0000-0000-000000000047',
  array['00000000-0000-0000-0000-000000000046','00000000-0000-0000-0000-000000000047']::uuid[],
  array['google_workspace','microsoft_365'], 'subscription_usage_v2', '00000000-0000-0000-0000-000000000001'
);

insert into public.license_waste_opportunities (
  id, organization_id, provider_connection_id, provider, analysis_scope_id, finding_type, review_status
) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'microsoft_365', null, 'unused_seats', 'accepted'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'google_workspace', null, 'unused_seats', 'accepted'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'google_workspace', '00000000-0000-0000-0000-000000000056', 'possible_functional_overlap', 'accepted'),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000011', null, 'manual_csv', null, 'unused_seats', 'accepted')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(
  public.disconnect_subscription_usage_provider(
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021'
  ),
  2,
  'disconnect resolves direct and cross-provider findings involving the connection'
);
reset role;

select is((select status from public.subscription_usage_provider_connections where id = '00000000-0000-0000-0000-000000000021'), 'disconnected', 'provider is disconnected');
select is((select resolution_reason from public.license_waste_opportunities where id = '00000000-0000-0000-0000-000000000031'), 'provider_disconnected', 'involved finding records a safe resolution reason');
select is((select resolution_reason from public.license_waste_opportunities where id = '00000000-0000-0000-0000-000000000033'), 'provider_disconnected', 'cross-provider scope finding resolves when one involved connection disconnects');
select is((select resolved_at is null from public.license_waste_opportunities where id = '00000000-0000-0000-0000-000000000032'), true, 'uninvolved provider finding remains active');
select is((select resolved_at is null from public.license_waste_opportunities where id = '00000000-0000-0000-0000-000000000034'), true, 'manual finding remains active after provider disconnect');

select * from finish();
rollback;
