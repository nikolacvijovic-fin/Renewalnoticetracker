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

comment on table public.contract_trust_exception_approvals is
  'Durable trust exception approvals are append-only after insert. Only formal revocation fields may change.';

alter table public.contract_trust_exception_approvals enable row level security;

create or replace function public.prevent_contract_trust_exception_approval_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'contract_trust_exception_approvals are immutable and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.revoked_at is not null then
      raise exception 'revoked contract trust exception approvals cannot be changed';
    end if;

    if old.organization_id is distinct from new.organization_id
      or old.contract_id is distinct from new.contract_id
      or old.approved_by_user_id is distinct from new.approved_by_user_id
      or old.approval_type is distinct from new.approval_type
      or old.approval_reason is distinct from new.approval_reason
      or old.source_field_keys is distinct from new.source_field_keys
      or old.evidence_confidence_at_approval is distinct from new.evidence_confidence_at_approval
      or old.expires_at is distinct from new.expires_at
      or old.created_at is distinct from new.created_at then
      raise exception 'contract trust exception approval fields are immutable after insert';
    end if;

    if new.revoked_at is null
      or new.revoked_by_user_id is null
      or char_length(trim(coalesce(new.revocation_reason, ''))) = 0 then
      raise exception 'revocation requires revoked_at, revoked_by_user_id, and revocation_reason';
    end if;

    if old.revoked_by_user_id is distinct from new.revoked_by_user_id
      or old.revocation_reason is distinct from new.revocation_reason
      or old.revoked_at is distinct from new.revoked_at then
      return new;
    end if;

    raise exception 'contract trust exception approvals may only be updated for revocation';
  end if;

  return new;
end;
$$;

drop trigger if exists contract_trust_exception_approvals_touch_updated_at
on public.contract_trust_exception_approvals;
create trigger contract_trust_exception_approvals_touch_updated_at
before update on public.contract_trust_exception_approvals
for each row execute function public.touch_updated_at();

drop trigger if exists prevent_contract_trust_exception_approval_mutation
on public.contract_trust_exception_approvals;
create trigger prevent_contract_trust_exception_approval_mutation
before update or delete on public.contract_trust_exception_approvals
for each row execute function public.prevent_contract_trust_exception_approval_mutation();

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
