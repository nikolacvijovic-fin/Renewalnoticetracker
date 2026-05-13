alter table public.contract_metadata
  add column if not exists renewal_date date null,
  add column if not exists termination_window text null,
  add column if not exists review_mode text null,
  add column if not exists review_reason text null;
