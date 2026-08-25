-- Paid design-partner beta: resumable usage synchronization and recommendation lineage.

alter table public.subscription_usage_sync_runs
  add column if not exists current_stage text not null default 'created',
  add column if not exists failure_stage text,
  add column if not exists maximum_attempts integer not null default 3,
  add column if not exists stage_updated_at timestamptz not null default timezone('utc', now());

alter table public.subscription_usage_sync_runs
  drop constraint if exists subscription_usage_sync_runs_current_stage_check,
  add constraint subscription_usage_sync_runs_current_stage_check check (
    current_stage in ('created', 'authenticating', 'fetching_snapshot', 'snapshot_persisted', 'reconciling', 'findings_persisted', 'completed', 'failed')
  ),
  drop constraint if exists subscription_usage_sync_runs_failure_stage_check,
  add constraint subscription_usage_sync_runs_failure_stage_check check (
    failure_stage is null or failure_stage in ('created', 'authenticating', 'fetching_snapshot', 'snapshot_persisted', 'reconciling', 'findings_persisted')
  ),
  drop constraint if exists subscription_usage_sync_runs_maximum_attempts_check,
  add constraint subscription_usage_sync_runs_maximum_attempts_check check (maximum_attempts = 3);

update public.subscription_usage_sync_runs
set current_stage = case
  when status in ('completed', 'partial') then 'completed'
  when status = 'failed' then 'failed'
  else 'created'
end,
failure_stage = case when status = 'failed' then 'created' else null end
where current_stage = 'created';

alter table public.license_waste_opportunities
  add column if not exists calculation_family text,
  add column if not exists taxonomy_family text,
  add column if not exists reactivated_from_finding_id uuid references public.license_waste_opportunities(id) on delete set null;

create index if not exists license_waste_opportunities_reactivated_from_idx
  on public.license_waste_opportunities (organization_id, reactivated_from_finding_id)
  where reactivated_from_finding_id is not null;

create table if not exists public.design_partner_beta_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'grace', 'read_only', 'ended')),
  maximum_contracts integer not null default 50 check (maximum_contracts between 1 and 500),
  maximum_provider_connections integer not null default 2 check (maximum_provider_connections between 1 and 2),
  maximum_user_seats integer not null default 10 check (maximum_user_seats between 1 and 100),
  allowed_providers text[] not null default array['microsoft_365', 'google_workspace']::text[],
  starts_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  founder_approved_at timestamptz,
  founder_approved_by_user_id uuid references public.users(id) on delete set null,
  onboarding_call_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check (grace_ends_at is null or expires_at is null or grace_ends_at >= expires_at),
  check (allowed_providers <@ array['microsoft_365', 'google_workspace']::text[])
);

alter table public.design_partner_beta_controls enable row level security;
revoke all on table public.design_partner_beta_controls from public, anon, authenticated;
grant select on table public.design_partner_beta_controls to authenticated;
grant select, insert, update, delete on table public.design_partner_beta_controls to service_role;

drop policy if exists "members can read their design partner beta control" on public.design_partner_beta_controls;
create policy "members can read their design partner beta control"
on public.design_partner_beta_controls for select
using (exists (
  select 1 from public.memberships m
  where m.organization_id = design_partner_beta_controls.organization_id
    and m.user_id = auth.uid()
));

comment on table public.design_partner_beta_controls is
  'Founder-approved paid beta limits. Customer members may read their own control; mutations require service authority.';

create or replace function public.apply_subscription_usage_finding_lineage()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_resolved public.license_waste_opportunities%rowtype;
begin
  new.calculation_family := coalesce(
    nullif(new.calculation_family, ''),
    nullif(regexp_replace(coalesce(new.calculation_version, ''), '([_-]v|@)[0-9]+([.][0-9]+)*([_-][a-zA-Z0-9.]+)?$', '', 'i'), '')
  );
  new.taxonomy_family := coalesce(
    nullif(new.taxonomy_family, ''),
    nullif(regexp_replace(coalesce(new.taxonomy_version, ''), '([_-]v|@)[0-9]+([.][0-9]+)*([_-][a-zA-Z0-9.]+)?$', '', 'i'), '')
  );

  if new.revision_of_id is not null or new.logical_opportunity_key is null then
    return new;
  end if;

  select * into v_resolved
  from public.license_waste_opportunities o
  where o.organization_id = new.organization_id
    and o.logical_opportunity_key = new.logical_opportunity_key
    and o.resolved_at is not null
    and o.resolution_reason = 'provider_disconnected'
  order by o.resolved_at desc, o.revision_number desc
  limit 1;

  if v_resolved.id is null then
    return new;
  end if;

  new.reactivated_from_finding_id := v_resolved.id;
  new.revision_of_id := v_resolved.id;
  new.revision_number := v_resolved.revision_number + 1;
  new.revision_reason := 'provider_reconnected';
  new.previous_review_status := v_resolved.review_status;
  new.requires_new_review := v_resolved.material_evidence_hash is distinct from new.material_evidence_hash;
  new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
    'reconnectionProvenance', jsonb_build_object(
      'previousProviderConnectionId', v_resolved.provider_connection_id,
      'currentProviderConnectionId', new.provider_connection_id,
      'reactivatedFromFindingId', v_resolved.id
    )
  );

  if not new.requires_new_review then
    new.review_status := v_resolved.review_status;
    new.reviewed_by_user_id := v_resolved.reviewed_by_user_id;
    new.reviewed_at := v_resolved.reviewed_at;
    new.accepted_action := v_resolved.accepted_action;
    new.feedback_classification := v_resolved.feedback_classification;
    new.feedback_reason := v_resolved.feedback_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_usage_finding_lineage on public.license_waste_opportunities;
create trigger subscription_usage_finding_lineage
before insert on public.license_waste_opportunities
for each row execute function public.apply_subscription_usage_finding_lineage();

create or replace function public.begin_manual_subscription_usage_sync_attempt(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_logical_interval_key text,
  p_retry_failed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.subscription_usage_sync_runs%rowtype;
  v_attempt integer := 1;
  v_run public.subscription_usage_sync_runs%rowtype;
  v_attempt_key text;
  v_resume_stage text := 'created';
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operator')
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;
  if coalesce(p_logical_interval_key, '') = '' then
    raise exception 'Logical synchronization interval is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.subscription_usage_provider_connections c
    where c.id = p_connection_id
      and c.organization_id = p_organization_id
      and c.provider = p_provider
      and c.status = 'connected'
  ) then
    raise exception 'Connected provider was not found' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_connection_id::text || ':' || p_logical_interval_key,
    0
  ));

  select * into v_existing
  from public.subscription_usage_sync_runs r
  where r.organization_id = p_organization_id
    and r.provider_connection_id = p_connection_id
    and r.logical_interval_key = p_logical_interval_key
  order by r.attempt_number desc
  limit 1
  for update;

  if v_existing.id is not null
     and v_existing.status = 'processing'
     and v_existing.stage_updated_at <= timezone('utc', now()) - interval '15 minutes' then
    update public.subscription_usage_sync_runs
    set status = 'failed', failure_stage = current_stage, current_stage = 'failed',
        last_error_code = 'stale_manual_sync_recovered', retry_after = timezone('utc', now()),
        failed_at = timezone('utc', now()), stage_updated_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = v_existing.id and organization_id = p_organization_id;
    select * into v_existing from public.subscription_usage_sync_runs where id = v_existing.id;
  end if;

  if v_existing.id is not null and v_existing.status in ('processing', 'completed', 'partial') then
    return jsonb_build_object(
      'id', v_existing.id, 'status', v_existing.status,
      'attemptNumber', v_existing.attempt_number, 'maximumAttempts', v_existing.maximum_attempts,
      'idempotencyKey', v_existing.idempotency_key, 'logicalIntervalKey', p_logical_interval_key,
      'isNew', false, 'usageImportBatchId', v_existing.usage_import_batch_id,
      'lastErrorCode', v_existing.last_error_code, 'currentStage', v_existing.current_stage,
      'failureStage', v_existing.failure_stage, 'retryAfter', v_existing.retry_after
    );
  end if;

  if v_existing.id is not null then
    if not p_retry_failed then
      return jsonb_build_object(
        'id', v_existing.id, 'status', v_existing.status,
        'attemptNumber', v_existing.attempt_number, 'maximumAttempts', v_existing.maximum_attempts,
        'idempotencyKey', v_existing.idempotency_key, 'logicalIntervalKey', p_logical_interval_key,
        'isNew', false, 'usageImportBatchId', v_existing.usage_import_batch_id,
        'lastErrorCode', v_existing.last_error_code, 'currentStage', v_existing.current_stage,
        'failureStage', v_existing.failure_stage, 'retryAfter', v_existing.retry_after
      );
    end if;
    if v_existing.attempt_number >= v_existing.maximum_attempts then
      raise exception 'Manual synchronization retry limit reached' using errcode = '22023';
    end if;
    if v_existing.retry_after is not null and v_existing.retry_after > timezone('utc', now()) then
      raise exception 'Manual synchronization retry is not ready' using errcode = '55000';
    end if;
    v_attempt := v_existing.attempt_number + 1;
    if v_existing.usage_import_batch_id is not null then
      v_resume_stage := case
        when v_existing.failure_stage = 'findings_persisted' then 'findings_persisted'
        else 'snapshot_persisted'
      end;
    end if;
  end if;

  v_attempt_key := encode(digest(p_logical_interval_key || ':attempt:' || v_attempt::text, 'sha256'), 'hex');
  insert into public.subscription_usage_sync_runs (
    organization_id, provider_connection_id, provider, status, idempotency_key,
    logical_interval_key, attempt_number, maximum_attempts, previous_attempt_id,
    usage_import_batch_id, row_count, finding_count, current_stage, stage_updated_at,
    started_at, metadata
  ) values (
    p_organization_id, p_connection_id, p_provider, 'processing', v_attempt_key,
    p_logical_interval_key, v_attempt, 3, v_existing.id,
    v_existing.usage_import_batch_id, coalesce(v_existing.row_count, 0), coalesce(v_existing.finding_count, 0),
    v_resume_stage, timezone('utc', now()), timezone('utc', now()),
    jsonb_build_object('source', 'manual_sync_now', 'resumedFromAttemptId', v_existing.id)
  ) returning * into v_run;

  return jsonb_build_object(
    'id', v_run.id, 'status', v_run.status, 'attemptNumber', v_run.attempt_number,
    'maximumAttempts', v_run.maximum_attempts, 'idempotencyKey', v_run.idempotency_key,
    'logicalIntervalKey', p_logical_interval_key, 'isNew', true,
    'usageImportBatchId', v_run.usage_import_batch_id, 'lastErrorCode', null,
    'currentStage', v_run.current_stage, 'failureStage', null, 'retryAfter', null
  );
end;
$$;

revoke all on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  to authenticated;

create or replace function public.transition_manual_subscription_usage_sync_attempt(
  p_organization_id uuid,
  p_sync_run_id uuid,
  p_next_stage text,
  p_usage_import_batch_id uuid default null,
  p_row_count integer default null,
  p_finding_count integer default null,
  p_final_status text default null,
  p_failure_code text default null,
  p_retry_after timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.subscription_usage_sync_runs%rowtype;
  v_allowed boolean := false;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.role() <> 'service_role' and (
    auth.uid() is null or not exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'operator')
    )
  ) then
    raise exception 'Insufficient organization role' using errcode = '42501';
  end if;

  select * into v_run
  from public.subscription_usage_sync_runs r
  where r.id = p_sync_run_id and r.organization_id = p_organization_id
  for update;
  if v_run.id is null then
    raise exception 'Synchronization attempt not found' using errcode = '42501';
  end if;

  v_allowed := p_next_stage = v_run.current_stage
    or p_next_stage = 'failed'
    or (v_run.current_stage = 'created' and p_next_stage = 'authenticating')
    or (v_run.current_stage = 'authenticating' and p_next_stage = 'fetching_snapshot')
    or (v_run.current_stage = 'fetching_snapshot' and p_next_stage = 'snapshot_persisted')
    or (v_run.current_stage = 'snapshot_persisted' and p_next_stage = 'reconciling')
    or (v_run.current_stage = 'reconciling' and p_next_stage = 'findings_persisted')
    or (v_run.current_stage = 'findings_persisted' and p_next_stage = 'completed');
  if not v_allowed or v_run.current_stage in ('completed', 'failed') then
    raise exception 'Invalid synchronization stage transition: % -> %', v_run.current_stage, p_next_stage using errcode = '22023';
  end if;
  if p_usage_import_batch_id is not null and not exists (
    select 1 from public.usage_import_batches b
    where b.id = p_usage_import_batch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'Synchronization batch scope mismatch' using errcode = '42501';
  end if;

  if p_next_stage = 'failed' then
    update public.subscription_usage_sync_runs
    set failure_stage = current_stage, current_stage = 'failed', status = 'failed',
        last_error_code = left(coalesce(p_failure_code, 'subscription_usage_sync_failed'), 120),
        provider_error_category = left(coalesce(p_failure_code, 'subscription_usage_sync_failed'), 120),
        retry_after = p_retry_after, failed_at = v_now, stage_updated_at = v_now, updated_at = v_now
    where id = p_sync_run_id and organization_id = p_organization_id
    returning * into v_run;
  else
    update public.subscription_usage_sync_runs
    set current_stage = p_next_stage,
        usage_import_batch_id = coalesce(p_usage_import_batch_id, usage_import_batch_id),
        row_count = coalesce(p_row_count, row_count),
        finding_count = coalesce(p_finding_count, finding_count),
        status = case when p_next_stage = 'completed' then coalesce(p_final_status, 'completed') else status end,
        completed_at = case when p_next_stage = 'completed' then v_now else completed_at end,
        failure_stage = null, last_error_code = null, retry_after = null,
        stage_updated_at = v_now, updated_at = v_now
    where id = p_sync_run_id and organization_id = p_organization_id
    returning * into v_run;
  end if;

  return jsonb_build_object(
    'id', v_run.id, 'status', v_run.status, 'currentStage', v_run.current_stage,
    'failureStage', v_run.failure_stage, 'usageImportBatchId', v_run.usage_import_batch_id,
    'attemptNumber', v_run.attempt_number, 'maximumAttempts', v_run.maximum_attempts,
    'retryAfter', v_run.retry_after, 'lastErrorCode', v_run.last_error_code
  );
end;
$$;

revoke all on function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz)
  from public, anon;
grant execute on function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz)
  to authenticated, service_role;

comment on function public.transition_manual_subscription_usage_sync_attempt(uuid, uuid, text, uuid, integer, integer, text, text, timestamptz) is
  'Atomically advances one tenant-scoped manual synchronization attempt and rejects backward or skipped transitions.';
comment on column public.license_waste_opportunities.calculation_family is
  'Stable algorithm family used for logical opportunity identity; exact calculation_version remains material evidence.';
comment on column public.license_waste_opportunities.taxonomy_family is
  'Stable taxonomy family used for logical opportunity identity; exact taxonomy_version remains material evidence.';
