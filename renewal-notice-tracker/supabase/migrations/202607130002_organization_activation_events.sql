create table if not exists public.organization_activation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references public.users(id),
  event_type text not null check (
    event_type in (
      'onboarding_started',
      'first_contract_imported',
      'first_owner_assigned',
      'first_notice_deadline_reviewed',
      'first_evidence_reviewed',
      'trust_exception_requested',
      'trust_exception_approved',
      'first_trusted_reminder_activated',
      'organization_activated'
    )
  ),
  contract_id uuid null references public.contracts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organization_activation_events enable row level security;

create index if not exists idx_organization_activation_events_org_created
  on public.organization_activation_events(organization_id, created_at desc);

create unique index if not exists idx_organization_activation_events_once_per_org
  on public.organization_activation_events(organization_id, event_type);

create policy "members can read organization activation events"
on public.organization_activation_events
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = organization_activation_events.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can create organization activation events"
on public.organization_activation_events
for insert with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = organization_activation_events.organization_id
      and memberships.user_id = auth.uid()
  )
);
