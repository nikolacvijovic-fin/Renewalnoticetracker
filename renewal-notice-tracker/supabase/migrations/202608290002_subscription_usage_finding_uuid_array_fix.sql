-- Preserve UUID typing when normalized finding row identifiers are rebuilt
-- from JSON. Without the explicit cast PostgreSQL produces text[] and the
-- first persisted subscription-usage finding fails at runtime.

create or replace function public.persist_subscription_usage_analysis_findings(
  p_organization_id uuid,
  p_analysis_scope_id uuid,
  p_batch_id uuid,
  p_provider text,
  p_provider_connection_id uuid,
  p_sync_run_id uuid,
  p_findings jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope public.subscription_usage_analysis_scopes%rowtype;
  v_f jsonb;
  v_previous public.license_waste_opportunities%rowtype;
  v_finding_id uuid;
  v_seen_keys text[] := '{}';
  v_material_hash text;
  v_provenance_hash text;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator', 'reviewer')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  select * into v_scope
  from public.subscription_usage_analysis_scopes s
  where s.id = p_analysis_scope_id and s.organization_id = p_organization_id
  for update;
  if v_scope.id is null or not (p_batch_id = any(v_scope.snapshot_batch_ids)) then
    raise exception 'Analysis scope mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.usage_import_batches b
    where b.id = p_batch_id
      and b.organization_id = p_organization_id
      and coalesce(b.provider, 'manual_csv') = p_provider
  ) then
    raise exception 'Provider batch mismatch' using errcode = '42501';
  end if;
  if p_provider_connection_id is not null and not exists (
    select 1 from public.subscription_usage_provider_connections c
    where c.id = p_provider_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
  ) then
    raise exception 'Provider connection mismatch' using errcode = '42501';
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
  loop
    v_material_hash := coalesce(nullif(v_f->>'material_evidence_hash', ''), nullif(v_f->>'evidence_hash', ''));
    v_provenance_hash := coalesce(nullif(v_f->>'provenance_hash', ''), v_material_hash);
    if coalesce(v_f->>'logical_opportunity_key', '') = '' or v_material_hash is null then
      raise exception 'Finding identity is required' using errcode = '22023';
    end if;
    v_seen_keys := array_append(v_seen_keys, v_f->>'logical_opportunity_key');

    perform pg_advisory_xact_lock(hashtextextended(
      p_organization_id::text || ':' || v_scope.scope_family_key || ':' || (v_f->>'logical_opportunity_key'),
      0
    ));

    v_previous := null;
    select * into v_previous
    from public.license_waste_opportunities o
    where o.organization_id = p_organization_id
      and o.scope_family_key = v_scope.scope_family_key
      and o.logical_opportunity_key = v_f->>'logical_opportunity_key'
      and o.superseded_at is null
      and o.resolved_at is null
    order by o.revision_number desc, o.created_at desc
    limit 1
    for update;

    if v_previous.id is not null and v_previous.material_evidence_hash = v_material_hash then
      v_finding_id := v_previous.id;
    else
      if v_previous.id is not null then
        update public.license_waste_opportunities
        set superseded_at = timezone('utc', now()),
            superseded_by_sync_run_id = p_sync_run_id
        where id = v_previous.id and organization_id = p_organization_id;
      end if;

      insert into public.license_waste_opportunities (
        organization_id, contract_id, usage_batch_id, provider, provider_connection_id,
        sync_run_id, finding_fingerprint, finding_type, reason_code, calculation_version,
        usage_row_ids, matched_contract_ids, utilization, unused_seats, confidence,
        warnings, estimated_savings, currency, recommended_action, capability_category,
        taxonomy_version, involved_providers, involved_products, estimated_savings_min,
        estimated_savings_max, evidence, review_status, analysis_scope_id,
        scope_family_key, logical_opportunity_key, evidence_hash, material_evidence_hash,
        provenance_hash, revision_of_id, revision_number, revision_reason,
        requires_new_review, previous_review_status
      ) values (
        p_organization_id,
        nullif(v_f->>'contract_id', '')::uuid,
        p_batch_id,
        p_provider,
        p_provider_connection_id,
        p_sync_run_id,
        v_f->>'finding_fingerprint',
        v_f->>'finding_type',
        v_f->>'reason_code',
        v_f->>'calculation_version',
        coalesce(array(select jsonb_array_elements_text(v_f->'usage_row_ids'))::uuid[], '{}'),
        coalesce(array(select jsonb_array_elements_text(v_f->'matched_contract_ids'))::uuid[], '{}'),
        nullif(v_f->>'utilization', '')::numeric,
        nullif(v_f->>'unused_seats', '')::numeric,
        (v_f->>'confidence')::numeric,
        coalesce(array(select jsonb_array_elements_text(v_f->'warnings')), '{}'),
        nullif(v_f->>'estimated_savings', '')::numeric,
        nullif(v_f->>'currency', ''),
        v_f->>'recommended_action',
        nullif(v_f->>'capability_category', ''),
        nullif(v_f->>'taxonomy_version', ''),
        coalesce(array(select jsonb_array_elements_text(v_f->'involved_providers')), '{}'),
        coalesce(array(select jsonb_array_elements_text(v_f->'involved_products')), '{}'),
        nullif(v_f->>'estimated_savings_min', '')::numeric,
        nullif(v_f->>'estimated_savings_max', '')::numeric,
        coalesce(v_f->'evidence', '{}'::jsonb),
        'open',
        p_analysis_scope_id,
        v_scope.scope_family_key,
        v_f->>'logical_opportunity_key',
        v_material_hash,
        v_material_hash,
        v_provenance_hash,
        v_previous.id,
        coalesce(v_previous.revision_number, 0) + 1,
        case when v_previous.id is null then 'initial_detection' else 'material_evidence_changed' end,
        v_previous.id is not null,
        v_previous.review_status
      ) returning id into v_finding_id;
    end if;

    insert into public.subscription_usage_analysis_findings (
      organization_id, analysis_scope_id, finding_id
    ) values (p_organization_id, p_analysis_scope_id, v_finding_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  update public.license_waste_opportunities o
  set superseded_at = timezone('utc', now()),
      superseded_by_sync_run_id = p_sync_run_id,
      resolved_at = timezone('utc', now()),
      resolution_reason = 'absent_from_current_scope'
  where o.organization_id = p_organization_id
    and o.scope_family_key = v_scope.scope_family_key
    and o.superseded_at is null
    and o.resolved_at is null
    and not (o.logical_opportunity_key = any(v_seen_keys));

  return v_count;
end;
$$;

revoke all on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) is
  'Reuses findings for provenance-only changes and creates review-required revisions only when material decision evidence changes; JSON row identifiers are persisted as UUID arrays.';
