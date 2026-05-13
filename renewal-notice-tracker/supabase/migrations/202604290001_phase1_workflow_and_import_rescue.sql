alter table public.contracts
  add column if not exists cycle_status text not null default 'open',
  add column if not exists last_acknowledged_at timestamptz,
  add column if not exists last_acknowledged_by uuid;

alter table public.import_jobs
  add column if not exists error_report_json jsonb;
