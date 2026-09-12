-- Forward-only: align every effective subscription-usage mutation boundary with
-- the shipped intake policy. Existing member read policies remain unchanged.

drop policy if exists "operator roles can manage subscription usage provider connections" on public.subscription_usage_provider_connections;
create policy "admin operator can manage subscription usage provider connections"
on public.subscription_usage_provider_connections
for all using (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_provider_connections.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
)) with check (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_provider_connections.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

drop policy if exists "operator roles can manage subscription usage sync runs" on public.subscription_usage_sync_runs;
create policy "admin operator can manage subscription usage sync runs"
on public.subscription_usage_sync_runs
for all using (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_sync_runs.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
)) with check (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_sync_runs.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

drop policy if exists "review-capable members can create usage import batches" on public.usage_import_batches;
drop policy if exists "creator admin operator can update usage import batches" on public.usage_import_batches;
create policy "admin operator can create usage import batches"
on public.usage_import_batches for insert with check (exists (
  select 1 from public.memberships m
  where m.organization_id = usage_import_batches.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));
create policy "admin operator can update usage import batches"
on public.usage_import_batches for update using (exists (
  select 1 from public.memberships m
  where m.organization_id = usage_import_batches.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
)) with check (exists (
  select 1 from public.memberships m
  where m.organization_id = usage_import_batches.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

drop policy if exists "review roles can create usage import rows" on public.usage_import_rows;
create policy "admin operator can create usage import rows"
on public.usage_import_rows for insert with check (exists (
  select 1 from public.memberships m
  where m.organization_id = usage_import_rows.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

drop policy if exists "review roles can create license waste opportunities" on public.license_waste_opportunities;
drop policy if exists "admin operator can review license waste opportunities" on public.license_waste_opportunities;
create policy "admin operator can create license waste opportunities"
on public.license_waste_opportunities for insert with check (exists (
  select 1 from public.memberships m
  where m.organization_id = license_waste_opportunities.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));
create policy "admin operator can review license waste opportunities"
on public.license_waste_opportunities for update using (exists (
  select 1 from public.memberships m
  where m.organization_id = license_waste_opportunities.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
)) with check (exists (
  select 1 from public.memberships m
  where m.organization_id = license_waste_opportunities.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

drop policy if exists "review roles can create subscription usage analysis scopes" on public.subscription_usage_analysis_scopes;
create policy "admin operator can create subscription usage analysis scopes"
on public.subscription_usage_analysis_scopes for insert with check (exists (
  select 1 from public.memberships m
  where m.organization_id = subscription_usage_analysis_scopes.organization_id
    and m.user_id = auth.uid()
    and m.role in ('admin', 'operator')
));

create or replace function public.assert_subscription_usage_mutation_authority(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_subscription_usage_mutation_authority(uuid) from public, anon, authenticated, service_role;

alter function public.create_subscription_usage_batch_with_rows(uuid, text, text, text, text, text, uuid, uuid, jsonb, jsonb)
  rename to create_subscription_usage_batch_with_rows_core;
revoke all on function public.create_subscription_usage_batch_with_rows_core(uuid, text, text, text, text, text, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;

create function public.create_subscription_usage_batch_with_rows(
  p_organization_id uuid, p_source text, p_status text, p_file_name text,
  p_idempotency_key text, p_provider text, p_provider_connection_id uuid,
  p_sync_run_id uuid, p_metadata jsonb, p_rows jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.create_subscription_usage_batch_with_rows_core(
    p_organization_id, p_source, p_status, p_file_name, p_idempotency_key,
    p_provider, p_provider_connection_id, p_sync_run_id, p_metadata, p_rows
  );
end;
$$;
revoke all on function public.create_subscription_usage_batch_with_rows(uuid, text, text, text, text, text, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_subscription_usage_batch_with_rows(uuid, text, text, text, text, text, uuid, uuid, jsonb, jsonb) to authenticated, service_role;

alter function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean)
  rename to create_subscription_usage_analysis_scope_core;
revoke all on function public.create_subscription_usage_analysis_scope_core(uuid, uuid, boolean)
  from public, anon, authenticated;

create function public.create_subscription_usage_analysis_scope(
  p_organization_id uuid, p_current_batch_id uuid, p_include_manual_imports boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.create_subscription_usage_analysis_scope_core(p_organization_id, p_current_batch_id, p_include_manual_imports);
end;
$$;
revoke all on function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean) to authenticated, service_role;

alter function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  rename to persist_subscription_usage_analysis_findings_core;
revoke all on function public.persist_subscription_usage_analysis_findings_core(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;

create function public.persist_subscription_usage_analysis_findings(
  p_organization_id uuid, p_analysis_scope_id uuid, p_batch_id uuid, p_provider text,
  p_provider_connection_id uuid, p_sync_run_id uuid, p_findings jsonb
) returns integer language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.persist_subscription_usage_analysis_findings_core(
    p_organization_id, p_analysis_scope_id, p_batch_id, p_provider,
    p_provider_connection_id, p_sync_run_id, p_findings
  );
end;
$$;
revoke all on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.persist_subscription_usage_analysis_findings(uuid, uuid, uuid, text, uuid, uuid, jsonb) to authenticated, service_role;

alter function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  rename to begin_manual_subscription_usage_sync_attempt_core;
revoke all on function public.begin_manual_subscription_usage_sync_attempt_core(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;

create function public.begin_manual_subscription_usage_sync_attempt(
  p_organization_id uuid, p_connection_id uuid, p_provider text,
  p_logical_interval_key text, p_retry_failed boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.begin_manual_subscription_usage_sync_attempt_core(
    p_organization_id, p_connection_id, p_provider, p_logical_interval_key, p_retry_failed
  );
end;
$$;
revoke all on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean) to authenticated;

alter function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz)
  rename to transition_manual_subscription_usage_sync_attempt_core;
revoke all on function public.transition_manual_subscription_usage_sync_attempt_core(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz)
  from public, anon, authenticated;

create function public.transition_manual_subscription_usage_sync_attempt(
  p_organization_id uuid, p_sync_run_id uuid, p_next_stage text,
  p_usage_import_batch_id uuid default null, p_row_count integer default null,
  p_finding_count integer default null, p_final_status text default null,
  p_failure_code text default null, p_retry_after timestamptz default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.transition_manual_subscription_usage_sync_attempt_core(
    p_organization_id, p_sync_run_id, p_next_stage, p_usage_import_batch_id,
    p_row_count, p_finding_count, p_final_status, p_failure_code, p_retry_after
  );
end;
$$;
revoke all on function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz) from public, anon;
grant execute on function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz) to authenticated, service_role;

alter function public.disconnect_subscription_usage_provider(uuid, uuid)
  rename to disconnect_subscription_usage_provider_core;
revoke all on function public.disconnect_subscription_usage_provider_core(uuid, uuid)
  from public, anon, authenticated;

create function public.disconnect_subscription_usage_provider(p_organization_id uuid, p_connection_id uuid)
returns integer language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.disconnect_subscription_usage_provider_core(p_organization_id, p_connection_id);
end;
$$;
revoke all on function public.disconnect_subscription_usage_provider(uuid, uuid) from public, anon;
grant execute on function public.disconnect_subscription_usage_provider(uuid, uuid) to authenticated;

alter function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid)
  rename to disconnect_google_workspace_subscription_usage_connection_core;
revoke all on function public.disconnect_google_workspace_subscription_usage_connection_core(uuid, uuid)
  from public, anon, authenticated;

create function public.disconnect_google_workspace_subscription_usage_connection(p_organization_id uuid, p_connection_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.disconnect_google_workspace_subscription_usage_connection_core(p_organization_id, p_connection_id);
end;
$$;
revoke all on function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid) from public, anon;
grant execute on function public.disconnect_google_workspace_subscription_usage_connection(uuid, uuid) to authenticated;

alter function public.create_subscription_usage_consent_attempt(uuid, text, text, text[], timestamptz)
  rename to create_subscription_usage_consent_attempt_core;
revoke all on function public.create_subscription_usage_consent_attempt_core(uuid, text, text, text[], timestamptz)
  from public, anon, authenticated;

create function public.create_subscription_usage_consent_attempt(
  p_organization_id uuid, p_provider text, p_nonce_hash text,
  p_requested_permissions text[], p_expires_at timestamptz
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_subscription_usage_mutation_authority(p_organization_id);
  return public.create_subscription_usage_consent_attempt_core(
    p_organization_id, p_provider, p_nonce_hash, p_requested_permissions, p_expires_at
  );
end;
$$;
revoke all on function public.create_subscription_usage_consent_attempt(uuid, text, text, text[], timestamptz) from public, anon;
grant execute on function public.create_subscription_usage_consent_attempt(uuid, text, text, text[], timestamptz) to authenticated;

comment on function public.assert_subscription_usage_mutation_authority(uuid) is
  'Internal guard for admin/operator subscription-usage mutations. Service-role runtime calls remain allowed.';
