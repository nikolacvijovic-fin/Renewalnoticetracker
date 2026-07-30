alter table public.saas_opt_out_windows
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists workflow_status text not null default 'needs_review',
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists accepted_risk_at timestamptz,
  add column if not exists ignored_at timestamptz,
  add column if not exists decision_recorded_at timestamptz;

alter table public.saas_opt_out_windows
  drop constraint if exists saas_opt_out_windows_workflow_status_check;

alter table public.saas_opt_out_windows
  add constraint saas_opt_out_windows_workflow_status_check
  check (workflow_status in (
    'needs_review',
    'ready',
    'owner_assigned',
    'decision_needed',
    'resolved',
    'accepted_risk',
    'ignored'
  ));

alter table public.saas_contract_risk_findings
  drop constraint if exists saas_contract_risk_findings_finding_type_check;

alter table public.saas_contract_risk_findings
  add constraint saas_contract_risk_findings_finding_type_check
  check (finding_type in (
    'auto_renewal',
    'missing_notice_deadline',
    'expired_opt_out',
    'critical_opt_out',
    'deadline_soon',
    'weak_evidence',
    'missing_owner',
    'high_spend_at_risk',
    'contract_saas_metadata_conflict'
  ));

alter table public.saas_contract_risk_findings
  drop constraint if exists saas_contract_risk_findings_status_check;

alter table public.saas_contract_risk_findings
  add constraint saas_contract_risk_findings_status_check
  check (status in ('open', 'resolved', 'accepted_risk', 'ignored'));

create index if not exists saas_opt_out_windows_org_workflow_idx
  on public.saas_opt_out_windows (organization_id, workflow_status, opt_out_deadline);

create index if not exists saas_opt_out_windows_org_owner_idx
  on public.saas_opt_out_windows (organization_id, owner_user_id, opt_out_deadline);

create index if not exists saas_contract_terms_org_contract_idx
  on public.saas_contract_terms (organization_id, contract_id, updated_at desc);
