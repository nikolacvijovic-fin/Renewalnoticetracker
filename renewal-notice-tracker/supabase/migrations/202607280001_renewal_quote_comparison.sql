create table if not exists public.renewal_quote_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  quote_file_id uuid null references public.contract_files(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'processing', 'completed', 'failed', 'reviewed', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'file_upload', 'python_intelligence')),
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  current_total_amount numeric null,
  proposed_total_amount numeric null,
  currency text null,
  price_delta_amount numeric null,
  price_delta_percent numeric null,
  overall_risk_level text not null default 'unknown' check (overall_risk_level in ('unknown', 'info', 'low', 'medium', 'high', 'critical')),
  recommendation_summary text null,
  safe_error_message text null,
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.renewal_quote_comparison_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  comparison_id uuid not null references public.renewal_quote_comparisons(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  finding_type text not null check (finding_type in (
    'price_increase',
    'discount_removed',
    'sku_changed',
    'payment_terms_changed',
    'renewal_term_changed',
    'auto_renew_risk',
    'notice_window_risk',
    'usage_mismatch',
    'duplicate_vendor_risk',
    'unfavorable_clause_change'
  )),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  current_value jsonb null,
  proposed_value jsonb null,
  delta_value jsonb null,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  citation jsonb null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'accepted')),
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  comparison_id uuid null references public.renewal_quote_comparisons(id) on delete set null,
  opportunity_type text not null,
  title text not null,
  estimated_savings_amount numeric null,
  currency text null,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status text not null default 'open' check (status in ('open', 'in_review', 'accepted', 'dismissed', 'realized')),
  owner_user_id uuid null references auth.users(id) on delete set null,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewal_quote_comparisons_org_contract_idx
  on public.renewal_quote_comparisons(organization_id, contract_id, created_at desc);

create index if not exists renewal_quote_findings_org_comparison_idx
  on public.renewal_quote_comparison_findings(organization_id, comparison_id, created_at desc);

create index if not exists renewal_quote_findings_org_contract_status_idx
  on public.renewal_quote_comparison_findings(organization_id, contract_id, status);

create index if not exists savings_opportunities_org_contract_status_idx
  on public.savings_opportunities(organization_id, contract_id, status, created_at desc);

alter table public.renewal_quote_comparisons enable row level security;
alter table public.renewal_quote_comparison_findings enable row level security;
alter table public.savings_opportunities enable row level security;

drop policy if exists "Org members can read quote comparisons" on public.renewal_quote_comparisons;
create policy "Org members can read quote comparisons"
  on public.renewal_quote_comparisons for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparisons.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Reviewers can create quote comparisons" on public.renewal_quote_comparisons;
create policy "Reviewers can create quote comparisons"
  on public.renewal_quote_comparisons for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparisons.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Reviewers can update quote comparisons" on public.renewal_quote_comparisons;
create policy "Reviewers can update quote comparisons"
  on public.renewal_quote_comparisons for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparisons.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparisons.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read quote findings" on public.renewal_quote_comparison_findings;
create policy "Org members can read quote findings"
  on public.renewal_quote_comparison_findings for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparison_findings.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Reviewers can create quote findings" on public.renewal_quote_comparison_findings;
create policy "Reviewers can create quote findings"
  on public.renewal_quote_comparison_findings for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparison_findings.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Reviewers can update quote findings" on public.renewal_quote_comparison_findings;
create policy "Reviewers can update quote findings"
  on public.renewal_quote_comparison_findings for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparison_findings.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = renewal_quote_comparison_findings.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Org members can read savings opportunities" on public.savings_opportunities;
create policy "Org members can read savings opportunities"
  on public.savings_opportunities for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = savings_opportunities.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Reviewers can create savings opportunities" on public.savings_opportunities;
create policy "Reviewers can create savings opportunities"
  on public.savings_opportunities for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = savings_opportunities.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "Reviewers can update savings opportunities" on public.savings_opportunities;
create policy "Reviewers can update savings opportunities"
  on public.savings_opportunities for update
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = savings_opportunities.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = savings_opportunities.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'operator', 'reviewer')
    )
  );
