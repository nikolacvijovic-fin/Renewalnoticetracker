create table if not exists public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  contract_file_id uuid not null,
  provider text not null,
  status text not null default 'pending',
  detection_reason text null,
  attempts integer not null default 0,
  error_message text null,
  queued_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  details_json jsonb not null default '{}'::jsonb
);
