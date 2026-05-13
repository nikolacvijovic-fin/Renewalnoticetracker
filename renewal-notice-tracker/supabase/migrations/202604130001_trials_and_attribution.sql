alter table public.organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists acquisition_source text,
  add column if not exists acquisition_campaign text;
