create table if not exists public.revenue_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date null,
  period_end date null,
  status text not null default 'active',
  summary jsonb not null default '{}',
  total_renewal_value_at_risk numeric not null default 0 check (total_renewal_value_at_risk >= 0),
  price_increase_exposure numeric not null default 0 check (price_increase_exposure >= 0),
  savings_identified numeric not null default 0 check (savings_identified >= 0),
  savings_approved numeric not null default 0 check (savings_approved >= 0),
  savings_realized numeric not null default 0 check (savings_realized >= 0),
  net_commercial_impact numeric not null default 0,
  currency text null,
  signal_count integer not null default 0 check (signal_count >= 0),
  metric_count integer not null default 0 check (metric_count >= 0),
  insight_count integer not null default 0 check (insight_count >= 0),
  source_fingerprint text not null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_intelligence_snapshots_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint revenue_intelligence_snapshots_summary_bounds_check check (octet_length(summary::text) <= 8000)
);

create table if not exists public.revenue_risk_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  contract_id uuid null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid null references public.renewal_commercial_decisions(id) on delete set null,
  quote_comparison_id uuid null references public.renewal_quote_comparisons(id) on delete set null,
  savings_opportunity_id uuid null references public.savings_opportunities(id) on delete set null,
  negotiation_brief_id uuid null references public.renewal_negotiation_briefs(id) on delete set null,
  outreach_opportunity_id uuid null references public.internal_outreach_opportunities(id) on delete set null,
  signal_type text not null,
  severity text not null,
  title text not null,
  summary text not null,
  vendor_name text null,
  category_name text null,
  amount numeric not null default 0 check (amount >= 0),
  currency text null,
  evidence_confidence numeric null check (evidence_confidence is null or (evidence_confidence >= 0 and evidence_confidence <= 1)),
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  warning_codes text[] not null default '{}',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_risk_signals_type_check check (signal_type in (
    'renewal_at_risk','price_increase','critical_quote_finding','savings_opportunity','vendor_concentration','category_concentration',
    'decision_blocked','approval_stalled','negotiation_in_progress','outreach_pending','trusted_reminder_blocked','weak_contract_evidence',
    'expired_notice_deadline','expansion_signal','churn_prevention'
  )),
  constraint revenue_risk_signals_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint revenue_risk_signals_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint revenue_risk_signals_text_bounds_check check (char_length(title) <= 180 and char_length(summary) <= 900 and char_length(coalesce(vendor_name,'')) <= 180 and char_length(coalesce(category_name,'')) <= 180)
);

create table if not exists public.commercial_impact_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  contract_id uuid null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid null references public.renewal_commercial_decisions(id) on delete set null,
  quote_comparison_id uuid null references public.renewal_quote_comparisons(id) on delete set null,
  savings_opportunity_id uuid null references public.savings_opportunities(id) on delete set null,
  metric_type text not null,
  label text not null,
  amount numeric not null default 0 check (amount >= 0),
  currency text null,
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  evidence_confidence numeric null check (evidence_confidence is null or (evidence_confidence >= 0 and evidence_confidence <= 1)),
  metadata jsonb not null default '{}',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_impact_metrics_type_check check (metric_type in (
    'renewal_value_at_risk','price_increase_exposure','savings_identified','savings_approved','savings_realized',
    'negotiation_pipeline_value','blocked_decision_value','outreach_pipeline_value','vendor_concentration_value',
    'category_concentration_value','forecasted_renewal_spend','forecasted_savings','net_commercial_impact'
  )),
  constraint commercial_impact_metrics_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint commercial_impact_metrics_text_bounds_check check (char_length(label) <= 180 and octet_length(metadata::text) <= 6000)
);

create table if not exists public.vendor_category_intelligence_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  vendor_name text null,
  category_name text null,
  summary_type text not null,
  contract_count integer not null default 0 check (contract_count >= 0),
  renewal_value numeric not null default 0 check (renewal_value >= 0),
  risk_signal_count integer not null default 0 check (risk_signal_count >= 0),
  currency text null,
  severity text not null default 'info',
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_category_summary_type_check check (summary_type in ('vendor', 'category')),
  constraint vendor_category_summary_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint vendor_category_summary_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint vendor_category_summary_text_bounds_check check (char_length(coalesce(vendor_name,'')) <= 180 and char_length(coalesce(category_name,'')) <= 180)
);

create table if not exists public.revenue_forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  scenario text not null,
  forecasted_renewal_spend numeric not null default 0 check (forecasted_renewal_spend >= 0),
  forecasted_savings numeric not null default 0 check (forecasted_savings >= 0),
  net_commercial_impact numeric not null default 0,
  risk_adjusted_exposure numeric not null default 0 check (risk_adjusted_exposure >= 0),
  currency text null,
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  assumptions text[] not null default '{}',
  warning_codes text[] not null default '{}',
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_forecast_scenarios_scenario_check check (scenario in ('conservative', 'expected', 'aggressive', 'risk_adjusted')),
  constraint revenue_forecast_scenarios_status_check check (status in ('active', 'reviewed', 'archived'))
);

create table if not exists public.executive_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  title text not null,
  summary text not null,
  severity text not null,
  recommended_action text not null,
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  reviewed boolean not null default false,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_insights_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint executive_insights_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint executive_insights_text_bounds_check check (char_length(title) <= 180 and char_length(summary) <= 900 and char_length(recommended_action) <= 300)
);

create table if not exists public.revenue_intelligence_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid null references public.revenue_intelligence_snapshots(id) on delete set null,
  signal_id uuid null references public.revenue_risk_signals(id) on delete cascade,
  metric_id uuid null references public.commercial_impact_metrics(id) on delete cascade,
  insight_id uuid null references public.executive_insights(id) on delete cascade,
  contract_id uuid null references public.contracts(id) on delete cascade,
  commercial_decision_id uuid null references public.renewal_commercial_decisions(id) on delete set null,
  quote_comparison_id uuid null references public.renewal_quote_comparisons(id) on delete set null,
  savings_opportunity_id uuid null references public.savings_opportunities(id) on delete set null,
  negotiation_brief_id uuid null references public.renewal_negotiation_briefs(id) on delete set null,
  outreach_opportunity_id uuid null references public.internal_outreach_opportunities(id) on delete set null,
  evidence_type text not null,
  evidence_id uuid null,
  evidence_label text not null,
  evidence_url text null,
  evidence_confidence numeric null check (evidence_confidence is null or (evidence_confidence >= 0 and evidence_confidence <= 1)),
  source_module text not null,
  source_fingerprint text not null,
  status text not null default 'active',
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_evidence_links_status_check check (status in ('active', 'reviewed', 'archived')),
  constraint revenue_evidence_links_text_bounds_check check (char_length(evidence_type) <= 120 and char_length(evidence_label) <= 220 and (evidence_url is null or char_length(evidence_url) <= 300))
);

create index if not exists idx_revenue_snapshots_org_period on public.revenue_intelligence_snapshots(organization_id, period_start, period_end, created_at desc);
create index if not exists idx_revenue_snapshots_fingerprint on public.revenue_intelligence_snapshots(organization_id, source_fingerprint);
create index if not exists idx_revenue_signals_org_type on public.revenue_risk_signals(organization_id, signal_type, status, severity);
create index if not exists idx_revenue_signals_contract on public.revenue_risk_signals(organization_id, contract_id, status);
create index if not exists idx_revenue_signals_vendor on public.revenue_risk_signals(organization_id, vendor_name, status);
create index if not exists idx_revenue_signals_category on public.revenue_risk_signals(organization_id, category_name, status);
create index if not exists idx_revenue_signals_fingerprint on public.revenue_risk_signals(organization_id, source_fingerprint);
create index if not exists idx_revenue_metrics_org_type on public.commercial_impact_metrics(organization_id, metric_type, status);
create index if not exists idx_revenue_metrics_contract on public.commercial_impact_metrics(organization_id, contract_id, status);
create index if not exists idx_revenue_metrics_fingerprint on public.commercial_impact_metrics(organization_id, source_fingerprint);
create index if not exists idx_vendor_category_summary_vendor on public.vendor_category_intelligence_summaries(organization_id, vendor_name, status);
create index if not exists idx_vendor_category_summary_category on public.vendor_category_intelligence_summaries(organization_id, category_name, status);
create index if not exists idx_vendor_category_summary_fingerprint on public.vendor_category_intelligence_summaries(organization_id, source_fingerprint);
create index if not exists idx_revenue_forecasts_org_scenario on public.revenue_forecast_scenarios(organization_id, scenario, status);
create index if not exists idx_revenue_forecasts_fingerprint on public.revenue_forecast_scenarios(organization_id, source_fingerprint);
create index if not exists idx_executive_insights_org_severity on public.executive_insights(organization_id, severity, status, reviewed);
create index if not exists idx_executive_insights_fingerprint on public.executive_insights(organization_id, source_fingerprint);
create index if not exists idx_revenue_evidence_org_contract on public.revenue_intelligence_evidence_links(organization_id, contract_id, status);
create index if not exists idx_revenue_evidence_fingerprint on public.revenue_intelligence_evidence_links(organization_id, source_fingerprint);

create unique index if not exists idx_revenue_signals_active_unique on public.revenue_risk_signals(organization_id, source_fingerprint) where status = 'active';
create unique index if not exists idx_revenue_metrics_active_unique on public.commercial_impact_metrics(organization_id, source_fingerprint) where status = 'active';
create unique index if not exists idx_vendor_category_active_unique on public.vendor_category_intelligence_summaries(organization_id, source_fingerprint) where status = 'active';
create unique index if not exists idx_revenue_forecasts_active_unique on public.revenue_forecast_scenarios(organization_id, source_fingerprint) where status = 'active';
create unique index if not exists idx_executive_insights_active_unique on public.executive_insights(organization_id, source_fingerprint) where status = 'active';
create unique index if not exists idx_revenue_evidence_active_unique on public.revenue_intelligence_evidence_links(organization_id, source_fingerprint) where status = 'active';

alter table public.revenue_intelligence_snapshots enable row level security;
alter table public.revenue_risk_signals enable row level security;
alter table public.commercial_impact_metrics enable row level security;
alter table public.vendor_category_intelligence_summaries enable row level security;
alter table public.revenue_forecast_scenarios enable row level security;
alter table public.executive_insights enable row level security;
alter table public.revenue_intelligence_evidence_links enable row level security;

drop policy if exists "Org members can read revenue intelligence snapshots" on public.revenue_intelligence_snapshots;
create policy "Org members can read revenue intelligence snapshots" on public.revenue_intelligence_snapshots for select
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_snapshots.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write revenue intelligence snapshots" on public.revenue_intelligence_snapshots;
create policy "Review roles can write revenue intelligence snapshots" on public.revenue_intelligence_snapshots for all
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_snapshots.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_snapshots.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read revenue risk signals" on public.revenue_risk_signals;
create policy "Org members can read revenue risk signals" on public.revenue_risk_signals for select
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_risk_signals.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write revenue risk signals" on public.revenue_risk_signals;
create policy "Review roles can write revenue risk signals" on public.revenue_risk_signals for all
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_risk_signals.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = revenue_risk_signals.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read commercial impact metrics" on public.commercial_impact_metrics;
create policy "Org members can read commercial impact metrics" on public.commercial_impact_metrics for select
  using (exists (select 1 from public.memberships m where m.organization_id = commercial_impact_metrics.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write commercial impact metrics" on public.commercial_impact_metrics;
create policy "Review roles can write commercial impact metrics" on public.commercial_impact_metrics for all
  using (exists (select 1 from public.memberships m where m.organization_id = commercial_impact_metrics.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = commercial_impact_metrics.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read vendor category intelligence" on public.vendor_category_intelligence_summaries;
create policy "Org members can read vendor category intelligence" on public.vendor_category_intelligence_summaries for select
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_category_intelligence_summaries.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write vendor category intelligence" on public.vendor_category_intelligence_summaries;
create policy "Review roles can write vendor category intelligence" on public.vendor_category_intelligence_summaries for all
  using (exists (select 1 from public.memberships m where m.organization_id = vendor_category_intelligence_summaries.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = vendor_category_intelligence_summaries.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read revenue forecasts" on public.revenue_forecast_scenarios;
create policy "Org members can read revenue forecasts" on public.revenue_forecast_scenarios for select
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_forecast_scenarios.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write revenue forecasts" on public.revenue_forecast_scenarios;
create policy "Review roles can write revenue forecasts" on public.revenue_forecast_scenarios for all
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_forecast_scenarios.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = revenue_forecast_scenarios.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read executive insights" on public.executive_insights;
create policy "Org members can read executive insights" on public.executive_insights for select
  using (exists (select 1 from public.memberships m where m.organization_id = executive_insights.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write executive insights" on public.executive_insights;
create policy "Review roles can write executive insights" on public.executive_insights for all
  using (exists (select 1 from public.memberships m where m.organization_id = executive_insights.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = executive_insights.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));

drop policy if exists "Org members can read revenue evidence links" on public.revenue_intelligence_evidence_links;
create policy "Org members can read revenue evidence links" on public.revenue_intelligence_evidence_links for select
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_evidence_links.organization_id and m.user_id = auth.uid()));
drop policy if exists "Review roles can write revenue evidence links" on public.revenue_intelligence_evidence_links;
create policy "Review roles can write revenue evidence links" on public.revenue_intelligence_evidence_links for all
  using (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')))
  with check (exists (select 1 from public.memberships m where m.organization_id = revenue_intelligence_evidence_links.organization_id and m.user_id = auth.uid() and m.role in ('admin','operator','reviewer')));
