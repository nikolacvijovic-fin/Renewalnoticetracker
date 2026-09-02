begin;

select plan(22);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000d101', 'pdf-admin-a@example.test'),
  ('00000000-0000-4000-8000-00000000d102', 'pdf-reviewer-a@example.test'),
  ('00000000-0000-4000-8000-00000000d103', 'pdf-owner-a@example.test'),
  ('00000000-0000-4000-8000-00000000d104', 'pdf-admin-b@example.test')
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
  ('00000000-0000-4000-8000-00000000d112', '00000000-0000-4000-8000-00000000d104', 'admin')
on conflict do nothing;

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
  true,
  'authenticated sessions can reach the role-checked activation boundary'
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

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d102';

select is(
  public.activate_reviewed_contract_for_saas_clock(
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  )->>'contractId',
  (
    select id::text from public.contracts
    where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
  ),
  'a reviewer activates one fully reviewed contract'
);

select is_deeply(
  array[
    (select count(*)::integer from public.saas_software_inventory where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_contract_terms where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_opt_out_windows where organization_id = '00000000-0000-4000-8000-00000000d111')
  ],
  array[1, 1, 1],
  'activation creates one complete SaaS clock graph'
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
    select count(*)::integer
    from public.reminders
    where organization_id = '00000000-0000-4000-8000-00000000d111'
  ),
  0,
  'clock activation does not create reminders'
);

select is(
  public.activate_reviewed_contract_for_saas_clock(
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  )->>'replayed',
  'true',
  'repeated activation returns an idempotent replay'
);

select is_deeply(
  array[
    (select count(*)::integer from public.saas_software_inventory where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_contract_terms where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.saas_opt_out_windows where organization_id = '00000000-0000-4000-8000-00000000d111'),
    (select count(*)::integer from public.audit_logs where organization_id = '00000000-0000-4000-8000-00000000d111' and action = 'saas.contract_activated_for_opt_out_clock')
  ],
  array[1, 1, 1, 1],
  'activation replay creates no duplicate records or audit claims'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d103';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock(%L, %L)',
    '00000000-0000-4000-8000-00000000d111',
    (
      select id from public.contracts
      where pdf_upload_attempt_id = '00000000-0000-4000-8000-00000000d121'
    )
  ),
  '42501',
  'Only review-capable organization roles can activate the Opt-Out Clock.',
  'an owner role cannot bypass the review-capable activation boundary'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000d101';

select throws_ok(
  format(
    'select public.activate_reviewed_contract_for_saas_clock(%L, %L)',
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
    'select public.activate_reviewed_contract_for_saas_clock(%L, %L)',
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

select is(
  (
    select (details ?| array[
      'raw_contract_text',
      'provider_payload',
      'recipient_email',
      'message_body',
      'private_notes',
      'storage_path'
    ])
    from public.audit_logs
    where organization_id = '00000000-0000-4000-8000-00000000d111'
      and action = 'saas.contract_activated_for_opt_out_clock'
  ),
  false,
  'activation audit metadata excludes sensitive content fields'
);

select * from finish();
rollback;
