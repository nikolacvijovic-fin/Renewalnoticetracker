begin;

select plan(11);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'evidence-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'evidence-member@example.test')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000000b1', 'Evidence readiness A', 'evidence-readiness-a', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'Evidence readiness B', 'evidence-readiness-b', '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'member')
on conflict do nothing;

insert into public.contracts (id, organization_id, created_by, status, source_type)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  'active',
  'upload'
) on conflict (id) do nothing;

select is(
  has_function_privilege(
    'authenticated',
    'public.persist_evidence_readiness_assessment(uuid,uuid,text,numeric,text,text,text,text,timestamptz,jsonb)',
    'execute'
  ),
  false,
  'authenticated sessions cannot persist readiness directly'
);

select is(
  has_table_privilege('authenticated', 'public.evidence_readiness_assessments', 'insert'),
  false,
  'authenticated sessions cannot forge readiness rows'
);

set local role service_role;

select is(
  public.persist_evidence_readiness_assessment(
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000c1',
    'renewal_triage', 100, 'decision_ready', 'evidence-readiness-v1',
    repeat('a', 64), 'Evidence is ready for human review.',
    '2026-08-24T00:00:00Z',
    '[{"requirementKey":"real_contract_source","label":"Real contract source","category":"contract_identity","state":"verified","weight":4,"earnedWeight":4,"isCritical":true,"evidenceSource":"contract_file","sourceRecordId":"00000000-0000-0000-0000-0000000000c1","verifiedBy":null,"verifiedAt":"2026-08-24T00:00:00Z","freshnessDate":"2026-08-24T00:00:00Z","explanation":"A real contract is present.","recommendedAction":"No action required."}]'::jsonb
  )->>'changed',
  'true',
  'the service role persists the first scoped assessment'
);

select is(
  (select count(*)::integer from public.evidence_readiness_history
   where contract_id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'the first assessment creates one history snapshot'
);

select is(
  public.persist_evidence_readiness_assessment(
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000c1',
    'renewal_triage', 100, 'decision_ready', 'evidence-readiness-v1',
    repeat('a', 64), 'Evidence is ready for human review.',
    '2026-08-25T00:00:00Z',
    '[{"requirementKey":"real_contract_source","label":"Real contract source","category":"contract_identity","state":"verified","weight":4,"earnedWeight":4,"isCritical":true,"evidenceSource":"contract_file","sourceRecordId":"00000000-0000-0000-0000-0000000000c1","verifiedBy":null,"verifiedAt":"2026-08-24T00:00:00Z","freshnessDate":"2026-08-24T00:00:00Z","explanation":"A real contract is present.","recommendedAction":"No action required."}]'::jsonb
  )->>'changed',
  'false',
  'an identical evidence hash is idempotent'
);

select is(
  (select count(*)::integer from public.evidence_readiness_history
   where contract_id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'an identical recalculation creates no duplicate history'
);

select is(
  public.persist_evidence_readiness_assessment(
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000c1',
    'renewal_triage', 0, 'blocked', 'evidence-readiness-v1',
    repeat('b', 64), 'Upload the current real contract.',
    '2026-08-26T00:00:00Z',
    '[{"requirementKey":"real_contract_source","label":"Real contract source","category":"contract_identity","state":"missing","weight":4,"earnedWeight":0,"isCritical":true,"evidenceSource":null,"sourceRecordId":null,"verifiedBy":null,"verifiedAt":null,"freshnessDate":null,"explanation":"The real contract source is missing.","recommendedAction":"Upload the current real contract.","rawContractText":"SENSITIVE_DATABASE_MARKER"}]'::jsonb
  )->>'changed',
  'true',
  'changed evidence creates a new assessment snapshot'
);

select is(
  (select changed_requirement_keys from public.evidence_readiness_history
   where contract_id = '00000000-0000-0000-0000-0000000000c1'
   order by created_at desc limit 1),
  array['real_contract_source']::text[],
  'history records the changed requirement key'
);

select is(
  (select position('SENSITIVE_DATABASE_MARKER' in item_snapshot::text)::integer
   from public.evidence_readiness_history
   where contract_id = '00000000-0000-0000-0000-0000000000c1'
   order by created_at desc limit 1),
  0,
  'history rebuilds an allowlisted snapshot and drops arbitrary input fields'
);

select throws_ok(
  $$select public.persist_evidence_readiness_assessment(
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000c1',
    'renewal_triage', 0, 'blocked', 'evidence-readiness-v1',
    repeat('c', 64), 'Review the contract.', timezone('utc', now()), '[]'::jsonb
  )$$,
  'P0001',
  'contract not found in organization',
  'service persistence rejects a cross-organization contract'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';

select is(
  (select count(*)::integer from public.evidence_readiness_assessments),
  0,
  'a member of another organization cannot read readiness assessments'
);

select * from finish();
rollback;
