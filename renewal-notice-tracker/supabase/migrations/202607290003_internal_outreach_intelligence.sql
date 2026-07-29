create table if not exists public.internal_outreach_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid null references public.renewal_commercial_decisions(id) on delete set null,
  negotiation_brief_id uuid null references public.renewal_negotiation_briefs(id) on delete set null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  opportunity_type text not null,
  status text not null default 'draft',
  priority text not null default 'medium',
  audience text not null,
  recommended_channel text not null default 'internal_note',
  reason_summary text not null,
  expected_commercial_impact jsonb not null default '{}',
  evidence_confidence numeric not null default 0 check (evidence_confidence >= 0 and evidence_confidence <= 1),
  due_date date null,
  renewal_deadline date null,
  blocker_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  safety_status text not null default 'needs_review',
  safety_reasons text[] not null default '{}',
  submitted_at timestamptz null,
  approved_for_copy_at timestamptz null,
  dismissed_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_opportunities_type_check
    check (opportunity_type in (
      'renewal_risk',
      'price_increase',
      'savings_opportunity',
      'vendor_consolidation',
      'stakeholder_review',
      'legal_review',
      'finance_review',
      'procurement_review',
      'expansion_signal',
      'churn_prevention',
      'contract_cleanup',
      'negotiation_follow_up'
    )),
  constraint internal_outreach_opportunities_status_check
    check (status in ('draft', 'evidence_pending', 'ready_for_review', 'in_approval', 'approved_for_copy', 'dismissed', 'archived')),
  constraint internal_outreach_opportunities_priority_check
    check (priority in ('low', 'medium', 'high', 'critical')),
  constraint internal_outreach_opportunities_audience_check
    check (audience in ('internal_owner', 'finance', 'procurement', 'legal', 'executive_sponsor', 'customer_success', 'account_manager', 'vendor_contact_placeholder', 'stakeholder_group')),
  constraint internal_outreach_opportunities_channel_check
    check (recommended_channel in ('internal_email', 'internal_note', 'slack_draft', 'call_script', 'meeting_agenda', 'crm_note')),
  constraint internal_outreach_opportunities_safety_check
    check (safety_status in ('safe', 'needs_review', 'blocked')),
  constraint internal_outreach_opportunities_text_bounds_check
    check (char_length(reason_summary) <= 1000)
);

create table if not exists public.internal_outreach_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid null references public.renewal_commercial_decisions(id) on delete set null,
  negotiation_brief_id uuid null references public.renewal_negotiation_briefs(id) on delete set null,
  opportunity_id uuid not null references public.internal_outreach_opportunities(id) on delete cascade,
  evidence_type text not null,
  evidence_id uuid null,
  evidence_label text not null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_evidence_links_label_bounds_check
    check (char_length(evidence_label) <= 180)
);

create table if not exists public.internal_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  opportunity_id uuid not null references public.internal_outreach_opportunities(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'draft',
  audience text not null,
  channel text not null,
  tone text not null default 'concise',
  title text not null,
  subject_or_heading text null,
  body_preview text not null,
  key_points text[] not null default '{}',
  evidence_references text[] not null default '{}',
  ask text not null,
  next_step text not null,
  internal_reviewer_note text not null,
  safety_status text not null default 'needs_review',
  safety_reasons text[] not null default '{}',
  copy_allowed boolean not null default false,
  submitted_at timestamptz null,
  approved_for_copy_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_drafts_status_check
    check (status in ('draft', 'ready_for_review', 'in_approval', 'approved_for_copy', 'rejected', 'archived')),
  constraint internal_outreach_drafts_audience_check
    check (audience in ('internal_owner', 'finance', 'procurement', 'legal', 'executive_sponsor', 'customer_success', 'account_manager', 'vendor_contact_placeholder', 'stakeholder_group')),
  constraint internal_outreach_drafts_channel_check
    check (channel in ('internal_email', 'internal_note', 'slack_draft', 'call_script', 'meeting_agenda', 'crm_note')),
  constraint internal_outreach_drafts_tone_check
    check (tone in ('concise', 'executive', 'collaborative', 'firm', 'procurement', 'customer_success', 'legal')),
  constraint internal_outreach_drafts_safety_check
    check (safety_status in ('safe', 'needs_review', 'blocked')),
  constraint internal_outreach_drafts_no_send_status_check
    check (position('send' in lower(status)) = 0),
  constraint internal_outreach_drafts_text_bounds_check
    check (
      char_length(title) <= 160
      and (subject_or_heading is null or char_length(subject_or_heading) <= 240)
      and char_length(body_preview) <= 4000
      and char_length(ask) <= 1000
      and char_length(next_step) <= 1000
      and char_length(internal_reviewer_note) <= 1000
    )
);

create table if not exists public.internal_outreach_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  opportunity_id uuid not null references public.internal_outreach_opportunities(id) on delete cascade,
  outreach_draft_id uuid not null references public.internal_outreach_drafts(id) on delete cascade,
  step_order integer not null default 1 check (step_order >= 1),
  status text not null default 'pending',
  approver_user_id uuid null references auth.users(id) on delete set null,
  acted_by_user_id uuid null references auth.users(id) on delete set null,
  reviewer_note text null,
  acted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_approval_steps_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'skipped')),
  constraint internal_outreach_approval_steps_note_bounds_check
    check (reviewer_note is null or char_length(reviewer_note) <= 600)
);

create table if not exists public.internal_outreach_playbook_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  opportunity_id uuid not null references public.internal_outreach_opportunities(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_playbook_items_status_check
    check (status in ('open', 'done', 'archived')),
  constraint internal_outreach_playbook_items_text_bounds_check
    check (char_length(title) <= 160 and char_length(body) <= 1000)
);

create table if not exists public.internal_outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  opportunity_id uuid null references public.internal_outreach_opportunities(id) on delete set null,
  audience text not null,
  contact_identifier_hash text null,
  scoped_internal_user_id uuid null references auth.users(id) on delete set null,
  reason_code text not null,
  notes_preview text null,
  suppressed_by_user_id uuid null references auth.users(id) on delete set null,
  suppressed_at timestamptz not null default now(),
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_outreach_suppressions_audience_check
    check (audience in ('internal_owner', 'finance', 'procurement', 'legal', 'executive_sponsor', 'customer_success', 'account_manager', 'vendor_contact_placeholder', 'stakeholder_group')),
  constraint internal_outreach_suppressions_text_bounds_check
    check (char_length(reason_code) <= 80 and (notes_preview is null or char_length(notes_preview) <= 300)),
  constraint internal_outreach_suppressions_target_check
    check (contact_identifier_hash is not null or scoped_internal_user_id is not null or opportunity_id is not null)
);

create index if not exists idx_internal_outreach_opportunities_org_status
  on public.internal_outreach_opportunities(organization_id, status, priority, created_at desc);
create index if not exists idx_internal_outreach_opportunities_contract
  on public.internal_outreach_opportunities(organization_id, contract_id, status);
create index if not exists idx_internal_outreach_opportunities_decision
  on public.internal_outreach_opportunities(organization_id, commercial_decision_id, opportunity_type, status);
create index if not exists idx_internal_outreach_opportunities_brief
  on public.internal_outreach_opportunities(organization_id, negotiation_brief_id, opportunity_type, status);
create index if not exists idx_internal_outreach_opportunities_owner_approver
  on public.internal_outreach_opportunities(organization_id, owner_user_id, approver_user_id);
create index if not exists idx_internal_outreach_opportunities_audience_channel
  on public.internal_outreach_opportunities(organization_id, audience, recommended_channel, due_date);
create unique index if not exists idx_internal_outreach_one_active_per_source
  on public.internal_outreach_opportunities(
    organization_id,
    coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(commercial_decision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(negotiation_brief_id, '00000000-0000-0000-0000-000000000000'::uuid),
    opportunity_type,
    audience
  )
  where status not in ('dismissed', 'archived');

create index if not exists idx_internal_outreach_evidence_links_opportunity
  on public.internal_outreach_evidence_links(organization_id, opportunity_id, evidence_type);
create index if not exists idx_internal_outreach_drafts_opportunity
  on public.internal_outreach_drafts(organization_id, opportunity_id, status, channel);
create index if not exists idx_internal_outreach_drafts_approver
  on public.internal_outreach_drafts(organization_id, approver_user_id, status);
create index if not exists idx_internal_outreach_approval_steps_draft
  on public.internal_outreach_approval_steps(organization_id, outreach_draft_id, step_order);
create index if not exists idx_internal_outreach_playbook_items_opportunity
  on public.internal_outreach_playbook_items(organization_id, opportunity_id, status, created_at desc);
create index if not exists idx_internal_outreach_suppressions_lookup
  on public.internal_outreach_suppressions(organization_id, audience, contact_identifier_hash, scoped_internal_user_id, expires_at);

alter table public.internal_outreach_opportunities enable row level security;
alter table public.internal_outreach_evidence_links enable row level security;
alter table public.internal_outreach_drafts enable row level security;
alter table public.internal_outreach_approval_steps enable row level security;
alter table public.internal_outreach_playbook_items enable row level security;
alter table public.internal_outreach_suppressions enable row level security;

drop policy if exists "Org members can read internal outreach opportunities" on public.internal_outreach_opportunities;
create policy "Org members can read internal outreach opportunities"
  on public.internal_outreach_opportunities for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_opportunities.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach opportunities" on public.internal_outreach_opportunities;
create policy "Review roles can create internal outreach opportunities"
  on public.internal_outreach_opportunities for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_opportunities.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach opportunities" on public.internal_outreach_opportunities;
create policy "Review roles can update internal outreach opportunities"
  on public.internal_outreach_opportunities for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_opportunities.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_opportunities.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read internal outreach evidence" on public.internal_outreach_evidence_links;
create policy "Org members can read internal outreach evidence"
  on public.internal_outreach_evidence_links for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_evidence_links.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach evidence" on public.internal_outreach_evidence_links;
create policy "Review roles can create internal outreach evidence"
  on public.internal_outreach_evidence_links for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach evidence" on public.internal_outreach_evidence_links;
create policy "Review roles can update internal outreach evidence"
  on public.internal_outreach_evidence_links for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read internal outreach drafts" on public.internal_outreach_drafts;
create policy "Org members can read internal outreach drafts"
  on public.internal_outreach_drafts for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_drafts.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach drafts" on public.internal_outreach_drafts;
create policy "Review roles can create internal outreach drafts"
  on public.internal_outreach_drafts for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach drafts" on public.internal_outreach_drafts;
create policy "Review roles can update internal outreach drafts"
  on public.internal_outreach_drafts for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read internal outreach approval steps" on public.internal_outreach_approval_steps;
create policy "Org members can read internal outreach approval steps"
  on public.internal_outreach_approval_steps for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_approval_steps.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach approval steps" on public.internal_outreach_approval_steps;
create policy "Review roles can create internal outreach approval steps"
  on public.internal_outreach_approval_steps for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach approval steps" on public.internal_outreach_approval_steps;
create policy "Review roles can update internal outreach approval steps"
  on public.internal_outreach_approval_steps for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read internal outreach playbook items" on public.internal_outreach_playbook_items;
create policy "Org members can read internal outreach playbook items"
  on public.internal_outreach_playbook_items for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_playbook_items.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach playbook items" on public.internal_outreach_playbook_items;
create policy "Review roles can create internal outreach playbook items"
  on public.internal_outreach_playbook_items for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach playbook items" on public.internal_outreach_playbook_items;
create policy "Review roles can update internal outreach playbook items"
  on public.internal_outreach_playbook_items for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read internal outreach suppressions" on public.internal_outreach_suppressions;
create policy "Org members can read internal outreach suppressions"
  on public.internal_outreach_suppressions for select
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_suppressions.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create internal outreach suppressions" on public.internal_outreach_suppressions;
create policy "Review roles can create internal outreach suppressions"
  on public.internal_outreach_suppressions for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_suppressions.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update internal outreach suppressions" on public.internal_outreach_suppressions;
create policy "Review roles can update internal outreach suppressions"
  on public.internal_outreach_suppressions for update
  using (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_suppressions.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = internal_outreach_suppressions.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
