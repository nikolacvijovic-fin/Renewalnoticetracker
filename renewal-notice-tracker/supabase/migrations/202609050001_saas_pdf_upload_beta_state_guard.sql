-- Fail closed when an authenticated caller invokes the PDF upload claim RPC
-- for a Design Partner Beta organization that is not currently writable.

alter function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  rename to claim_saas_pdf_contract_upload_core;

revoke all on function public.claim_saas_pdf_contract_upload_core(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

comment on function public.claim_saas_pdf_contract_upload_core(uuid, uuid, text, uuid) is
  'Internal implementation for the guarded SaaS PDF upload claim. Direct execution is revoked from API roles.';

create function public.claim_saas_pdf_contract_upload(
  p_organization_id uuid,
  p_upload_attempt_id uuid,
  p_contract_title text,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_control public.design_partner_beta_controls%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
  limit 1;

  if v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can upload contract PDFs.' using errcode = '42501';
  end if;

  -- Serialize this check with the core capacity/claim transaction and hold any
  -- beta control row stable until the upload claim finishes.
  perform pg_advisory_xact_lock(
    hashtextextended('contract-capacity:' || p_organization_id::text, 0)
  );

  select c.* into v_control
  from public.design_partner_beta_controls c
  where c.organization_id = p_organization_id
  for share;

  if v_control.organization_id is not null and (
    v_control.status <> 'active'
    or v_control.founder_approved_at is null
    or (v_control.expires_at is not null and v_control.expires_at <= v_now)
    or (v_control.grace_ends_at is not null and v_control.grace_ends_at <= v_now)
  ) then
    raise exception 'Design Partner Beta is read-only' using errcode = '42501';
  end if;

  return public.claim_saas_pdf_contract_upload_core(
    p_organization_id,
    p_upload_attempt_id,
    p_contract_title,
    p_owner_user_id
  );
end;
$$;

revoke all on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid)
  to authenticated;

comment on function public.claim_saas_pdf_contract_upload(uuid, uuid, text, uuid) is
  'Claims an organization-scoped SaaS PDF upload only when role, beta write state, and capacity checks pass.';
