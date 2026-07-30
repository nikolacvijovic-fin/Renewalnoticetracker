create table if not exists public.cold_outreach_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  company_name text not null,
  website text null,
  website_hash text null,
  industry text null,
  company_size_band text not null default 'unknown',
  role_title text null,
  source_label text null,
  source_url text null,
  pain_signal text null,
  evidence_confidence numeric not null default 0 check (evidence_confidence >= 0 and evidence_confidence <= 1),
  suppression_status text not null default 'unknown',
  blocker_codes text[] not null default '{}',
  warning_codes text[] not null default '{}',
  safe_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cold_outreach_leads_size_band_check
    check (company_size_band in ('unknown', '1_50', '51_200', '201_1000', '1001_5000', '5000_plus')),
  constraint cold_outreach_leads_suppression_check
    check (suppression_status in ('unknown', 'not_suppressed', 'suppressed', 'opted_out', 'complained')),
  constraint cold_outreach_leads_source_required_check
    check (source_label is not null or source_url is not null),
  constraint cold_outreach_leads_text_bounds_check
    check (
      char_length(company_name) <= 160
      and (website is null or char_length(website) <= 500)
      and (industry is null or char_length(industry) <= 120)
      and (role_title is null or char_length(role_title) <= 120)
      and (source_label is null or char_length(source_label) <= 160)
      and (source_url is null or char_length(source_url) <= 500)
      and (pain_signal is null or char_length(pain_signal) <= 240)
    )
);

create table if not exists public.cold_outreach_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  offer_name text not null,
  target_customer text not null,
  primary_pain text not null,
  value_prop text not null,
  proof_points text[] not null default '{}',
  disallowed_claims text[] not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cold_outreach_offers_status_check
    check (status in ('active', 'archived')),
  constraint cold_outreach_offers_text_bounds_check
    check (
      char_length(offer_name) <= 160
      and char_length(target_customer) <= 240
      and char_length(primary_pain) <= 240
      and char_length(value_prop) <= 500
    )
);

create table if not exists public.cold_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.cold_outreach_leads(id) on delete cascade,
  offer_id uuid not null references public.cold_outreach_offers(id) on delete restrict,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  approval_state text not null default 'draft',
  variants jsonb not null default '[]',
  selected_variant_type text null,
  evidence_references jsonb not null default '[]',
  quality_score jsonb not null default '{}',
  safety_status text not null default 'needs_review',
  safety_reasons text[] not null default '{}',
  copy_allowed boolean not null default false,
  submitted_at timestamptz null,
  approved_for_copy_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cold_outreach_drafts_approval_state_check
    check (approval_state in ('draft', 'needs_review', 'approved_for_copy', 'rejected', 'archived')),
  constraint cold_outreach_drafts_variant_check
    check (selected_variant_type is null or selected_variant_type in ('concise_email', 'founder_led_email', 'linkedin_note', 'internal_reviewer_summary')),
  constraint cold_outreach_drafts_safety_check
    check (safety_status in ('safe', 'needs_review', 'blocked')),
  constraint cold_outreach_drafts_no_delivery_state_check
    check (position('send' in lower(approval_state)) = 0 and position('deliver' in lower(approval_state)) = 0 and position('sequence' in lower(approval_state)) = 0)
);

create table if not exists public.cold_outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.cold_outreach_leads(id) on delete cascade,
  draft_id uuid not null references public.cold_outreach_drafts(id) on delete cascade,
  approver_user_id uuid null references auth.users(id) on delete set null,
  acted_by_user_id uuid null references auth.users(id) on delete set null,
  approval_state text not null default 'needs_review',
  approved_claims text[] not null default '{}',
  reviewer_note text null,
  acted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cold_outreach_approvals_state_check
    check (approval_state in ('draft', 'needs_review', 'approved_for_copy', 'rejected', 'archived')),
  constraint cold_outreach_approvals_note_bounds_check
    check (reviewer_note is null or char_length(reviewer_note) <= 600)
);

create index if not exists idx_cold_outreach_leads_org_source
  on public.cold_outreach_leads(organization_id, source_label, source_url, created_at desc);
create index if not exists idx_cold_outreach_leads_org_suppression
  on public.cold_outreach_leads(organization_id, suppression_status, evidence_confidence);
create index if not exists idx_cold_outreach_offers_org_status
  on public.cold_outreach_offers(organization_id, status, created_at desc);
create index if not exists idx_cold_outreach_drafts_lead
  on public.cold_outreach_drafts(organization_id, lead_id, approval_state, created_at desc);
create index if not exists idx_cold_outreach_approvals_draft
  on public.cold_outreach_approvals(organization_id, draft_id, approval_state);

alter table public.cold_outreach_leads enable row level security;
alter table public.cold_outreach_offers enable row level security;
alter table public.cold_outreach_drafts enable row level security;
alter table public.cold_outreach_approvals enable row level security;

create policy "Review roles can read cold outreach leads"
  on public.cold_outreach_leads for select
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_leads.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can create cold outreach leads"
  on public.cold_outreach_leads for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_leads.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can update cold outreach leads"
  on public.cold_outreach_leads for update
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_leads.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_leads.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

create policy "Review roles can read cold outreach offers"
  on public.cold_outreach_offers for select
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_offers.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can create cold outreach offers"
  on public.cold_outreach_offers for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_offers.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can update cold outreach offers"
  on public.cold_outreach_offers for update
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_offers.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_offers.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

create policy "Review roles can read cold outreach drafts"
  on public.cold_outreach_drafts for select
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can create cold outreach drafts"
  on public.cold_outreach_drafts for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can update cold outreach drafts"
  on public.cold_outreach_drafts for update
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_drafts.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));

create policy "Review roles can read cold outreach approvals"
  on public.cold_outreach_approvals for select
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_approvals.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can create cold outreach approvals"
  on public.cold_outreach_approvals for insert
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_approvals.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
create policy "Review roles can update cold outreach approvals"
  on public.cold_outreach_approvals for update
  using (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_approvals.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = cold_outreach_approvals.organization_id and m.user_id = auth.uid() and m.role in ('admin', 'operator', 'reviewer')));
