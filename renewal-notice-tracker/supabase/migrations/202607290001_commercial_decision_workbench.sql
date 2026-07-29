create table if not exists public.renewal_commercial_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  recommended_action text not null default 'needs_review',
  decision_status text not null default 'draft',
  negotiation_posture text not null default 'legal_review_required',
  commercial_risk_level text not null default 'unknown',
  evidence_confidence numeric not null default 0 check (evidence_confidence >= 0 and evidence_confidence <= 1),
  estimated_savings_amount numeric null,
  currency text null,
  commercial_impact jsonb not null default '{}',
  renewal_deadline date null,
  notice_deadline date null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  decision_summary text null,
  blocker_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  finalized_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_commercial_decisions_action_check
    check (recommended_action in ('renew', 'renegotiate', 'cancel', 'escalate', 'defer', 'needs_review')),
  constraint renewal_commercial_decisions_status_check
    check (decision_status in ('draft', 'evidence_pending', 'ready_for_review', 'in_approval', 'approved', 'rejected', 'finalized', 'archived')),
  constraint renewal_commercial_decisions_posture_check
    check (negotiation_posture in (
      'accept_quote',
      'challenge_increase',
      'ask_for_discount',
      'request_term_change',
      'consolidate_vendor',
      'delay_renewal',
      'terminate_service',
      'legal_review_required'
    )),
  constraint renewal_commercial_decisions_risk_check
    check (commercial_risk_level in ('unknown', 'info', 'low', 'medium', 'high', 'critical'))
);

create table if not exists public.renewal_decision_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  evidence_type text not null,
  evidence_id uuid null,
  evidence_label text not null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  risk_level text null check (risk_level is null or risk_level in ('unknown', 'info', 'low', 'medium', 'high', 'critical')),
  metadata jsonb not null default '{}',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_decision_evidence_type_check
    check (evidence_type in (
      'contract_metadata',
      'contract_extraction_field',
      'renewal_quote_comparison',
      'renewal_quote_finding',
      'savings_opportunity',
      'trusted_reminder_gate',
      'renewal_decision',
      'enterprise_audit_event'
    ))
);

create table if not exists public.renewal_decision_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  step_order integer not null default 1 check (step_order >= 1),
  status text not null default 'pending',
  approver_user_id uuid null references auth.users(id) on delete set null,
  acted_by_user_id uuid null references auth.users(id) on delete set null,
  reviewer_note text null,
  reason_code text null,
  acted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_decision_approval_steps_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'skipped'))
);

create table if not exists public.renewal_decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  snapshot_type text not null default 'scoring',
  recommended_action text not null,
  decision_status text not null,
  negotiation_posture text not null,
  commercial_risk_level text not null,
  evidence_confidence numeric not null check (evidence_confidence >= 0 and evidence_confidence <= 1),
  estimated_savings_amount numeric null,
  currency text null,
  blocker_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  evidence_summary jsonb not null default '{}',
  audit_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_renewal_commercial_decisions_org_status
  on public.renewal_commercial_decisions(organization_id, decision_status);

create index if not exists idx_renewal_commercial_decisions_org_contract
  on public.renewal_commercial_decisions(organization_id, contract_id);

create unique index if not exists idx_renewal_commercial_decisions_one_active_per_contract
  on public.renewal_commercial_decisions(organization_id, contract_id)
  where decision_status <> 'archived';

create index if not exists idx_renewal_commercial_decisions_org_risk
  on public.renewal_commercial_decisions(organization_id, commercial_risk_level);

create index if not exists idx_renewal_commercial_decisions_due_dates
  on public.renewal_commercial_decisions(organization_id, renewal_deadline, notice_deadline);

create index if not exists idx_renewal_commercial_decisions_owner
  on public.renewal_commercial_decisions(organization_id, owner_user_id, decision_status);

create index if not exists idx_renewal_decision_evidence_links_decision
  on public.renewal_decision_evidence_links(organization_id, decision_id, evidence_type);

create unique index if not exists idx_renewal_decision_evidence_links_unique_evidence
  on public.renewal_decision_evidence_links(
    organization_id,
    decision_id,
    evidence_type,
    coalesce(evidence_id::text, ''),
    evidence_label
  );

create index if not exists idx_renewal_decision_approval_steps_decision
  on public.renewal_decision_approval_steps(organization_id, decision_id, step_order);

create index if not exists idx_renewal_decision_snapshots_decision
  on public.renewal_decision_snapshots(organization_id, decision_id, created_at desc);

alter table public.renewal_commercial_decisions enable row level security;
alter table public.renewal_decision_evidence_links enable row level security;
alter table public.renewal_decision_approval_steps enable row level security;
alter table public.renewal_decision_snapshots enable row level security;

drop policy if exists "Org members can read commercial decisions" on public.renewal_commercial_decisions;
create policy "Org members can read commercial decisions"
  on public.renewal_commercial_decisions for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_commercial_decisions.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Review roles can create commercial decisions" on public.renewal_commercial_decisions;
create policy "Review roles can create commercial decisions"
  on public.renewal_commercial_decisions for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_commercial_decisions.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Review roles can update commercial decisions" on public.renewal_commercial_decisions;
create policy "Review roles can update commercial decisions"
  on public.renewal_commercial_decisions for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_commercial_decisions.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_commercial_decisions.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read commercial decision evidence links" on public.renewal_decision_evidence_links;
create policy "Org members can read commercial decision evidence links"
  on public.renewal_decision_evidence_links for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_evidence_links.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Review roles can create commercial decision evidence links" on public.renewal_decision_evidence_links;
create policy "Review roles can create commercial decision evidence links"
  on public.renewal_decision_evidence_links for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_evidence_links.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read commercial decision approval steps" on public.renewal_decision_approval_steps;
create policy "Org members can read commercial decision approval steps"
  on public.renewal_decision_approval_steps for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_approval_steps.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Review roles can create commercial decision approval steps" on public.renewal_decision_approval_steps;
create policy "Review roles can create commercial decision approval steps"
  on public.renewal_decision_approval_steps for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_approval_steps.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Review roles can update commercial decision approval steps" on public.renewal_decision_approval_steps;
create policy "Review roles can update commercial decision approval steps"
  on public.renewal_decision_approval_steps for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_approval_steps.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_approval_steps.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read commercial decision snapshots" on public.renewal_decision_snapshots;
create policy "Org members can read commercial decision snapshots"
  on public.renewal_decision_snapshots for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_snapshots.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Review roles can create commercial decision snapshots" on public.renewal_decision_snapshots;
create policy "Review roles can create commercial decision snapshots"
  on public.renewal_decision_snapshots for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_decision_snapshots.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );
