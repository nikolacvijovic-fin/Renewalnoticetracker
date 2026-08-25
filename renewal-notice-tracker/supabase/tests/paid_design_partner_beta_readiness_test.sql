begin;

select plan(15);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000081', 'paid-beta-owner@example.test'),
  ('00000000-0000-0000-0000-000000000082', 'paid-beta-member@example.test')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000000091', 'Paid beta A', 'paid-beta-a', '00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000092', 'Paid beta B', 'paid-beta-b', '00000000-0000-0000-0000-000000000081')
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000081', 'owner'),
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000082', 'member')
on conflict do nothing;

insert into public.subscription_usage_provider_connections (
  id, organization_id, provider, provider_tenant_id, provider_tenant_name,
  status, credential_reference, credential_fingerprint
) values (
  '00000000-0000-0000-0000-000000000093',
  '00000000-0000-0000-0000-000000000091',
  'microsoft_365', 'paid-beta-tenant', 'Paid beta tenant', 'connected',
  'managed-secret:paid-beta', 'paid-beta-fingerprint'
) on conflict (id) do nothing;

select is(
  has_function_privilege(
    'anon',
    'public.begin_manual_subscription_usage_sync_attempt(uuid,uuid,text,text,boolean)',
    'execute'
  ),
  false,
  'anonymous callers cannot begin manual synchronization'
);

select is(
  has_table_privilege('authenticated', 'public.design_partner_beta_controls', 'insert'),
  false,
  'customer sessions cannot mutate founder beta controls'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000082';

select throws_ok(
  $$select public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    '00000000-0000-0000-0000-000000000093',
    'microsoft_365', 'paid-beta-interval', false
  )$$,
  '42501', 'Insufficient organization role',
  'ordinary members cannot begin manual synchronization'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000081';

select is(
  public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    '00000000-0000-0000-0000-000000000093',
    'microsoft_365', 'paid-beta-interval', false
  )->>'currentStage',
  'created',
  'owner starts a synchronization at the created stage'
);

select throws_ok(
  format(
    'select public.transition_manual_subscription_usage_sync_attempt(%L, %L, %L)',
    '00000000-0000-0000-0000-000000000091',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval'),
    'fetching_snapshot'
  ),
  '22023',
  'Invalid synchronization stage transition: created -> fetching_snapshot',
  'skipped synchronization stages are rejected'
);

select is(
  public.transition_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval'),
    'authenticating'
  )->>'currentStage',
  'authenticating',
  'created advances to authenticating'
);

select is(
  public.transition_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval'),
    'fetching_snapshot'
  )->>'currentStage',
  'fetching_snapshot',
  'authenticating advances to fetching snapshot'
);

reset role;
insert into public.usage_import_batches (
  id, organization_id, source, status, provider, provider_connection_id, idempotency_key
) values (
  '00000000-0000-0000-0000-000000000094',
  '00000000-0000-0000-0000-000000000091',
  'microsoft_365', 'completed', 'microsoft_365',
  '00000000-0000-0000-0000-000000000093', 'paid-beta-batch'
);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000081';

select is(
  public.transition_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval'),
    'snapshot_persisted',
    '00000000-0000-0000-0000-000000000094', 12
  )->>'currentStage',
  'snapshot_persisted',
  'snapshot persistence stores the scoped batch on the attempt'
);

select is(
  public.transition_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval'),
    'failed', null, null, null, null, 'reconciliation_failed', timezone('utc', now())
  )->>'failureStage',
  'snapshot_persisted',
  'late failure preserves the stage at which it occurred'
);

select is(
  public.begin_manual_subscription_usage_sync_attempt(
    '00000000-0000-0000-0000-000000000091',
    '00000000-0000-0000-0000-000000000093',
    'microsoft_365', 'paid-beta-interval', true
  )->>'usageImportBatchId',
  '00000000-0000-0000-0000-000000000094',
  'late retry reuses the existing snapshot batch'
);

select is(
  (select current_stage from public.subscription_usage_sync_runs
   where logical_interval_key = 'paid-beta-interval' order by attempt_number desc limit 1),
  'snapshot_persisted',
  'late retry resumes after snapshot persistence'
);

select is(
  (select count(distinct usage_import_batch_id)::integer
   from public.subscription_usage_sync_runs
   where logical_interval_key = 'paid-beta-interval' and usage_import_batch_id is not null),
  1,
  'all attempts retain one logical snapshot batch'
);

select throws_ok(
  format(
    'select public.transition_manual_subscription_usage_sync_attempt(%L, %L, %L)',
    '00000000-0000-0000-0000-000000000092',
    (select id from public.subscription_usage_sync_runs where logical_interval_key = 'paid-beta-interval' order by attempt_number desc limit 1),
    'reconciling'
  ),
  '42501', 'Insufficient organization role',
  'stage transitions cannot cross organization scope'
);

select is(
  (select maximum_attempts from public.subscription_usage_sync_runs
   where logical_interval_key = 'paid-beta-interval' order by attempt_number desc limit 1),
  3,
  'manual synchronization attempts retain the maximum of three'
);

select is(
  (select attempt_number from public.subscription_usage_sync_runs
   where logical_interval_key = 'paid-beta-interval' order by attempt_number desc limit 1),
  2,
  'the explicit late retry creates exactly attempt two'
);

select * from finish();
rollback;
