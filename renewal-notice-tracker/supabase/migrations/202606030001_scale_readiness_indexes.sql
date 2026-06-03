create index if not exists idx_contracts_org_updated
  on public.contracts (organization_id, updated_at desc);

create index if not exists idx_contracts_org_owner
  on public.contracts (organization_id, owner_user_id);

create index if not exists idx_contracts_org_department
  on public.contracts (organization_id, department);

create index if not exists idx_contracts_org_status_tag
  on public.contracts (organization_id, status_tag);

create index if not exists idx_contract_metadata_contract_id
  on public.contract_metadata (contract_id);

create index if not exists idx_reminders_org_status_remind_at
  on public.reminders (organization_id, status, remind_at);

create index if not exists idx_reminders_status_retry_due
  on public.reminders (status, next_retry_at, remind_at);

create index if not exists idx_notes_contract_created
  on public.notes (contract_id, created_at desc);

create index if not exists idx_renewal_decisions_contract_decision_date
  on public.renewal_decisions (contract_id, decision_date desc, created_at desc);

create index if not exists idx_data_export_requests_org_status_requested
  on public.data_export_requests (organization_id, status, requested_at desc);

create index if not exists idx_data_export_requests_scope_status_requested
  on public.data_export_requests (export_scope, status, requested_at);

create index if not exists idx_ocr_jobs_status_queued
  on public.ocr_jobs (status, queued_at);

create index if not exists idx_audit_logs_org_entity_created
  on public.audit_logs (organization_id, entity_type, created_at desc);
