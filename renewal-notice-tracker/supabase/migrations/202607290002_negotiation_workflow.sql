create table if not exists public.renewal_negotiation_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'draft',
  strategy text not null,
  executive_summary text not null,
  target_ask text not null,
  fallback_position text not null,
  evidence_summary jsonb not null default '{}',
  commercial_risk_summary text not null,
  savings_argument text null,
  deadline_risk text null,
  blocker_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  review_flags text[] not null default '{}',
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  submitted_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_negotiation_briefs_status_check
    check (status in ('draft', 'evidence_pending', 'ready_for_review', 'in_approval', 'approved', 'rejected', 'archived')),
  constraint renewal_negotiation_briefs_strategy_check
    check (strategy in (
      'challenge_price_increase',
      'request_discount',
      'preserve_existing_discount',
      'request_term_change',
      'request_usage_rights_review',
      'consolidate_vendor',
      'ask_for_benchmark',
      'escalate_to_legal',
      'cancel_or_nonrenew',
      'defer_decision'
    )),
  constraint renewal_negotiation_briefs_text_bounds_check
    check (
      char_length(executive_summary) <= 500
      and char_length(target_ask) <= 1000
      and char_length(fallback_position) <= 1000
      and char_length(commercial_risk_summary) <= 1000
      and (savings_argument is null or char_length(savings_argument) <= 1000)
      and (deadline_risk is null or char_length(deadline_risk) <= 1000)
    )
);

create table if not exists public.renewal_negotiation_brief_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  negotiation_brief_id uuid not null references public.renewal_negotiation_briefs(id) on delete cascade,
  evidence_type text not null,
  evidence_id uuid null,
  evidence_label text not null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_communication_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  negotiation_brief_id uuid not null references public.renewal_negotiation_briefs(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'draft',
  channel text not null default 'email',
  tone text not null default 'neutral',
  subject text null,
  draft_body text not null,
  internal_reviewer_note text not null,
  evidence_trace jsonb not null default '{}',
  submitted_at timestamptz null,
  approved_for_copy_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_communication_drafts_status_check
    check (status in ('draft', 'ready_for_review', 'in_approval', 'approved_for_copy', 'rejected', 'archived')),
  constraint vendor_communication_drafts_channel_check
    check (channel in ('email', 'internal_note', 'call_script')),
  constraint vendor_communication_drafts_tone_check
    check (tone in ('neutral', 'firm', 'collaborative', 'executive')),
  constraint vendor_communication_drafts_draft_only_check
    check (position('send' in lower(status)) = 0),
  constraint vendor_communication_drafts_text_bounds_check
    check (
      (subject is null or char_length(subject) <= 240)
      and char_length(draft_body) <= 4000
      and char_length(internal_reviewer_note) <= 1000
    )
);

create table if not exists public.vendor_communication_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  negotiation_brief_id uuid not null references public.renewal_negotiation_briefs(id) on delete cascade,
  vendor_communication_draft_id uuid not null references public.vendor_communication_drafts(id) on delete cascade,
  step_order integer not null default 1 check (step_order >= 1),
  status text not null default 'pending',
  approver_user_id uuid null references auth.users(id) on delete set null,
  acted_by_user_id uuid null references auth.users(id) on delete set null,
  reviewer_note text null,
  acted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_communication_approval_steps_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'skipped'))
);

create table if not exists public.negotiation_playbook_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid not null references public.renewal_commercial_decisions(id) on delete cascade,
  negotiation_brief_id uuid null references public.renewal_negotiation_briefs(id) on delete set null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negotiation_playbook_items_status_check
    check (status in ('open', 'done', 'archived')),
  constraint negotiation_playbook_items_text_bounds_check
    check (char_length(title) <= 160 and char_length(body) <= 1000)
);

create index if not exists idx_renewal_negotiation_briefs_org_contract
  on public.renewal_negotiation_briefs(organization_id, contract_id, status);
create index if not exists idx_renewal_negotiation_briefs_decision
  on public.renewal_negotiation_briefs(organization_id, commercial_decision_id, status);
create index if not exists idx_renewal_negotiation_briefs_strategy
  on public.renewal_negotiation_briefs(organization_id, strategy, status);
create index if not exists idx_renewal_negotiation_briefs_owner_approver
  on public.renewal_negotiation_briefs(organization_id, owner_user_id, approver_user_id);
create unique index if not exists idx_renewal_negotiation_briefs_one_active_per_decision
  on public.renewal_negotiation_briefs(organization_id, commercial_decision_id)
  where status <> 'archived';

create index if not exists idx_negotiation_brief_evidence_links_brief
  on public.renewal_negotiation_brief_evidence_links(organization_id, negotiation_brief_id, evidence_type);

create index if not exists idx_vendor_communication_drafts_decision
  on public.vendor_communication_drafts(organization_id, commercial_decision_id, status);
create index if not exists idx_vendor_communication_drafts_brief
  on public.vendor_communication_drafts(organization_id, negotiation_brief_id, status);
create index if not exists idx_vendor_communication_drafts_created
  on public.vendor_communication_drafts(organization_id, created_at desc);

create index if not exists idx_vendor_communication_approval_steps_draft
  on public.vendor_communication_approval_steps(organization_id, vendor_communication_draft_id, step_order);

create index if not exists idx_negotiation_playbook_items_decision
  on public.negotiation_playbook_items(organization_id, commercial_decision_id, status, created_at desc);

alter table public.renewal_negotiation_briefs enable row level security;
alter table public.renewal_negotiation_brief_evidence_links enable row level security;
alter table public.vendor_communication_drafts enable row level security;
alter table public.vendor_communication_approval_steps enable row level security;
alter table public.negotiation_playbook_items enable row level security;

drop policy if exists "Org members can read negotiation briefs" on public.renewal_negotiation_briefs;
create policy "Org members can read negotiation briefs"
  on public.renewal_negotiation_briefs for select
  using (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_briefs.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create negotiation briefs" on public.renewal_negotiation_briefs;
create policy "Review roles can create negotiation briefs"
  on public.renewal_negotiation_briefs for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_briefs.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update negotiation briefs" on public.renewal_negotiation_briefs;
create policy "Review roles can update negotiation briefs"
  on public.renewal_negotiation_briefs for update
  using (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_briefs.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_briefs.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read negotiation evidence" on public.renewal_negotiation_brief_evidence_links;
create policy "Org members can read negotiation evidence"
  on public.renewal_negotiation_brief_evidence_links for select
  using (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_brief_evidence_links.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create negotiation evidence" on public.renewal_negotiation_brief_evidence_links;
create policy "Review roles can create negotiation evidence"
  on public.renewal_negotiation_brief_evidence_links for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_brief_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update negotiation evidence" on public.renewal_negotiation_brief_evidence_links;
create policy "Review roles can update negotiation evidence"
  on public.renewal_negotiation_brief_evidence_links for update
  using (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_brief_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = renewal_negotiation_brief_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read vendor communication drafts" on public.vendor_communication_drafts;
create policy "Org members can read vendor communication drafts"
  on public.vendor_communication_drafts for select
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_drafts.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create vendor communication drafts" on public.vendor_communication_drafts;
create policy "Review roles can create vendor communication drafts"
  on public.vendor_communication_drafts for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update vendor communication drafts" on public.vendor_communication_drafts;
create policy "Review roles can update vendor communication drafts"
  on public.vendor_communication_drafts for update
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read vendor approval steps" on public.vendor_communication_approval_steps;
create policy "Org members can read vendor approval steps"
  on public.vendor_communication_approval_steps for select
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_approval_steps.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create vendor approval steps" on public.vendor_communication_approval_steps;
create policy "Review roles can create vendor approval steps"
  on public.vendor_communication_approval_steps for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update vendor approval steps" on public.vendor_communication_approval_steps;
create policy "Review roles can update vendor approval steps"
  on public.vendor_communication_approval_steps for update
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = vendor_communication_approval_steps.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Org members can read negotiation playbook items" on public.negotiation_playbook_items;
create policy "Org members can read negotiation playbook items"
  on public.negotiation_playbook_items for select
  using (exists (select 1 from public.memberships m where m.organization_id = negotiation_playbook_items.organization_id and m.user_id = auth.uid()));

drop policy if exists "Review roles can create negotiation playbook items" on public.negotiation_playbook_items;
create policy "Review roles can create negotiation playbook items"
  on public.negotiation_playbook_items for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = negotiation_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

drop policy if exists "Review roles can update negotiation playbook items" on public.negotiation_playbook_items;
create policy "Review roles can update negotiation playbook items"
  on public.negotiation_playbook_items for update
  using (exists (select 1 from public.memberships m where m.organization_id = negotiation_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = negotiation_playbook_items.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
