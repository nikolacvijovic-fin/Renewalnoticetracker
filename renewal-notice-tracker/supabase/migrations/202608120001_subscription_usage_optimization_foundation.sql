-- Starter Subscription Usage Optimization add-on foundation.
-- Additive only: enriches the existing commercial backbone without granting
-- Python or Java direct database authority.

alter table public.usage_import_batches
  add column if not exists idempotency_key text,
  add column if not exists file_name text,
  add column if not exists template_version text not null default 'subscription_usage_v1',
  add column if not exists committed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_count integer not null default 0 check (error_count >= 0),
  add column if not exists ready_count integer not null default 0 check (ready_count >= 0),
  add column if not exists rejected_count integer not null default 0 check (rejected_count >= 0),
  add column if not exists partial_success boolean not null default false;

alter table public.usage_import_rows
  add column if not exists normalized_product text,
  add column if not exists product_category text,
  add column if not exists annual_reviewed_cost numeric check (annual_reviewed_cost is null or annual_reviewed_cost >= 0),
  add column if not exists purchased_seats numeric check (purchased_seats is null or purchased_seats >= 0),
  add column if not exists assigned_seats numeric check (assigned_seats is null or assigned_seats >= 0),
  add column if not exists active_users_30d numeric check (active_users_30d is null or active_users_30d >= 0),
  add column if not exists active_users_90d numeric check (active_users_90d is null or active_users_90d >= 0),
  add column if not exists last_activity_at timestamptz,
  add column if not exists department text,
  add column if not exists owner_label text,
  add column if not exists contract_reference text,
  add column if not exists source_label text,
  add column if not exists collected_at timestamptz,
  add column if not exists trust_state text not null default 'needs_review'
    check (trust_state in ('trusted', 'needs_review', 'weak_evidence', 'rejected', 'sample')),
  add column if not exists confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  add column if not exists validation_status text not null default 'needs_review'
    check (validation_status in ('ready', 'needs_review', 'rejected')),
  add column if not exists issue_codes text[] not null default '{}',
  add column if not exists source_row_hash text,
  add column if not exists is_sample boolean not null default false;

alter table public.license_waste_opportunities
  add column if not exists reason_code text,
  add column if not exists calculation_version text,
  add column if not exists usage_row_ids uuid[] not null default '{}',
  add column if not exists matched_contract_ids uuid[] not null default '{}',
  add column if not exists utilization numeric check (utilization is null or utilization >= 0),
  add column if not exists unused_seats numeric check (unused_seats is null or unused_seats >= 0),
  add column if not exists confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  add column if not exists warnings text[] not null default '{}',
  add column if not exists recommended_action text,
  add column if not exists review_status text not null default 'open'
    check (review_status in ('open', 'accepted', 'rejected', 'deferred', 'action_planned')),
  add column if not exists reviewed_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists accepted_action text
    check (accepted_action is null or accepted_action in ('retain', 'reduce_seats', 'consolidate', 'terminate', 'renegotiate', 'insufficient_evidence')),
  add column if not exists realized_savings numeric check (realized_savings is null or realized_savings >= 0),
  add column if not exists is_sample boolean not null default false;

create unique index if not exists usage_import_batches_org_idempotency_idx
  on public.usage_import_batches (organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists usage_import_rows_org_batch_row_hash_idx
  on public.usage_import_rows (organization_id, batch_id, source_row_hash)
  where source_row_hash is not null;

create index if not exists usage_import_rows_org_validation_idx
  on public.usage_import_rows (organization_id, validation_status, created_at desc);

create index if not exists license_waste_opportunities_org_review_status_idx
  on public.license_waste_opportunities (organization_id, review_status, created_at desc);

comment on column public.usage_import_batches.idempotency_key is
  'Organization-scoped duplicate import protection key. Must not contain raw file contents.';

comment on column public.usage_import_rows.normalized_payload is
  'Bounded normalized usage row evidence. Must exclude raw uploaded file contents and provider payloads.';

comment on column public.license_waste_opportunities.review_status is
  'Human review state for subscription usage optimization findings. No automatic cancellation or vendor delivery is implied.';

