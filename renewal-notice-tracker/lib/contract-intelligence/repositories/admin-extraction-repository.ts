import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  ContractExtractedField,
  ContractExtractionMode,
  ContractExtractionRun
} from "@/lib/contract-intelligence/extraction-types";
import type { ContractMetadataPatch } from "@/lib/contract-intelligence/extraction-evidence";

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
      status: "queued"
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: ContractExtractionRun | null; error: Error | null }>;
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

export async function updateAdminContractExtractedFieldReview(input: {
  organizationId: string;
  fieldId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("contract_extracted_fields")
    .update(input.values as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.fieldId)
    .select("*")
    .single() as unknown as Promise<{ data: ContractExtractedField | null; error: Error | null }>;
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
