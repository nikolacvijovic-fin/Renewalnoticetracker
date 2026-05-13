alter table public.contract_metadata
  add column if not exists has_conflict boolean not null default false,
  add column if not exists has_derived_date boolean not null default false,
  add column if not exists has_weak_evidence boolean not null default false,
  add column if not exists is_ocr_assisted boolean not null default false,
  add column if not exists is_manual_without_evidence boolean not null default false,
  add column if not exists changes_previously_verified_p0 boolean not null default false,
  add column if not exists accepted_unverified_risk_requested boolean not null default false;
