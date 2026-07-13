create table if not exists public.contract_trust_exception_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  approved_by_user_id uuid not null references public.users(id),
  approval_type text not null check (
    approval_type in (
      'low_confidence_evidence',
      'manual_without_evidence',
      'unsupported_extraction'
    )
  ),
  approval_reason text not null check (char_length(trim(approval_reason)) > 0),
  source_field_keys text[] not null default '{}',
  evidence_confidence_at_approval numeric not null check (
    evidence_confidence_at_approval >= 0 and evidence_confidence_at_approval <= 1
  ),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by_user_id uuid null references public.users(id),
  revocation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_trust_exception_approvals_revocation_consistency check (
    (revoked_at is null and revoked_by_user_id is null and revocation_reason is null)
    or
    (revoked_at is not null and revoked_by_user_id is not null and char_length(trim(coalesce(revocation_reason, ''))) > 0)
  )
);

alter table public.contract_trust_exception_approvals enable row level security;

drop trigger if exists contract_trust_exception_approvals_touch_updated_at
on public.contract_trust_exception_approvals;
create trigger contract_trust_exception_approvals_touch_updated_at
before update on public.contract_trust_exception_approvals
for each row execute function public.touch_updated_at();

create index if not exists idx_contract_trust_exception_approvals_org_contract
  on public.contract_trust_exception_approvals(organization_id, contract_id);

create index if not exists idx_contract_trust_exception_approvals_org_type
  on public.contract_trust_exception_approvals(organization_id, approval_type);

create index if not exists idx_contract_trust_exception_approvals_active_contract
  on public.contract_trust_exception_approvals(contract_id)
  where revoked_at is null;

create index if not exists idx_contract_trust_exception_approvals_expires_at
  on public.contract_trust_exception_approvals(expires_at)
  where expires_at is not null;

create unique index if not exists idx_contract_trust_exception_approvals_single_open_null_expiry
  on public.contract_trust_exception_approvals(organization_id, contract_id, approval_type)
  where revoked_at is null and expires_at is null;

create policy "members can read contract trust exception approvals"
on public.contract_trust_exception_approvals
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_trust_exception_approvals.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "review-capable members can create contract trust exception approvals"
on public.contract_trust_exception_approvals
for insert with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_trust_exception_approvals.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
);

create policy "review-capable members can revoke contract trust exception approvals"
on public.contract_trust_exception_approvals
for update using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_trust_exception_approvals.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
) with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = contract_trust_exception_approvals.organization_id
      and memberships.user_id = auth.uid()
      and memberships.role in ('admin', 'operator', 'reviewer')
  )
);
