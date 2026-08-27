-- Keep commercial proposal files unusable until extraction and comparison persistence finish.

alter table public.contract_files
  add column if not exists proposal_upload_status text null
    check (proposal_upload_status is null or proposal_upload_status in ('pending', 'ready', 'failed')),
  add column if not exists proposal_content_hash text null,
  add column if not exists proposal_failure_code text null,
  add column if not exists proposal_processed_at timestamptz null,
  add column if not exists storage_deleted_at timestamptz null;

create unique index if not exists contract_files_active_commercial_proposal_hash_idx
  on public.contract_files (contract_id, proposal_content_hash)
  where extraction_source = 'commercial_proposal'
    and proposal_content_hash is not null
    and proposal_upload_status in ('pending', 'ready');

comment on column public.contract_files.proposal_upload_status is
  'Commercial proposal intake lifecycle. Only ready rows may be presented as usable comparison evidence.';
comment on column public.contract_files.proposal_failure_code is
  'Stable sanitized failure code only; provider payloads and extracted customer content are forbidden.';
