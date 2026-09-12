-- Forward-only: enforce beta write state at the public activation boundary.

create or replace function public.activate_reviewed_contract_for_saas_clock_v2(
  p_organization_id uuid,
  p_contract_id uuid,
  p_software_id uuid default null,
  p_create_new boolean default false
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
  v_contract_found boolean := false;
  v_title_key text;
  v_vendor_key text;
begin
  select m.role into v_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
  limit 1;

  if v_actor is null or v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'Only admins or operators can activate the Opt-Out Clock.' using errcode = '42501';
  end if;

  -- Match the upload boundary: hold the beta control stable through all graph writes.
  select c.* into v_control
  from public.design_partner_beta_controls c
  where c.organization_id = p_organization_id
  for share;
  if v_control.organization_id is not null and (
    v_control.status <> 'active'
    or v_control.founder_approved_at is null
    or (v_control.expires_at is not null and v_control.expires_at <= now())
    or (v_control.grace_ends_at is not null and v_control.grace_ends_at <= now())
  ) then
    raise exception 'Design Partner Beta is read-only' using errcode = '42501';
  end if;

  select
    true,
    regexp_replace(lower(btrim(coalesce(cm.contract_title, ''))), '[^a-z0-9]+', '', 'g'),
    regexp_replace(lower(btrim(coalesce(cm.counterparty_name, ''))), '[^a-z0-9]+', '', 'g')
  into v_contract_found, v_title_key, v_vendor_key
  from public.contracts c
  left join public.contract_metadata cm on cm.contract_id = c.id
  where c.id = p_contract_id
    and c.organization_id = p_organization_id;

  if v_contract_found is distinct from true then
    raise exception 'Contract is not available in the active organization.' using errcode = '42501';
  end if;

  if v_title_key <> '' and v_vendor_key <> '' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'saas-clock-product:' || p_organization_id::text || ':' || v_title_key || ':' || v_vendor_key,
        0
      )
    );
  else
    -- The core function will reject incomplete metadata; this fallback keeps
    -- malformed requests serialized without treating an empty key as shared.
    perform pg_advisory_xact_lock(
      hashtextextended('saas-clock-contract:' || p_organization_id::text || ':' || p_contract_id::text, 0)
    );
  end if;

  return public.activate_reviewed_contract_for_saas_clock_v2_core(
    p_organization_id,
    p_contract_id,
    p_software_id,
    p_create_new
  );
end;
$$;

revoke all on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean)
  to authenticated;

comment on function public.activate_reviewed_contract_for_saas_clock_v2(uuid, uuid, uuid, boolean) is
  'Activates one reviewed contract while serializing by organization-scoped normalized SaaS product identity.';
