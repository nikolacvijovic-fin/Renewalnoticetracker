create table if not exists public.decision_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  decision_type text not null check (decision_type in (
    'recommendation',
    'blocker',
    'finding',
    'next_action',
    'trust_gap',
    'risk_segment'
  )),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 1000),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in (
    'open',
    'acknowledged',
    'resolved',
    'dismissed',
    'accepted_risk',
    'superseded'
  )),
  source text not null check (source in ('rule', 'ai', 'import_review', 'manual_review', 'system')),
  rule_id text,
  ai_fact_id uuid,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  trust_status text not null check (trust_status in ('trusted', 'proposed', 'weak', 'conflicted', 'blocked')),
  evidence_refs jsonb not null default '[]'::jsonb,
  allowed_actions jsonb not null default '[]'::jsonb,
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 1000),
  owner_user_id uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  superseded_by_decision_id uuid references public.decision_records (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists decision_records_touch_updated_at on public.decision_records;
create trigger decision_records_touch_updated_at
before update on public.decision_records
for each row execute function public.touch_updated_at();

create unique index if not exists decision_records_open_source_unique_idx
  on public.decision_records (
    organization_id,
    entity_type,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    decision_type,
    source,
    coalesce(rule_id, ''),
    coalesce(ai_fact_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('open', 'acknowledged');

create index if not exists decision_records_org_status_idx
  on public.decision_records (organization_id, status, severity, updated_at desc);

create index if not exists decision_records_org_entity_idx
  on public.decision_records (organization_id, entity_type, entity_id, updated_at desc);

alter table public.decision_records enable row level security;

create policy "members can read decision records"
on public.decision_records
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = decision_records.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "review roles can insert decision records"
on public.decision_records
for insert with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = decision_records.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
  or (
    decision_records.owner_user_id = auth.uid()
    and decision_records.status in ('open', 'acknowledged')
    and decision_records.decision_type in ('recommendation', 'blocker', 'next_action', 'trust_gap')
  )
);

create policy "review roles can update decision records"
on public.decision_records
for update using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = decision_records.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
  or (
    decision_records.owner_user_id = auth.uid()
    and decision_records.status in ('open', 'acknowledged')
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = decision_records.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
  or (
    decision_records.owner_user_id = auth.uid()
    and decision_records.status in ('open', 'acknowledged', 'resolved')
    and decision_records.decision_type in ('recommendation', 'blocker', 'next_action', 'trust_gap')
  )
);
