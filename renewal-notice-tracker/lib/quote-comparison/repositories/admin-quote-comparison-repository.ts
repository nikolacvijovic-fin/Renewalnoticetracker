import { randomUUID } from "node:crypto";
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
    uploaded_by: input.actorUserId
  } as never).select("id, file_name, mime_type, size_bytes").single();
  if (row.error) {
    await client.storage.from(getAppConfig().supabase.storageBucket).remove([storagePath]);
    return { data: null, error: row.error as Error };
  }
  return { data: row.data as { id: string; file_name: string; mime_type: string; size_bytes: number }, error: null };
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
