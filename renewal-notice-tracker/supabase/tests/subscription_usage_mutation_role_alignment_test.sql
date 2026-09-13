begin;

select plan(11);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'usage-admin@example.test'),
  ('00000000-0000-0000-0000-000000000302', 'usage-operator@example.test'),
  ('00000000-0000-0000-0000-000000000303', 'usage-owner@example.test'),
  ('00000000-0000-0000-0000-000000000304', 'usage-reviewer@example.test'),
  ('00000000-0000-0000-0000-000000000305', 'usage-foreign-admin@example.test')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000000311', 'Usage role A', 'usage-role-a', '00000000-0000-0000-0000-000000000301'),
  ('00000000-0000-0000-0000-000000000312', 'Usage role B', 'usage-role-b', '00000000-0000-0000-0000-000000000305')
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000301', 'admin'),
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000302', 'operator'),
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000303', 'owner'),
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000304', 'reviewer'),
  ('00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000305', 'admin')
on conflict do nothing;

insert into public.subscription_usage_provider_connections (
  id, organization_id, provider, provider_tenant_id, status, credential_reference, credential_fingerprint
) values
  ('00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000311', 'microsoft_365', 'usage-role-a', 'connected', 'managed-secret:a', 'fingerprint-a'),
  ('00000000-0000-0000-0000-000000000322', '00000000-0000-0000-0000-000000000312', 'microsoft_365', 'usage-role-b', 'connected', 'managed-secret:b', 'fingerprint-b')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000301';

select isnt(public.create_subscription_usage_batch_with_rows(
  '00000000-0000-0000-0000-000000000311', 'manual', 'completed', null,
  'usage-role-admin', 'manual_csv', null, null,
  '{"readyCount":0,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb, '[]'::jsonb
), null, 'admin can persist an authenticated usage import');

select is((with changed as (
  update public.subscription_usage_provider_connections
  set last_error_code = 'admin_direct_write'
  where id = '00000000-0000-0000-0000-000000000321'
  returning id
) select count(*)::integer from changed), 1, 'admin can directly mutate scoped provider state');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000302';

select isnt(public.create_subscription_usage_batch_with_rows(
  '00000000-0000-0000-0000-000000000311', 'manual', 'completed', null,
  'usage-role-operator', 'manual_csv', null, null,
  '{"readyCount":0,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb, '[]'::jsonb
), null, 'operator can persist an authenticated usage import');

select is((with changed as (
  update public.subscription_usage_provider_connections
  set last_error_code = 'operator_direct_write'
  where id = '00000000-0000-0000-0000-000000000321'
  returning id
) select count(*)::integer from changed), 1, 'operator can directly mutate scoped provider state');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000303';

select throws_ok(
  $$select public.create_subscription_usage_batch_with_rows(
    '00000000-0000-0000-0000-000000000311', 'manual', 'completed', null,
    'usage-role-owner', 'manual_csv', null, null,
    '{"readyCount":0,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb, '[]'::jsonb
  )$$,
  '42501', 'Insufficient organization role', 'owner cannot bypass intake RPC authorization'
);

select is((with changed as (
  update public.subscription_usage_provider_connections
  set last_error_code = 'owner_direct_write'
  where id = '00000000-0000-0000-0000-000000000321'
  returning id
) select count(*)::integer from changed), 0, 'owner cannot directly mutate provider state');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000304';

select throws_ok(
  $$select public.create_subscription_usage_analysis_scope(
    '00000000-0000-0000-0000-000000000311',
    (select id from public.usage_import_batches where idempotency_key = 'usage-role-admin'), false
  )$$,
  '42501', 'Insufficient organization role', 'reviewer cannot invoke reconciliation persistence'
);

select is((with changed as (
  update public.subscription_usage_sync_runs set status = 'cancelled'
  where organization_id = '00000000-0000-0000-0000-000000000311'
  returning id
) select count(*)::integer from changed), 0, 'reviewer cannot directly mutate synchronization state');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000301';

select throws_ok(
  $$select public.create_subscription_usage_batch_with_rows(
    '00000000-0000-0000-0000-000000000312', 'manual', 'completed', null,
    'usage-role-cross-org', 'manual_csv', null, null,
    '{"readyCount":0,"rejectedCount":0,"errorCount":0,"partialSuccess":false}'::jsonb, '[]'::jsonb
  )$$,
  '42501', 'Insufficient organization role', 'admin cannot mutate a foreign organization through the RPC'
);

select is((with changed as (
  update public.subscription_usage_provider_connections
  set last_error_code = 'cross_org_direct_write'
  where id = '00000000-0000-0000-0000-000000000322'
  returning id
) select count(*)::integer from changed), 0, 'direct provider mutation cannot cross organization scope');

select is((select count(*)::integer from public.subscription_usage_provider_connections
  where organization_id = '00000000-0000-0000-0000-000000000311'), 1, 'member read access remains scoped and available');

select * from finish();
rollback;
