-- Cleanup remains exclusive after a storage timeout or a database failure.
-- A short, fenced lease permits replay without reopening customer upload claims.
alter table public.contracts
  add column if not exists pdf_upload_cleanup_token uuid,
  add column if not exists pdf_upload_cleanup_lease_expires_at timestamptz;

create or replace function public.claim_saas_pdf_upload_cleanup(
  p_organization_id uuid,
  p_contract_id uuid,
  p_contract_file_id uuid,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_contract public.contracts%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select c.* into v_contract from public.contracts c
  where c.id = p_contract_id and c.organization_id = p_organization_id;
  if v_contract.id is null or v_contract.pdf_upload_attempt_id is null then
    return jsonb_build_object('claimed', false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saas-pdf-upload:' || v_contract.pdf_upload_attempt_id::text, 0));
  select c.* into v_contract from public.contracts c
  where c.id = p_contract_id and c.organization_id = p_organization_id for update;

  if exists (select 1 from public.contract_metadata m where m.contract_id = v_contract.id and m.reviewed_at is not null)
     or exists (select 1 from public.saas_contract_terms t where t.contract_id = v_contract.id)
     or (v_contract.latest_file_id is not null and v_contract.latest_file_id is distinct from p_contract_file_id)
     or (p_contract_file_id is not null and not exists (
       select 1 from public.contract_files f where f.id = p_contract_file_id and f.contract_id = v_contract.id
     ))
     or (v_contract.latest_file_id is null and exists (
       select 1 from public.contract_files f where f.contract_id = v_contract.id
         and f.storage_deleted_at is null and f.id is distinct from p_contract_file_id
     )) then
    return jsonb_build_object('claimed', false);
  end if;

  if v_contract.pdf_upload_attempt_status = 'cleanup_processing' then
    -- NULL includes interrupted cleanup created before this migration.
    if v_contract.pdf_upload_cleanup_lease_expires_at > now() then
      return jsonb_build_object('claimed', false);
    end if;
  elsif v_contract.pdf_upload_attempt_status = 'failed' then
    if v_contract.pdf_upload_claimed_at is null or v_contract.pdf_upload_claimed_at >= p_stale_before then
      return jsonb_build_object('claimed', false);
    end if;
  elsif v_contract.pdf_upload_attempt_status = 'abandoned' then
    if v_contract.pdf_upload_abandoned_at is null or v_contract.pdf_upload_abandoned_at >= p_stale_before then
      return jsonb_build_object('claimed', false);
    end if;
  else
    return jsonb_build_object('claimed', false);
  end if;

  update public.contracts
  set pdf_upload_attempt_status = 'cleanup_processing',
      latest_file_id = coalesce(latest_file_id, p_contract_file_id),
      pdf_upload_cleanup_token = v_token,
      pdf_upload_cleanup_lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  where id = v_contract.id;
  return jsonb_build_object('claimed', true, 'contractId', v_contract.id,
    'contractFileId', coalesce(v_contract.latest_file_id, p_contract_file_id), 'cleanupToken', v_token);
end;
$$;

create function public.finish_saas_pdf_upload_cleanup(
  p_organization_id uuid,
  p_contract_id uuid,
  p_cleanup_token uuid,
  p_storage_removed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_contract public.contracts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select c.* into v_contract from public.contracts c
  where c.id = p_contract_id and c.organization_id = p_organization_id for update;
  if v_contract.id is null or v_contract.pdf_upload_attempt_status <> 'cleanup_processing'
     or v_contract.pdf_upload_cleanup_token is distinct from p_cleanup_token or p_cleanup_token is null then
    return jsonb_build_object('finished', false);
  end if;
  if p_storage_removed is not true then
    -- Never return to failed/abandoned: storage may already have been removed.
    update public.contracts set pdf_upload_cleanup_lease_expires_at = now(), updated_at = now()
    where id = v_contract.id;
    return jsonb_build_object('finished', false, 'retryable', true);
  end if;
  if exists (select 1 from public.contract_metadata m where m.contract_id = v_contract.id and m.reviewed_at is not null)
     or exists (select 1 from public.saas_contract_terms t where t.contract_id = v_contract.id) then
    raise exception 'Reviewed or activated PDF uploads cannot be cleaned.' using errcode = '42501';
  end if;
  if v_contract.latest_file_id is not null then
    update public.contract_files
    set storage_deleted_at = coalesce(storage_deleted_at, now()), extracted_text = null,
        extraction_error = 'Upload attempt was cleaned after its retention window.'
    where id = v_contract.latest_file_id and contract_id = v_contract.id;
    if not found then
      raise exception 'Scoped cleanup file is unavailable.';
    end if;
  end if;
  -- Metadata and terminal state commit together; failures leave a replayable claim.
  update public.contracts
  set status = 'archived', status_tag = 'terminated', pdf_upload_attempt_status = 'cleaned',
      pdf_upload_cleaned_at = now(), pdf_upload_failure_code = 'upload_attempt_cleaned',
      pdf_upload_cleanup_token = null, pdf_upload_cleanup_lease_expires_at = null, updated_at = now()
  where id = v_contract.id;
  return jsonb_build_object('finished', true, 'contractId', v_contract.id);
end;
$$;

revoke all on function public.claim_saas_pdf_upload_cleanup(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_saas_pdf_upload_cleanup(uuid, uuid, uuid, timestamptz) to service_role;
revoke all on function public.finish_saas_pdf_upload_cleanup(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_saas_pdf_upload_cleanup(uuid, uuid, uuid, boolean) to service_role;
