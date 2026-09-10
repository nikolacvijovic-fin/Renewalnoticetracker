begin;

select plan(56);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000d101', 'pdf-admin-a@example.test'),
  ('00000000-0000-4000-8000-00000000d102', 'pdf-reviewer-a@example.test'),
  ('00000000-0000-4000-8000-00000000d103', 'pdf-owner-a@example.test'),
  ('00000000-0000-4000-8000-00000000d104', 'pdf-admin-b@example.test'),
  ('00000000-0000-4000-8000-00000000d105', 'pdf-operator-a@example.test')
on conflict (id) do nothing;

insert into public.users (id, full_name)
values
  ('00000000-0000-4000-8000-00000000d101', 'PDF Admin A'),
  ('00000000-0000-4000-8000-00000000d102', 'PDF Reviewer A'),
  ('00000000-0000-4000-8000-00000000d103', 'PDF Owner A'),
  ('00000000-0000-4000-8000-00000000d104', 'PDF Admin B'),
  ('00000000-0000-4000-8000-00000000d105', 'PDF Operator A')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values
  (
    '00000000-0000-4000-8000-00000000d111',
    'PDF Clock Organization A',
    'pdf-clock-organization-a',
    '00000000-0000-4000-8000-00000000d101'
  ),
  (
    '00000000-0000-4000-8000-00000000d112',
    'PDF Clock Organization B',
    'pdf-clock-organization-b',
    '00000000-0000-4000-8000-00000000d104'
  )
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values
  ('00000000-0000-4000-8000-00000000d111', '00000000-0000-4000-8000-00000000d101', 'admin'),
  ('00000000-0000-4000-8000-00000000d111', '00000000-0000-4000-8000-00000000d102', 'reviewer'),
  ('00000000-0000-4000-8000-00000000d111', '00000000-0000-4000-8000-00000000d103', 'owner'),
  ('00000000-0000-4000-8000-00000000d111', '00000000-0000-4000-8000-00000000d105', 'operator'),
  ('00000000-0000-4000-8000-00000000d112', '00000000-0000-4000-8000-00000000d104', 'admin')
on conflict do nothing;

insert into public.design_partner_beta_controls (
  organization_id,
  status,
  maximum_contracts,
  founder_approved_at,
  founder_approved_by_user_id
) values (
  '00000000-0000-4000-8000-00000000d112',
  'active',
  1,
  timezone('utc', now()),
  '00000000-0000-4000-8000-00000000d104'
) on conflict (organization_id) do update
set status = excluded.status,
    maximum_contracts = excluded.maximum_contracts,
    founder_approved_at = excluded.founder_approved_at,
    founder_approved_by_user_id = excluded.founder_approved_by_user_id;

select is(
  has_function_privilege(
    'anon',
    'public.claim_saas_pdf_contract_upload(uuid,uuid,text,uuid)',
    'execute'
  ),
  false,
  'anonymous callers cannot claim PDF uploads'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_saas_pdf_contract_upload(uuid,uuid,text,uuid)',
    'execute'
  ),
  true,
  'authenticated sessions can reach the role-checked upload boundary'
);

select is(
  has_function_privilege(
    'anon',
    'public.activate_reviewed_contract_for_saas_clock(uuid,uuid)',
    'execute'
  ),
  false,
  'anonymous callers cannot activate SaaS clock records'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.activate_reviewed_contract_for_saas_clock(uuid,uuid)',
    'execute'
  ),
  false,
  'authenticated sessions cannot bypass the hardened activation wrapper'
);

select is(
  has_function_privilege(
    'anon',
    'public.activate_reviewed_contract_for_saas_clock_v2(uuid,uuid,uuid,boolean)',
    'execute'
  ),
  false,
  'anonymous callers cannot reach the hardened activation boundary'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.activate_reviewed_contract_for_saas_clock_v2(uuid,uuid,uuid,boolean)',
    'execute'
  ),
  true,
  'authenticated sessions can reach the hardened role-checked activation boundary'
);

select is(
  has_function_privilege(
    'anon',
    'public.claim_saas_pdf_upload_cleanup(uuid,uuid,uuid,timestamptz)',
    'execute'
  ),
  false,
  'anonymous callers cannot claim PDF storage cleanup'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_saas_pdf_upload_cleanup(uuid,uuid,uuid,timestamptz)',
    'execute'
  ),
  false,
  'customer sessions cannot claim PDF storage cleanup'
);

select is(
  has_function_privilege(
    'service_role',
    'public.claim_saas_pdf_upload_cleanup(uuid,uuid,uuid,timestamptz)',
    'execute'
  ),
  true,
  'only the service worker can claim PDF storage cleanup'
);

select is(
  has_function_privilege(
    'anon',
    'public.persist_saas_pdf_extraction_for_review(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz)',
    'execute'
  ),
  false,
  'anonymous callers cannot persist PDF extraction review state'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.persist_saas_pdf_extraction_for_review(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz)',
    'execute'
  ),
  false,
  'customer sessions cannot invoke service extraction persistence directly'
);

select is(
  has_function_privilege(
    'service_role',
    'public.persist_saas_pdf_extraction_for_review(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz)',
    'execute'
  ),
  true,
  'only the service worker can persist guarded PDF extraction review state'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d103';

select throws_ok(
  $$select public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d121',
    'Owner cannot upload',
    null
  )$$,
  '42501',
  'Only admins or operators can upload contract PDFs.',
  'an insufficient organization role cannot claim an upload'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select throws_ok(
  $$select public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d121',
    'Foreign organization',
    null
  )$$,
  '42501',
  'Only admins or operators can upload contract PDFs.',
  'a non-member cannot claim an upload for another organization'
);

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d121',
    'Reviewed Acme Cloud',
    '00000000-0000-4000-8000-00000000d103'
  )->>'status',
  'processing',
  'an authorized upload claim starts in processing state'
);

select is(
  (
    select count(*)::integer
    from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
  ),
  1,
  'the first claim creates one contract'
);

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d121',
    'Reviewed Acme Cloud',
    '00000000-0000-4000-8000-00000000d103'
  )->>'claimed',
  'false',
  'a replay returns the existing active claim'
);

select is(
  (
    select count(*)::integer
    from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
  ),
  1,
  'replay does not create a duplicate contract'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d104';

select throws_ok(
  $$select public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d121',
    'Cross-organization replay',
    null
  )$$,
  '42501',
  'PDF upload attempt is not available.',
  'another organization cannot reuse an existing attempt identifier'
);

select alike(
  pg_get_functiondef('public.claim_saas_pdf_contract_upload(uuid,uuid,text,uuid)'::regprocedure),
  '%pg_advisory_xact_lock%contract-capacity:%',
  'capacity enforcement is serialized inside the claim transaction'
);

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d130',
    'Capacity slot one',
    null
  )->>'claimed',
  'true',
  'the first organization-B claim consumes its configured slot'
);

select throws_ok(
  $$select public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d131',
    'Capacity slot two',
    null
  )$$,
  'P0001',
  'Contract tracking capacity has been reached.',
  'a new claim is rejected at the canonical organization capacity limit'
);

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d130',
    'Capacity slot replay',
    null
  )->>'claimed',
  'false',
  'replaying an active attempt does not consume another capacity slot'
);

select is(
  public.abandon_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d130'
  )->>'status',
  'abandoned',
  'an authorized abandon transition releases the placeholder from paid capacity'
);

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d131',
    'Capacity after abandon',
    null
  )->>'claimed',
  'true',
  'a new attempt can claim the slot released by an abandoned placeholder'
);

reset role;
update public.contracts
set pdf_upload_attempt_status = 'failed'
where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d131';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d104';

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d132',
    'Capacity after failure',
    null
  )->>'claimed',
  'true',
  'a failed unreviewed placeholder does not consume paid capacity'
);

reset role;
update public.contracts
set pdf_upload_attempt_status = 'extraction_failed'
where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d132';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d104';

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d132',
    'Retry existing extraction',
    null
  )->>'claimed',
  'true',
  'an extraction-failed attempt can retry without requiring a second capacity slot'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d122',
    'Reviewed Acme Cloud',
    '00000000-0000-4000-8000-00000000d103'
  )->>'claimed',
  'true',
  'a distinct attempt can intentionally create another contract with the same title'
);

reset role;

insert into public.background_jobs (
  id,
  organization_id,
  contract_id,
  job_type,
  status,
  idempotency_key,
  payload,
  attempts,
  max_attempts,
  locked_at,
  locked_by,
  lease_expires_at
) select
  '00000000-0000-4000-8000-00000000d151',
  '00000000-0000-4000-8000-00000000d111',
  c.id,
  'contract_pdf_extraction',
  'processing',
  'contract_pdf_extraction:00000000-0000-4000-8000-00000000d122',
  jsonb_build_object('upload_attempt_id', '00000000-0000-4000-8000-00000000d122'),
  2,
  3,
  timezone('utc', now()) - interval '2 minutes',
  'expired-worker',
  timezone('utc', now()) - interval '1 minute'
from public.contracts c
where c.pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d122';

update public.contracts
set pdf_extraction_job_id = '00000000-0000-4000-8000-00000000d151'
where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d122';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  (
    select status
    from public.rescue_stale_background_jobs(
      array['contract_pdf_extraction'],
      timezone('utc', now())
    )
    where id = '00000000-0000-4000-8000-00000000d151'
  ),
  'dead_lettered',
  'an extraction job with an expired final lease is dead-lettered'
);

select is(
  (
    select pdf_upload_attempt_status
    from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d122'
  ),
  'extraction_failed',
  'dead-letter rescue atomically releases the linked upload from processing'
);

select is(
  (
    select pdf_upload_failure_code
    from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d122'
  ),
  'background_job_retry_exhausted',
  'dead-letter rescue records a safe terminal failure code'
);

reset role;
set local request.jwt.claim.role = '';

update public.contracts
set owner_user_id = '00000000-0000-4000-8000-00000000d103'
where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121';

insert into public.contract_metadata (
  contract_id,
  contract_title,
  counterparty_name,
  renewal_date,
  expiration_date,
  auto_renewal,
  notice_deadline_date,
  contract_value_amount,
  contract_value_currency,
  needs_review,
  reviewed_at,
  reviewed_by,
  deadline_verified_at
) values (
  (
    select id from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
  ),
  'Acme Cloud Subscription',
  'Acme Cloud',
  '2027-01-31',
  '2027-01-31',
  true,
  '2026-12-01',
  30000,
  'EUR',
  false,
  timezone('utc', now()),
  '00000000-0000-4000-8000-00000000d102',
  timezone('utc', now())
);

insert into public.saas_software_inventory (
  id,
  organization_id,
  name,
  vendor_name,
  owner_user_id,
  status,
  created_by
) values (
  '00000000-0000-4000-8000-00000000d161',
  '00000000-0000-4000-8000-00000000d111',
  'Acme Cloud Subscription',
  'Acme Cloud',
  '00000000-0000-4000-8000-00000000d103',
  'inactive',
  '00000000-0000-4000-8000-00000000d101'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

create temporary table pdf_activation_result (result jsonb) on commit drop;
insert into pdf_activation_result (result)
select public.activate_reviewed_contract_for_saas_clock_v2(
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    ),
    null,
    true
  );

select is(
  (select result->>'contractId' from pdf_activation_result),
  (
    select id::text from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
  ),
  'an admin explicitly creates the SaaS projection for one fully reviewed contract'
);

select is(
  (select result->>'createdSoftware' from pdf_activation_result),
  'true',
  'create-new activation reports that the wrapper created software inventory'
);

select is(
  (select result->>'createdTerm' from pdf_activation_result),
  'true',
  'create-new activation reports that the wrapper created the contract term'
);

select is(
  array[
    (select count(*)::integer from public.saas_software_inventory where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_contract_terms where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_opt_out_windows where organization_id = '00000000-0000-4000-8000-00000000d111')
  ],
  array[2, 1, 1],
  'activation creates one complete SaaS clock graph'
);

select is(
  (
    select s.status
    from public.saas_contract_terms t
    join public.saas_software_inventory s on s.id = t.software_id
    where t.organization_id = '00000000-0000-4000-8000-00000000d111'
      and t.contract_id = (
        select id from public.contracts
        where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
      )
  ),
  'active',
  'activation does not link a matching inactive inventory record'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and action = 'saas.contract_activated_for_opt_out_clock'
  ),
  1,
  'activation records one customer audit event'
);

select is(
  (
    select (details->>'createdSoftware')::boolean and (details->>'createdTerm')::boolean
    from public.audit_logs
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and action = 'saas.contract_activated_for_opt_out_clock'
    limit 1
  ),
  true,
  'activation audit records wrapper-created software and term accurately'
);

select is(
  (
    select count(*)::integer
    from public.reminders
    where organization_id = '00000000-0000-4000-8000-00000000d111'
  ),
  0,
  'clock activation does not create reminders'
);

select is(
  public.activate_reviewed_contract_for_saas_clock_v2(
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    ),
    null,
    true
  )->>'replayed',
  'true',
  'repeated activation returns an idempotent replay even when the original create-new intent is repeated'
);

select is(
  array[
    (select count(*)::integer from public.saas_software_inventory where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_contract_terms where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_opt_out_windows where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.audit_logs where organization_id = '00000000-0000-4000-8000-00000000d111' and action = 'saas.contract_activated_for_opt_out_clock')
  ],
  array[2, 1, 1, 1],
  'activation replay creates no duplicate records or audit claims'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d103';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock_v2(%L, %L, null, false)',
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  ),
  '42501',
  'Only admins or operators can activate the Opt-Out Clock.',
  'an owner role cannot bypass the Admin/Operator activation boundary'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d102';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock_v2(%L, %L, null, false)',
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  ),
  '42501',
  'Only admins or operators can activate the Opt-Out Clock.',
  'a reviewer may review metadata but cannot create the operational SaaS graph'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock_v2(%L, %L, null, true)',
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d122'
    )
  ),
  '55000',
  'Contract metadata must be extracted and reviewed before activation.',
  'a contract without reviewed metadata cannot activate'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d104';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock_v2(%L, %L, null, true)',
    '00000000-0000-4000-8000-00000000d112',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  ),
  '42501',
  'Contract is not available in the active organization.',
  'activation cannot cross organization scope'
);

reset role;

insert into public.contracts (
  id,
  organization_id,
  created_by,
  owner_user_id,
  status,
  source_type,
  status_tag
) values (
  '00000000-0000-4000-8000-00000000d141',
  '00000000-0000-4000-8000-00000000d111',
  '00000000-0000-4000-8000-00000000d101',
  '00000000-0000-4000-8000-00000000d103',
  'reviewed',
  'upload',
  'active'
);

insert into public.contract_metadata (
  contract_id,
  contract_title,
  counterparty_name,
  renewal_date,
  expiration_date,
  auto_renewal,
  notice_deadline_date,
  contract_value_amount,
  contract_value_currency,
  needs_review,
  reviewed_at,
  reviewed_by,
  deadline_verified_at
) values (
  '00000000-0000-4000-8000-00000000d141',
  'Notice-Only Support Agreement',
  'Notice Vendor',
  '2027-06-30',
  '2027-06-30',
  false,
  '2027-05-31',
  12000,
  'EUR',
  false,
  timezone('utc', now()),
  '00000000-0000-4000-8000-00000000d102',
  timezone('utc', now())
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d105';

select is(
  public.activate_reviewed_contract_for_saas_clock_v2(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d141',
    null,
    true
  )->>'deadlineClassification',
  'notice_only',
  'an operator can activate a verified non-auto-renewal notice deadline'
);

select is(
  (
    select deadline_classification
    from public.saas_opt_out_windows
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and contract_term_id = (
        select id from public.saas_contract_terms
        where contract_id = '00000000-0000-4000-8000-00000000d141'
      )
  ),
  'notice_only',
  'the projected clock record preserves notice-only classification'
);

select is(
  (
    select count(*)::integer
    from public.saas_contract_risk_findings
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and contract_term_id = (
        select id from public.saas_contract_terms
        where contract_id = '00000000-0000-4000-8000-00000000d141'
      )
      and finding_type = 'auto_renewal'
  ),
  0,
  'notice-only activation does not claim auto-renewal risk'
);

reset role;

select is(
  (
    select coalesce(bool_or(details ?| array[
      'raw_contract_text',
      'provider_payload',
      'recipient_email',
      'message_body',
      'private_notes',
      'storage_path'
    ]), false)
    from public.audit_logs
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and action = 'saas.contract_activated_for_opt_out_clock'
  ),
  false,
  'activation audit metadata excludes sensitive content fields'
);

update public.contracts
set pdf_upload_attempt_status = 'extraction_failed'
where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d121',
    'Protected reviewed contract',
    null
  )->>'claimed',
  'false',
  'a reviewed and activated contract cannot be reclaimed for extraction'
);

reset role;

insert into public.contracts (
  id, organization_id, created_by, status, source_type, status_tag,
  pdf_upload_attempt_id, pdf_upload_attempt_status, pdf_upload_claimed_at
) values (
  '00000000-0000-4000-8000-00000000d142',
  '00000000-0000-4000-8000-00000000d111',
  '00000000-0000-4000-8000-00000000d101',
  'extraction_failed',
  'upload',
  'active',
  '00000000-0000-4000-8000-00000000d123',
  'failed',
  timezone('utc', now()) - interval '4 days'
);

insert into public.contract_files (
  id, contract_id, storage_path, file_name, mime_type, size_bytes, uploaded_by
) values (
  '00000000-0000-4000-8000-00000000d162',
  '00000000-0000-4000-8000-00000000d142',
  '00000000-0000-4000-8000-00000000d111/orphaned.pdf',
  'orphaned.pdf',
  'application/pdf',
  1024,
  '00000000-0000-4000-8000-00000000d101'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.claim_saas_pdf_upload_cleanup(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d142',
    '00000000-0000-4000-8000-00000000d162',
    timezone('utc', now()) - interval '3 days'
  )->>'claimed',
  'true',
  'cleanup atomically claims a stale failed upload before storage work'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select is(
  public.claim_saas_pdf_contract_upload(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d123',
    'Cleanup-owned attempt',
    null
  )->>'claimed',
  'false',
  'a customer retry cannot reclaim an upload after cleanup owns it'
);

reset role;

insert into public.contracts (
  id, organization_id, created_by, status, source_type, status_tag,
  pdf_upload_attempt_id, pdf_upload_attempt_status, pdf_upload_claimed_at
) values (
  '00000000-0000-4000-8000-00000000d143',
  '00000000-0000-4000-8000-00000000d111',
  '00000000-0000-4000-8000-00000000d101',
  'extracting_text',
  'upload',
  'active',
  '00000000-0000-4000-8000-00000000d124',
  'processing',
  timezone('utc', now())
);

insert into public.contract_files (
  id, contract_id, storage_path, file_name, mime_type, size_bytes, uploaded_by
) values (
  '00000000-0000-4000-8000-00000000d163',
  '00000000-0000-4000-8000-00000000d143',
  '00000000-0000-4000-8000-00000000d111/guarded.pdf',
  'guarded.pdf',
  'application/pdf',
  1024,
  '00000000-0000-4000-8000-00000000d101'
);

insert into public.background_jobs (
  id, organization_id, contract_id, job_type, status, idempotency_key, payload,
  attempts, max_attempts, locked_at, locked_by, lease_expires_at
) values (
  '00000000-0000-4000-8000-00000000d152',
  '00000000-0000-4000-8000-00000000d111',
  '00000000-0000-4000-8000-00000000d143',
  'contract_pdf_extraction',
  'processing',
  'contract_pdf_extraction:00000000-0000-4000-8000-00000000d124',
  jsonb_build_object('upload_attempt_id', '00000000-0000-4000-8000-00000000d124'),
  0,
  3,
  timezone('utc', now()),
  'guarded-worker',
  timezone('utc', now()) + interval '10 minutes'
);

update public.contracts
set latest_file_id = '00000000-0000-4000-8000-00000000d163',
    pdf_extraction_job_id = '00000000-0000-4000-8000-00000000d152'
where id = '00000000-0000-4000-8000-00000000d143';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.persist_saas_pdf_extraction_for_review(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d143',
    '00000000-0000-4000-8000-00000000d163',
    '00000000-0000-4000-8000-00000000d124',
    '00000000-0000-4000-8000-00000000d152',
    jsonb_build_object(
      'contract_title', 'Guarded extraction proposal',
      'counterparty_name', 'Guarded Vendor',
      'needs_review', true,
      'field_confidence', jsonb_build_object('contract_title', 0.9),
      'field_source_snippets', jsonb_build_object('contract_title', 'Guarded extraction proposal'),
      'pdf_renewal_review_reasons', jsonb_build_array('weak_evidence')
    ),
    jsonb_build_array(jsonb_build_object(
      'field_name', 'contract_title',
      'snippet', 'Guarded extraction proposal',
      'confidence', 0.9,
      'source', 'extraction'
    )),
    'completed',
    timezone('utc', now())
  )->>'persisted',
  'true',
  'the service worker atomically persists one unreviewed extraction result'
);

reset role;
set local request.jwt.claim.role = '';

update public.contract_metadata
set contract_title = 'Human reviewed title',
    reviewed_at = timezone('utc', now()),
    reviewed_by = '00000000-0000-4000-8000-00000000d102'
where contract_id = '00000000-0000-4000-8000-00000000d143';

update public.contracts
set status = 'extracting_text',
    pdf_upload_attempt_status = 'processing'
where id = '00000000-0000-4000-8000-00000000d143';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.persist_saas_pdf_extraction_for_review(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d143',
    '00000000-0000-4000-8000-00000000d163',
    '00000000-0000-4000-8000-00000000d124',
    '00000000-0000-4000-8000-00000000d152',
    jsonb_build_object('contract_title', 'Unsafe retry overwrite'),
    '[]'::jsonb,
    'completed',
    timezone('utc', now())
  )->>'reason',
  'contract_reviewed',
  'a delayed retry is rejected after human review wins'
);

select is(
  (
    select contract_title
    from public.contract_metadata
    where contract_id = '00000000-0000-4000-8000-00000000d143'
  ),
  'Human reviewed title',
  'guarded retry never overwrites human-reviewed contract metadata'
);

reset role;
set local request.jwt.claim.role = '';

update public.contracts
set status_tag = 'terminated'
where id = '00000000-0000-4000-8000-00000000d141';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d105';

select throws_ok(
  $$select public.activate_reviewed_contract_for_saas_clock_v2(
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d141',
    null,
    false
  )$$,
  '55000',
  'Terminated contracts cannot be activated for the Opt-Out Clock.',
  'the activation boundary rejects the canonical terminated contract state'
);

reset role;

select * from finish();
rollback;
