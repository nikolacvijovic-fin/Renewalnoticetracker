import { createHash, randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAppConfig } from "@/lib/config";
import type {
  RenewalQuoteComparison,
  RenewalQuoteFinding,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function persistAdminCommercialComparisonTransaction(input: {
  organizationId: string;
  contractId: string;
  actorUserId: string;
  baselineId: string;
  quoteFileId?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  return admin().rpc("persist_commercial_comparison_transaction", {
    p_organization_id: input.organizationId,
    p_contract_id: input.contractId,
    p_actor_user_id: input.actorUserId,
    p_baseline_id: input.baselineId,
    p_quote_file_id: input.quoteFileId ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_payload: input.payload as never
  }) as unknown as Promise<{
    data: { comparisonId: string; proposalVersionId: string; isNew: boolean } | null;
    error: Error | null;
  }>;
}

export async function uploadAdminRenewalProposalFile(input: {
  organizationId: string;
  contractId: string;
  actorUserId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const client = admin();
  const scoped = await client.from("contracts").select("id").eq("organization_id", input.organizationId)
    .eq("id", input.contractId).maybeSingle();
  if (scoped.error) return { data: null, error: scoped.error as Error };
  if (!scoped.data) return { data: null, error: new Error("Contract was not found for the active organization.") };
  const extensionByMime: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
  };
  const extension = extensionByMime[input.mimeType];
  if (!extension) return { data: null, error: new Error("Unsupported proposal file type.") };
  const contentHash = createHash("sha256").update(input.buffer).digest("hex");
  const existing = await client.from("contract_files")
    .select("id, file_name, mime_type, size_bytes, proposal_upload_status")
    .eq("contract_id", input.contractId)
    .eq("extraction_source", "commercial_proposal")
    .eq("proposal_content_hash", contentHash)
    .in("proposal_upload_status", ["pending", "ready"])
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return { data: null, error: existing.error as Error };
  if (existing.data) {
    return {
      data: {
        ...(existing.data as { id: string; file_name: string; mime_type: string; size_bytes: number; proposal_upload_status: "pending" | "ready" }),
        idempotentReplay: true
      },
      error: null
    };
  }
  const storagePath = `${input.organizationId}/${input.contractId}/commercial-proposals/${randomUUID()}.${extension}`;
  const uploaded = await client.storage.from(getAppConfig().supabase.storageBucket).upload(storagePath, input.buffer, {
    contentType: input.mimeType,
    upsert: false
  });
  if (uploaded.error) return { data: null, error: uploaded.error as Error };
  const row = await client.from("contract_files").insert({
    contract_id: input.contractId,
    storage_path: storagePath,
    file_name: input.fileName.slice(0, 255),
    mime_type: input.mimeType,
    size_bytes: input.buffer.length,
    extracted_text: null,
    extraction_error: null,
    extraction_source: "commercial_proposal",
    proposal_upload_status: "pending",
    proposal_content_hash: contentHash,
    proposal_failure_code: null,
    uploaded_by: input.actorUserId
  } as never).select("id, file_name, mime_type, size_bytes, proposal_upload_status").single();
  if (row.error) {
    await client.storage.from(getAppConfig().supabase.storageBucket).remove([storagePath]);
    const raced = await client.from("contract_files")
      .select("id, file_name, mime_type, size_bytes, proposal_upload_status")
      .eq("contract_id", input.contractId)
      .eq("extraction_source", "commercial_proposal")
      .eq("proposal_content_hash", contentHash)
      .in("proposal_upload_status", ["pending", "ready"])
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (raced.data) return { data: { ...raced.data, idempotentReplay: true }, error: null };
    return { data: null, error: row.error as Error };
  }
  return {
    data: {
      ...(row.data as { id: string; file_name: string; mime_type: string; size_bytes: number; proposal_upload_status: "pending" }),
      idempotentReplay: false
    },
    error: null
  };
}

export async function getAdminReadyCommercialProposal(input: {
  organizationId: string;
  contractId: string;
  quoteFileId: string;
}) {
  const scoped = await admin().from("contracts").select("id")
    .eq("organization_id", input.organizationId).eq("id", input.contractId).maybeSingle();
  if (scoped.error || !scoped.data) return { data: null, error: scoped.error as Error | null };
  const file = await admin().from("contract_files").select("proposal_upload_status")
    .eq("contract_id", input.contractId).eq("id", input.quoteFileId).maybeSingle();
  if (file.error || file.data?.proposal_upload_status !== "ready") {
    return { data: null, error: file.error as Error | null };
  }
  return admin().from("renewal_quote_proposal_versions")
    .select("document_type, terms_snapshot")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .eq("quote_file_id", input.quoteFileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as Promise<{
      data: { document_type: string; terms_snapshot: Record<string, unknown> } | null;
      error: Error | null;
    }>;
}

export async function markAdminRenewalProposalUploadReady(input: {
  organizationId: string;
  contractId: string;
  quoteFileId: string;
}) {
  const client = admin();
  const scoped = await client.from("contracts").select("id")
    .eq("organization_id", input.organizationId).eq("id", input.contractId).maybeSingle();
  if (scoped.error || !scoped.data) return { data: null, error: scoped.error as Error | null };
  const transition = await client.from("contract_files").update({
    proposal_upload_status: "ready",
    proposal_failure_code: null,
    proposal_processed_at: new Date().toISOString()
  } as never).eq("contract_id", input.contractId).eq("id", input.quoteFileId)
    .eq("proposal_upload_status", "pending")
    .is("storage_deleted_at", null)
    .select("id, proposal_upload_status")
    .maybeSingle() as unknown as {
      data: { id: string; proposal_upload_status: "ready" } | null;
      error: Error | null;
    };
  if (transition.error) return { data: null, error: transition.error };
  if (!transition.data || transition.data.proposal_upload_status !== "ready") {
    return {
      data: null,
      error: new Error("Proposal upload state transition was not allowed.")
    };
  }
  return { data: transition.data, error: null };
}

export async function failAdminRenewalProposalUpload(input: {
  organizationId: string;
  contractId: string;
  quoteFileId: string;
  failureCode: "proposal_extraction_failed" | "proposal_comparison_failed" | "proposal_no_comparable_terms";
}) {
  const client = admin();
  const scoped = await client.from("contracts").select("id")
    .eq("organization_id", input.organizationId).eq("id", input.contractId).maybeSingle();
  if (scoped.error || !scoped.data) return { cleaned: false, error: scoped.error as Error | null };
  const file = await client.from("contract_files")
    .select("storage_path, proposal_upload_status, storage_deleted_at")
    .eq("contract_id", input.contractId).eq("id", input.quoteFileId).maybeSingle();
  if (file.error || !file.data) return { cleaned: false, error: file.error as Error | null };
  if (file.data.proposal_upload_status === "ready") {
    return { cleaned: false, error: new Error("Ready proposal uploads cannot be failed by cleanup.") };
  }
  const failed = await client.from("contract_files").update({
    proposal_upload_status: "failed",
    proposal_failure_code: input.failureCode,
    extraction_error: "Proposal processing failed safely.",
    extracted_text: null,
    proposal_processed_at: new Date().toISOString()
  } as never).eq("contract_id", input.contractId).eq("id", input.quoteFileId)
    .neq("proposal_upload_status", "ready");
  if (failed.error) return { cleaned: false, error: failed.error as Error };
  if (!file.data.storage_deleted_at) {
    const removed = await client.storage.from(getAppConfig().supabase.storageBucket)
      .remove([String(file.data.storage_path)]);
    if (removed.error) return { cleaned: false, error: removed.error as Error };
    const deletionRecorded = await client.from("contract_files")
      .update({ storage_deleted_at: new Date().toISOString() } as never)
      .eq("contract_id", input.contractId).eq("id", input.quoteFileId);
    if (deletionRecorded.error) return { cleaned: false, error: deletionRecorded.error as Error };
  }
  return { cleaned: true, error: null };
}

export async function insertAdminRenewalQuoteComparison(input: {
  organizationId: string;
  contractId: string;
  quoteFileId?: string | null;
  requestedByUserId?: string | null;
  source?: string;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      quote_file_id: input.quoteFileId ?? null,
      requested_by_user_id: input.requestedByUserId ?? null,
      source: input.source ?? "manual",
      status: "draft"
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function updateAdminRenewalQuoteComparison(input: {
  organizationId: string;
  comparisonId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.comparisonId)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function getAdminRenewalQuoteComparison(input: {
  organizationId: string;
  comparisonId: string;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.comparisonId)
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function listAdminRenewalQuoteComparisons(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{ data: RenewalQuoteComparison[] | null; error: Error | null }>;
}

export async function insertAdminRenewalQuoteFindings(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  findings: Array<Record<string, unknown>>;
}) {
  if (input.findings.length === 0) {
    return { data: [] as RenewalQuoteFinding[], error: null };
  }

  return admin()
    .from("renewal_quote_comparison_findings")
    .insert(
      input.findings.map((finding) => ({
        organization_id: input.organizationId,
        contract_id: input.contractId,
        comparison_id: input.comparisonId,
        ...finding
      })) as never
    )
    .select("*") as unknown as Promise<{ data: RenewalQuoteFinding[] | null; error: Error | null }>;
}

export async function listAdminRenewalQuoteFindings(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("renewal_quote_comparison_findings")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }
  if (input.comparisonId) {
    query = query.eq("comparison_id", input.comparisonId);
  }

  return query as unknown as Promise<{ data: RenewalQuoteFinding[] | null; error: Error | null }>;
}

export async function getAdminRenewalQuoteFinding(input: {
  organizationId: string;
  findingId: string;
}) {
  return admin()
    .from("renewal_quote_comparison_findings")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.findingId)
    .single() as unknown as Promise<{ data: RenewalQuoteFinding | null; error: Error | null }>;
}

export async function updateAdminRenewalQuoteFinding(input: {
  organizationId: string;
  findingId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_quote_comparison_findings")
    .update(input.values as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.findingId)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteFinding | null; error: Error | null }>;
}

export async function insertAdminSavingsOpportunity(input: {
  organizationId: string;
  contractId: string;
  comparisonId?: string | null;
  opportunity: Record<string, unknown>;
}) {
  return admin()
    .from("savings_opportunities")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      comparison_id: input.comparisonId ?? null,
      ...input.opportunity
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: SavingsOpportunity | null; error: Error | null }>;
}

export async function listAdminSavingsOpportunities(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("savings_opportunities")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }
  if (input.comparisonId) {
    query = query.eq("comparison_id", input.comparisonId);
  }

  return query as unknown as Promise<{ data: SavingsOpportunity[] | null; error: Error | null }>;
}

export async function updateAdminSavingsOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("savings_opportunities")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.opportunityId)
    .select("*")
    .single() as unknown as Promise<{ data: SavingsOpportunity | null; error: Error | null }>;
}

export async function getLatestAdminCommercialBaseline(input: {
  organizationId: string;
  contractId: string;
}) {
  const baseline = await admin()
    .from("contract_commercial_baselines")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return baseline as unknown as Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
}

export async function insertAdminProposalVersion(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  quoteFileId?: string | null;
  extractionRunId?: string | null;
  documentType: string;
  termsSnapshot: Record<string, unknown>;
  evidenceFieldIds: string[];
  evidenceFingerprint: string;
  warningCodes: string[];
}) {
  const previous = await admin()
    .from("renewal_quote_proposal_versions")
    .select("version")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) return { data: null, error: previous.error as Error };
  const version = Number((previous.data as { version?: number } | null)?.version ?? 0) + 1;
  return admin()
    .from("renewal_quote_proposal_versions")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      comparison_id: input.comparisonId,
      quote_file_id: input.quoteFileId ?? null,
      extraction_run_id: input.extractionRunId ?? null,
      version,
      document_type: input.documentType,
      review_status: "pending_review",
      terms_snapshot: input.termsSnapshot,
      evidence_field_ids: input.evidenceFieldIds,
      evidence_fingerprint: input.evidenceFingerprint,
      missing_data_warnings: input.warningCodes
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
}

export async function insertAdminProposalLineItems(input: {
  organizationId: string;
  contractId: string;
  proposalVersionId: string;
  rows: Array<Record<string, unknown>>;
}) {
  if (input.rows.length === 0) return { data: [], error: null };
  return admin().from("renewal_quote_proposal_line_items").insert(input.rows.map((row) => ({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    proposal_version_id: input.proposalVersionId,
    ...row
  })) as never).select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: Error | null }>;
}

export async function insertAdminCommercialCostBridge(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  baselineId: string;
  proposalVersionId: string;
  values: Record<string, unknown>;
}) {
  return admin().from("renewal_quote_cost_bridges").insert({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    comparison_id: input.comparisonId,
    baseline_id: input.baselineId,
    proposal_version_id: input.proposalVersionId,
    ...input.values
  } as never).select("id").single() as unknown as Promise<{ data: { id: string } | null; error: Error | null }>;
}

export async function insertAdminCommercialScenarios(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  rows: Array<Record<string, unknown>>;
}) {
  return admin().from("renewal_quote_scenarios").insert(input.rows.map((row) => ({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    comparison_id: input.comparisonId,
    ...row
  })) as never).select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: Error | null }>;
}
