create table if not exists public.contract_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.contract_audit_events is
  'Commercial audit ledger for contract-scoped product events. Mutated by trusted server-side paths only.';

create table if not exists public.trusted_reminder_gate_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.trusted_reminder_gate_events is
  'Immutable evidence of trusted-reminder gate decisions and blocker state transitions.';

create table if not exists public.trust_exception_approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.trust_exception_approval_events is
  'Server-side audit trail for low-confidence evidence exception approval lifecycle.';

create table if not exists public.renewal_decision_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.renewal_decision_events is
  'Server-side audit trail for renewal decision and decision-loop events.';

create table if not exists public.contract_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  source text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  row_count integer not null default 0 check (row_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.contract_import_batches is
  'Tenant-scoped staging header for bulk contract imports before rows become trusted contract records.';

create table if not exists public.contract_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.contract_import_batches (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'needs_review')),
  contract_id uuid references public.contracts (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.contract_import_rows is
  'Tenant-scoped normalized import rows. Raw uploaded documents and OCR text must not be stored here.';

create table if not exists public.contract_import_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.contract_import_batches (id) on delete cascade,
  row_id uuid references public.contract_import_rows (id) on delete cascade,
  error_code text not null,
  error_category text not null,
  safe_message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.contract_import_errors is
  'Safe import error evidence. Messages and metadata must exclude raw contract text and uploaded file contents.';

create table if not exists public.usage_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  source text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  row_count integer not null default 0 check (row_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.usage_import_batches is
  'Tenant-scoped usage import header for future contract-to-usage reconciliation.';

create table if not exists public.usage_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.usage_import_batches (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  vendor_name text,
  product_name text,
  seats_purchased numeric,
  seats_used numeric,
  spend_amount numeric,
  currency text,
  normalized_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.usage_import_rows is
  'Normalized tenant-scoped usage rows for future reconciliation. No CRM enrichment or outreach data belongs here.';

create table if not exists public.contract_usage_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usage_row_id uuid not null references public.usage_import_rows (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  match_confidence numeric not null check (match_confidence >= 0 and match_confidence <= 1),
  match_reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.contract_usage_matches is
  'Tenant-scoped mapping between imported usage rows and contracts for reporting and review.';

create table if not exists public.unmatched_usage_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usage_row_id uuid not null references public.usage_import_rows (id) on delete cascade,
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.unmatched_usage_rows is
  'Tenant-scoped evidence for usage rows that could not be safely matched to a contract.';

create table if not exists public.duplicate_vendor_spend (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vendor_name text not null,
  contract_ids uuid[] not null default '{}',
  estimated_duplicate_spend numeric,
  currency text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.duplicate_vendor_spend is
  'Tenant-scoped reporting scaffold for duplicate vendor spend findings; not a cold outreach or CRM module.';

create table if not exists public.license_waste_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  usage_batch_id uuid references public.usage_import_batches (id) on delete set null,
  finding_type text not null,
  estimated_savings numeric,
  currency text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.license_waste_opportunities is
  'Tenant-scoped reporting scaffold for future usage-to-contract savings review.';

create or replace view public.organization_renewal_readiness
with (security_invoker = true) as
select
  c.organization_id,
  count(*)::integer as total_contracts,
  count(*) filter (where coalesce(cm.needs_review, true) = false)::integer as reviewed_contracts,
  count(*) filter (where c.owner_user_id is not null)::integer as owner_assigned_contracts,
  count(*) filter (where r.id is not null)::integer as contracts_with_reminders,
  timezone('utc', now()) as generated_at
from public.contracts c
left join public.contract_metadata cm on cm.contract_id = c.id
left join lateral (
  select id from public.reminders
  where reminders.contract_id = c.id
    and reminders.status in ('pending', 'queued', 'scheduled', 'retry_pending', 'sent')
  limit 1
) r on true
group by c.organization_id;

comment on view public.organization_renewal_readiness is
  'Org-scoped readiness rollup for reporting and command-center analytics.';

create or replace view public.contract_trusted_reminder_status
with (security_invoker = true) as
select
  c.organization_id,
  c.id as contract_id,
  c.owner_user_id,
  coalesce(cm.needs_review, true) as needs_review,
  cm.notice_deadline_date,
  cm.renewal_date,
  exists (
    select 1 from public.reminders r
    where r.contract_id = c.id
      and r.status in ('pending', 'queued', 'scheduled', 'retry_pending', 'sent')
  ) as has_active_reminder
from public.contracts c
left join public.contract_metadata cm on cm.contract_id = c.id;

comment on view public.contract_trusted_reminder_status is
  'Contract-level reminder readiness reporting view scoped by organization.';

create or replace view public.owner_accountability_summary
with (security_invoker = true) as
select
  c.organization_id,
  c.owner_user_id,
  count(*)::integer as assigned_contracts,
  count(*) filter (where coalesce(cm.needs_review, true))::integer as needs_review_count,
  count(*) filter (where cm.notice_deadline_date is not null and cm.notice_deadline_date <= current_date + interval '30 days')::integer as upcoming_notice_count
from public.contracts c
left join public.contract_metadata cm on cm.contract_id = c.id
group by c.organization_id, c.owner_user_id;

comment on view public.owner_accountability_summary is
  'Owner-level accountability rollup for renewal operations.';

create or replace view public.upcoming_notice_deadlines
with (security_invoker = true) as
select
  c.organization_id,
  c.id as contract_id,
  c.owner_user_id,
  cm.contract_title,
  cm.notice_deadline_date,
  cm.renewal_date,
  cm.contract_value_amount,
  cm.contract_value_currency
from public.contracts c
join public.contract_metadata cm on cm.contract_id = c.id
where cm.notice_deadline_date is not null
  and cm.notice_deadline_date <= current_date + interval '90 days';

comment on view public.upcoming_notice_deadlines is
  'Upcoming notice deadline reporting view for opt-out clock operations.';

create or replace view public.spend_at_risk_summary
with (security_invoker = true) as
select
  c.organization_id,
  coalesce(cm.contract_value_currency, 'USD') as currency,
  count(*)::integer as contract_count,
  coalesce(sum(cm.contract_value_amount), 0) as estimated_spend_at_risk
from public.contracts c
join public.contract_metadata cm on cm.contract_id = c.id
where coalesce(cm.needs_review, true)
   or cm.notice_deadline_date <= current_date + interval '30 days'
   or cm.auto_renewal = true
group by c.organization_id, coalesce(cm.contract_value_currency, 'USD');

comment on view public.spend_at_risk_summary is
  'Spend-at-risk rollup for reviewed reporting, bounded to renewal-control signals.';

create index if not exists contract_audit_events_org_created_idx on public.contract_audit_events (organization_id, created_at desc);
create index if not exists trusted_reminder_gate_events_org_created_idx on public.trusted_reminder_gate_events (organization_id, created_at desc);
create index if not exists trust_exception_approval_events_org_created_idx on public.trust_exception_approval_events (organization_id, created_at desc);
create index if not exists renewal_decision_events_org_created_idx on public.renewal_decision_events (organization_id, created_at desc);
create index if not exists contract_import_batches_org_status_idx on public.contract_import_batches (organization_id, status, created_at desc);
create index if not exists contract_import_rows_org_batch_idx on public.contract_import_rows (organization_id, batch_id, row_number);
create index if not exists contract_import_errors_org_batch_idx on public.contract_import_errors (organization_id, batch_id, created_at desc);
create index if not exists usage_import_batches_org_status_idx on public.usage_import_batches (organization_id, status, created_at desc);
create index if not exists usage_import_rows_org_batch_idx on public.usage_import_rows (organization_id, batch_id, row_number);
create index if not exists contract_usage_matches_org_contract_idx on public.contract_usage_matches (organization_id, contract_id);
create index if not exists unmatched_usage_rows_org_idx on public.unmatched_usage_rows (organization_id, created_at desc);
create index if not exists duplicate_vendor_spend_org_status_idx on public.duplicate_vendor_spend (organization_id, status, created_at desc);
create index if not exists license_waste_opportunities_org_status_idx on public.license_waste_opportunities (organization_id, status, created_at desc);

alter table public.contract_audit_events enable row level security;
alter table public.trusted_reminder_gate_events enable row level security;
alter table public.trust_exception_approval_events enable row level security;
alter table public.renewal_decision_events enable row level security;
alter table public.contract_import_batches enable row level security;
alter table public.contract_import_rows enable row level security;
alter table public.contract_import_errors enable row level security;
alter table public.usage_import_batches enable row level security;
alter table public.usage_import_rows enable row level security;
alter table public.contract_usage_matches enable row level security;
alter table public.unmatched_usage_rows enable row level security;
alter table public.duplicate_vendor_spend enable row level security;
alter table public.license_waste_opportunities enable row level security;

create policy "members can read contract audit events" on public.contract_audit_events
for select using (exists (select 1 from public.memberships where memberships.organization_id = contract_audit_events.organization_id and memberships.user_id = auth.uid()));

create policy "members can read trusted reminder gate events" on public.trusted_reminder_gate_events
for select using (exists (select 1 from public.memberships where memberships.organization_id = trusted_reminder_gate_events.organization_id and memberships.user_id = auth.uid()));

create policy "members can read trust exception approval events" on public.trust_exception_approval_events
for select using (exists (select 1 from public.memberships where memberships.organization_id = trust_exception_approval_events.organization_id and memberships.user_id = auth.uid()));

create policy "members can read renewal decision events" on public.renewal_decision_events
for select using (exists (select 1 from public.memberships where memberships.organization_id = renewal_decision_events.organization_id and memberships.user_id = auth.uid()));

create policy "members can read contract import batches" on public.contract_import_batches
for select using (exists (select 1 from public.memberships where memberships.organization_id = contract_import_batches.organization_id and memberships.user_id = auth.uid()));

create policy "review-capable members can create contract import batches" on public.contract_import_batches
for insert with check (exists (select 1 from public.memberships where memberships.organization_id = contract_import_batches.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator', 'reviewer')));

create policy "creator admin operator can update contract import batches" on public.contract_import_batches
for update using (exists (select 1 from public.memberships where memberships.organization_id = contract_import_batches.organization_id and memberships.user_id = auth.uid() and (memberships.role in ('owner', 'admin', 'operator') or contract_import_batches.actor_user_id = auth.uid())))
with check (exists (select 1 from public.memberships where memberships.organization_id = contract_import_batches.organization_id and memberships.user_id = auth.uid() and (memberships.role in ('owner', 'admin', 'operator') or contract_import_batches.actor_user_id = auth.uid())));

create policy "members can read contract import rows" on public.contract_import_rows
for select using (exists (select 1 from public.memberships where memberships.organization_id = contract_import_rows.organization_id and memberships.user_id = auth.uid()));

create policy "members can read contract import errors" on public.contract_import_errors
for select using (exists (select 1 from public.memberships where memberships.organization_id = contract_import_errors.organization_id and memberships.user_id = auth.uid()));

create policy "members can read usage import batches" on public.usage_import_batches
for select using (exists (select 1 from public.memberships where memberships.organization_id = usage_import_batches.organization_id and memberships.user_id = auth.uid()));

create policy "review-capable members can create usage import batches" on public.usage_import_batches
for insert with check (exists (select 1 from public.memberships where memberships.organization_id = usage_import_batches.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator', 'reviewer')));

create policy "creator admin operator can update usage import batches" on public.usage_import_batches
for update using (exists (select 1 from public.memberships where memberships.organization_id = usage_import_batches.organization_id and memberships.user_id = auth.uid() and (memberships.role in ('owner', 'admin', 'operator') or usage_import_batches.actor_user_id = auth.uid())))
with check (exists (select 1 from public.memberships where memberships.organization_id = usage_import_batches.organization_id and memberships.user_id = auth.uid() and (memberships.role in ('owner', 'admin', 'operator') or usage_import_batches.actor_user_id = auth.uid())));

create policy "members can read usage import rows" on public.usage_import_rows
for select using (exists (select 1 from public.memberships where memberships.organization_id = usage_import_rows.organization_id and memberships.user_id = auth.uid()));

create policy "members can read contract usage matches" on public.contract_usage_matches
for select using (exists (select 1 from public.memberships where memberships.organization_id = contract_usage_matches.organization_id and memberships.user_id = auth.uid()));

create policy "members can read unmatched usage rows" on public.unmatched_usage_rows
for select using (exists (select 1 from public.memberships where memberships.organization_id = unmatched_usage_rows.organization_id and memberships.user_id = auth.uid()));

create policy "members can read duplicate vendor spend" on public.duplicate_vendor_spend
for select using (exists (select 1 from public.memberships where memberships.organization_id = duplicate_vendor_spend.organization_id and memberships.user_id = auth.uid()));

create policy "admin operator can review duplicate vendor spend" on public.duplicate_vendor_spend
for update using (exists (select 1 from public.memberships where memberships.organization_id = duplicate_vendor_spend.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator')))
with check (exists (select 1 from public.memberships where memberships.organization_id = duplicate_vendor_spend.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator')));

create policy "members can read license waste opportunities" on public.license_waste_opportunities
for select using (exists (select 1 from public.memberships where memberships.organization_id = license_waste_opportunities.organization_id and memberships.user_id = auth.uid()));

create policy "admin operator can review license waste opportunities" on public.license_waste_opportunities
for update using (exists (select 1 from public.memberships where memberships.organization_id = license_waste_opportunities.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator')))
with check (exists (select 1 from public.memberships where memberships.organization_id = license_waste_opportunities.organization_id and memberships.user_id = auth.uid() and memberships.role in ('owner', 'admin', 'operator')));
