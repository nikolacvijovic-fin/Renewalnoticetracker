import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  ContractDocumentRelationship,
  ContractExtractedField,
  ContractExtractionMode,
  ContractExtractionRun
} from "@/lib/contract-intelligence/extraction-types";
import type { ContractMetadataPatch } from "@/lib/contract-intelligence/extraction-evidence";
import { getAppConfig } from "@/lib/config";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function insertAdminContractExtractionRun(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  requestedByUserId?: string | null;
  provider?: string;
  extractionMode: ContractExtractionMode;
  idempotencyKey?: string | null;
  schemaVersion?: string;
  promptVersion?: string | null;
}) {
  return admin()
    .from("contract_extraction_runs")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      contract_file_id: input.contractFileId ?? null,
      requested_by_user_id: input.requestedByUserId ?? null,
      provider: input.provider ?? "python_intelligence",
      extraction_mode: input.extractionMode,
      idempotency_key: input.idempotencyKey ?? null,
      schema_version: input.schemaVersion ?? "commercial_contract_v2",
      prompt_version: input.promptVersion ?? null,
      status: "queued"
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: ContractExtractionRun | null; error: Error | null }>;
}

export async function getAdminContractExtractionRunByIdempotency(input: {
  organizationId: string;
  idempotencyKey: string;
}) {
  return admin()
    .from("contract_extraction_runs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .in("status", ["queued", "processing", "completed", "partial"])
    .maybeSingle() as unknown as Promise<{ data: ContractExtractionRun | null; error: Error | null }>;
}

export async function getAdminScopedContractFile(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
}) {
  const result = await admin()
    .from("contracts")
    .select("id, latest_file_id, contract_files(id, file_name, mime_type, size_bytes, storage_path)")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error as Error };

  const row = result.data as unknown as {
    latest_file_id: string | null;
    contract_files: Array<{
      id: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
    }> | null;
  } | null;
  const fileId = input.contractFileId ?? row?.latest_file_id ?? null;
  const file = row?.contract_files?.find((candidate) => candidate.id === fileId) ?? null;
  if (!file) return { data: null, error: new Error("Scoped contract file was not found.") };

  const downloaded = await admin().storage
    .from(getAppConfig().supabase.storageBucket)
    .download(file.storage_path);
  if (downloaded.error || !downloaded.data) {
    return { data: null, error: new Error("The scoped contract file could not be retrieved.") };
  }
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  return {
    data: {
      id: file.id,
      fileName: file.file_name,
      mimeType: file.mime_type,
      declaredSizeBytes: file.size_bytes,
      bytes
    },
    error: null
  };
}

export async function createAdminScopedContractFileUrl(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  expiresInSeconds?: number;
}) {
  const result = await admin()
    .from("contracts")
    .select("contract_files(id, storage_path)")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error as Error };
  const row = result.data as unknown as {
    contract_files: Array<{ id: string; storage_path: string }> | null;
  } | null;
  const file = row?.contract_files?.find((candidate) => candidate.id === input.contractFileId) ?? null;
  if (!file) return { data: null, error: new Error("Scoped contract file was not found.") };
  const signed = await admin().storage
    .from(getAppConfig().supabase.storageBucket)
    .createSignedUrl(file.storage_path, Math.min(120, Math.max(30, input.expiresInSeconds ?? 60)));
  if (signed.error || !signed.data?.signedUrl) {
    return { data: null, error: new Error("A temporary contract file link could not be created.") };
  }
  return { data: { signedUrl: signed.data.signedUrl }, error: null };
}

export async function replaceAdminContractDocumentPages(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  extractionRunId: string;
  pages: Array<Record<string, unknown>>;
}) {
  const client = admin();
  const removed = await client
    .from("contract_document_pages")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("extraction_run_id", input.extractionRunId);
  if (removed.error) return { data: null, error: removed.error as Error };
  if (input.pages.length === 0) return { data: [], error: null };
  return client
    .from("contract_document_pages")
    .insert(input.pages.map((page) => ({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      contract_file_id: input.contractFileId,
      extraction_run_id: input.extractionRunId,
      ...page
    })) as never)
    .select("id, page_number") as unknown as Promise<{
      data: Array<{ id: string; page_number: number }> | null;
      error: Error | null;
    }>;
}

export async function updateAdminContractExtractionRun(input: {
  organizationId: string;
  runId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("contract_extraction_runs")
    .update({
      ...input.values,
      updated_at: new Date().toISOString()
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.runId)
    .select("*")
    .single() as unknown as Promise<{ data: ContractExtractionRun | null; error: Error | null }>;
}

export async function insertAdminContractExtractedFields(input: {
  organizationId: string;
  contractId: string;
  extractionRunId: string;
  fields: Array<Record<string, unknown>>;
}) {
  if (input.fields.length === 0) {
    return { data: [] as ContractExtractedField[], error: null };
  }

  return admin()
    .from("contract_extracted_fields")
    .insert(
      input.fields.map((field) => ({
        organization_id: input.organizationId,
        contract_id: input.contractId,
        extraction_run_id: input.extractionRunId,
        ...field
      })) as never
    )
    .select("*") as unknown as Promise<{ data: ContractExtractedField[] | null; error: Error | null }>;
}

export async function listAdminContractExtractionRuns(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  return admin()
    .from("contract_extraction_runs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{ data: ContractExtractionRun[] | null; error: Error | null }>;
}

export async function listAdminContractExtractedFields(input: {
  organizationId: string;
  contractId: string;
  extractionRunId?: string;
  evidenceStatus?: string;
}) {
  let query = admin()
    .from("contract_extracted_fields")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false });

  if (input.extractionRunId) {
    query = query.eq("extraction_run_id", input.extractionRunId);
  }
  if (input.evidenceStatus) {
    query = query.eq("evidence_status", input.evidenceStatus);
  }

  return query as unknown as Promise<{ data: ContractExtractedField[] | null; error: Error | null }>;
}

export async function listAdminContractDocumentRelationships(input: {
  organizationId: string;
  contractId: string;
}) {
  return admin()
    .from("contract_document_relationships")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("effective_date", { ascending: false, nullsFirst: false }) as unknown as Promise<{
      data: ContractDocumentRelationship[] | null;
      error: Error | null;
    }>;
}

export async function getAdminOrganizationTimezone(input: { organizationId: string }) {
  return admin()
    .from("organizations")
    .select("timezone")
    .eq("id", input.organizationId)
    .maybeSingle() as unknown as Promise<{
      data: { timezone: string | null } | null;
      error: Error | null;
    }>;
}

export async function updateAdminContractExtractedFieldReview(input: {
  organizationId: string;
  contractId: string;
  fieldId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("contract_extracted_fields")
    .update(input.values as never)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .eq("id", input.fieldId)
    .select("*")
    .single() as unknown as Promise<{ data: ContractExtractedField | null; error: Error | null }>;
}

export async function supersedeAdminAcceptedExtractedFields(input: {
  organizationId: string;
  contractId: string;
  fieldKey: string;
  exceptFieldId: string;
  supersededByFieldId: string;
}) {
  return admin()
    .from("contract_extracted_fields")
    .update({
      evidence_status: "superseded",
      supersedes_field_id: input.supersededByFieldId
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .eq("field_key", input.fieldKey)
    .eq("evidence_status", "accepted")
    .neq("id", input.exceptFieldId)
    .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: Error | null }>;
}

export async function getAdminContractMetadataForPatch(input: {
  organizationId: string;
  contractId: string;
}) {
  return admin()
    .from("contract_metadata")
    .select("id, field_confidence, field_source_snippets")
    .eq("contract_id", input.contractId)
    .single() as unknown as Promise<{
      data: { id: string; field_confidence: Record<string, number> | null; field_source_snippets: Record<string, string> | null } | null;
      error: Error | null;
    }>;
}

export async function updateAdminContractMetadataFromExtraction(input: {
  metadataId: string;
  patch: ContractMetadataPatch;
}) {
  return admin()
    .from("contract_metadata")
    .update(input.patch as never)
    .eq("id", input.metadataId)
    .select("id")
    .single() as unknown as Promise<{ data: { id: string } | null; error: Error | null }>;
}

export async function markAdminExtractedFieldsApplied(input: {
  organizationId: string;
  contractId: string;
  fieldIds: string[];
  appliedAt: string;
}) {
  if (input.fieldIds.length === 0) {
    return { data: [] as ContractExtractedField[], error: null };
  }

  return admin()
    .from("contract_extracted_fields")
    .update({ applied_to_contract_at: input.appliedAt } as never)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .in("id", input.fieldIds)
    .select("*") as unknown as Promise<{ data: ContractExtractedField[] | null; error: Error | null }>;
}

export async function replaceAdminCommercialAnalysis(input: {
  organizationId: string;
  contractId: string;
  extractionRunId?: string | null;
  calculations: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
}) {
  const client = admin();
  const now = new Date().toISOString();
  const supersedeCalculations = await client
    .from("contract_commercial_calculations")
    .update({ superseded_at: now } as never)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .is("superseded_at", null);
  if (supersedeCalculations.error) return { error: supersedeCalculations.error as Error };

  const supersedeFindings = await client
    .from("contract_commercial_findings")
    .update({ status: "superseded", updated_at: now } as never)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .in("status", ["open", "reviewed"]);
  if (supersedeFindings.error) return { error: supersedeFindings.error as Error };

  if (input.calculations.length > 0) {
    const inserted = await client.from("contract_commercial_calculations").insert(
      input.calculations.map((calculation) => ({
        organization_id: input.organizationId,
        contract_id: input.contractId,
        ...calculation
      })) as never
    );
    if (inserted.error) return { error: inserted.error as Error };
  }
  if (input.findings.length > 0) {
    const inserted = await client.from("contract_commercial_findings").insert(
      input.findings.map((finding) => ({
        organization_id: input.organizationId,
        contract_id: input.contractId,
        extraction_run_id: input.extractionRunId ?? null,
        ...finding
      })) as never
    );
    if (inserted.error) return { error: inserted.error as Error };
  }
  return { error: null };
}
