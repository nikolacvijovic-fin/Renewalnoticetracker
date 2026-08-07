create table if not exists public.governed_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_id uuid null references public.decision_records(id) on delete set null,
  entity_type text not null,
  entity_id uuid null,
  action_type text not null,
  title text not null,
  summary text not null,
  status text not null default 'proposed',
  source text not null,
  severity text not null,
  trust_status text not null,
  required_role text not null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  completed_by_user_id uuid null references auth.users(id) on delete set null,
  completed_at timestamptz null,
  due_at timestamptz null,
  blocked_reason text null,
  required_evidence jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  allowed_transitions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  superseded_by_action_id uuid null references public.governed_actions(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint governed_actions_status_check check (status in (
    'proposed',
    'blocked',
    'ready',
    'approved',
    'completed_manually',
    'dismissed',
    'accepted_risk',
    'superseded'
  )),
  constraint governed_actions_required_role_check check (required_role in ('reviewer', 'operator', 'admin', 'owner'))
);

create index if not exists governed_actions_org_status_idx
  on public.governed_actions (organization_id, status, severity);

create index if not exists governed_actions_org_entity_idx
  on public.governed_actions (organization_id, entity_type, entity_id);

create unique index if not exists governed_actions_active_source_unique_idx
  on public.governed_actions (
    organization_id,
    coalesce(decision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    entity_type,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    action_type,
    source
  )
  where status in ('proposed', 'blocked', 'ready', 'approved');

alter table public.governed_actions enable row level security;

drop policy if exists "members can read governed actions" on public.governed_actions;
create policy "members can read governed actions"
  on public.governed_actions
  for select using (
    exists (
      select 1
      from public.memberships
      where memberships.organization_id = governed_actions.organization_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists "review roles can insert governed actions" on public.governed_actions;
create policy "review roles can insert governed actions"
  on public.governed_actions
  for insert with check (
    exists (
      select 1
      from public.memberships
      where memberships.organization_id = governed_actions.organization_id
        and memberships.user_id = auth.uid()
        and memberships.role in ('admin', 'operator', 'reviewer')
    )
  );

drop policy if exists "review roles and linked owners can update governed actions" on public.governed_actions;
create policy "review roles and linked owners can update governed actions"
  on public.governed_actions
  for update using (
    exists (
      select 1
      from public.memberships
      where memberships.organization_id = governed_actions.organization_id
        and memberships.user_id = auth.uid()
        and (
          memberships.role in ('admin', 'operator', 'reviewer')
          or (
            memberships.role = 'owner'
            and governed_actions.owner_user_id = auth.uid()
            and governed_actions.action_type in (
              'review_notice_deadline',
              'resolve_metadata_conflict',
              'correct_import_row',
              'record_manual_opt_out_decision',
              'book_renewal_review',
              'update_next_action'
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.memberships
      where memberships.organization_id = governed_actions.organization_id
        and memberships.user_id = auth.uid()
        and (
          memberships.role in ('admin', 'operator', 'reviewer')
          or (
            memberships.role = 'owner'
            and governed_actions.owner_user_id = auth.uid()
            and governed_actions.action_type in (
              'review_notice_deadline',
              'resolve_metadata_conflict',
              'correct_import_row',
              'record_manual_opt_out_decision',
              'book_renewal_review',
              'update_next_action'
            )
          )
        )
    )
  );
