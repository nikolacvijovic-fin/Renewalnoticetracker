-- Enterprise trust authority hardening.
-- Trust exception approvals are created by trusted server/service-role code only.
-- Browser clients may read scoped approvals but may not insert or mutate approval authority.

drop policy if exists "review-capable members can create contract trust exception approvals"
on public.contract_trust_exception_approvals;

drop policy if exists "review-capable members can revoke contract trust exception approvals"
on public.contract_trust_exception_approvals;

drop index if exists idx_contract_trust_exception_approvals_single_open_null_expiry;

create unique index if not exists idx_contract_trust_exception_approvals_single_non_revoked
  on public.contract_trust_exception_approvals(organization_id, contract_id, approval_type)
  where revoked_at is null;

comment on index public.idx_contract_trust_exception_approvals_single_non_revoked is
  'Enterprise-safe duplicate prevention: only one non-revoked approval of a type may exist per organization and contract. Expired approvals must be explicitly revoked or superseded by trusted server logic before replacement.';

comment on table public.contract_trust_exception_approvals is
  'Durable trust exception approvals are append-only after insert. Creation and revocation are trusted server/service-role operations only; browser clients may not insert or update approval authority.';

create or replace function public.reject_contract_trust_exception_approval_client_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'contract trust exception approvals must be created by trusted server authority';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_contract_trust_exception_approval_client_insert
on public.contract_trust_exception_approvals;
create trigger reject_contract_trust_exception_approval_client_insert
before insert on public.contract_trust_exception_approvals
for each row execute function public.reject_contract_trust_exception_approval_client_insert();

-- Service-role path computes evidence_confidence_at_approval in TypeScript from
-- tenant-scoped contract metadata before insert. Browser/client-supplied
-- evidence confidence is intentionally not accepted by shipped actions.
