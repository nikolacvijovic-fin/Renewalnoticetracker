"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  getSaasRenewalImportReviewQueue,
  getSaasOptOutClock,
  requireScopedSaasSoftware,
  type SaasOptOutClock,
  type SaasRenewalImportReviewBatch,
  type SaasRenewalImportQueueRow
} from "@/lib/saas/queries";
import {
  getOrganizationMembers,
  requireScopedContract,
  type OrganizationMember
} from "@/lib/contracts/kernel-queries";
import {
  assessSaasRenewalImportRows,
  buildSaasRenewalActivationPlan,
  buildSaasRenewalImportDuplicateKey,
  buildSaasRenewalImportRow,
  parseSaasRenewalImportFile,
  type SaasRenewalImportAssessment,
  type SaasRenewalActivationPlan,
  type SaasRenewalImportCleanupResult,
  type SaasRenewalImportRow
} from "@/lib/saas/import-cleanup";
import {
  buildSafeSaasRenewalDefenseAuditMetadata,
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  detectSaasContractMetadataConflicts,
  deriveSaasOptOutWorkflowStatus,
  deriveRecommendedSaasTrustedSource,
  getOptOutDeadlineWindow,
  getOptOutUrgency,
  type SaasConflictField,
  type SaasMetadataConflict,
  type SaasTrustedSource,
  type SaasOptOutWorkflowStatus,
  type NoticePeriodUnit
} from "@/lib/saas/renewal-defense";

const writeRoles = new Set(["admin", "operator"]);
const conflictResolutionRoles = new Set(["admin", "operator", "reviewer"]);
const MAX_SAAS_RENEWAL_IMPORT_ROWS = 500;
const MANUAL_SAAS_TERM_EVIDENCE_CONFIDENCE = 0.6;

function requireSaasWriteRole(role: string) {
  if (!writeRoles.has(role)) {
    throw new Error("Only admins and operators can manage SaaS renewal-defense records.");
  }
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function correctionText(formData: FormData, key: string) {
  if (!formData.has(key)) return null;
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = optionalText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const softwareSchema = z.object({
  name: z.string().trim().min(1),
  vendorName: z.string().trim().nullable(),
  category: z.string().trim().nullable(),
  ownerUserId: z.string().uuid().nullable()
});

const contractTermSchema = z.object({
  softwareId: z.string().uuid(),
  contractId: z.string().uuid().nullable(),
  renewalDate: z.string().trim().nullable(),
  expirationDate: z.string().trim().nullable(),
  noticeDeadlineDate: z.string().trim().nullable(),
  noticePeriodValue: z.number().int().positive().nullable(),
  noticePeriodUnit: z.enum(["days", "weeks", "months"]).nullable(),
  autoRenewal: z.boolean(),
  termSummary: z.string().trim().nullable(),
  contractValueAmount: z.number().nullable(),
  contractValueCurrency: z.string().trim().nullable()
});

const optOutWorkflowSchema = z.object({
  optOutWindowId: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable(),
  nextAction: z.string().trim().max(240).nullable(),
  nextActionDueAt: z.string().trim().nullable(),
  workflowStatus: z.enum([
    "needs_review",
    "ready",
    "owner_assigned",
    "decision_needed",
    "resolved",
    "accepted_risk",
    "ignored"
  ]).nullable()
});

const findingStatusSchema = z.object({
  findingId: z.string().uuid(),
  status: z.enum(["resolved", "accepted_risk", "ignored"])
});

export type SaasRenewalImportPreviewResult = {
  batchId: string;
  assessment: SaasRenewalImportAssessment;
  canActivateReadyRows: boolean;
};

export type SaasRenewalImportActivationResult = {
  assessment: SaasRenewalImportAssessment;
  activatedCount: number;
  blockedCount: number;
};

const importRowCorrectionSchema = z.object({
  rowId: z.string().uuid(),
  vendorName: z.string().trim().nullable(),
  productName: z.string().trim().nullable(),
  renewalDate: z.string().trim().nullable(),
  noticeDeadlineDate: z.string().trim().nullable(),
  noticePeriod: z.string().trim().nullable(),
  contractValueAmount: z.string().trim().nullable(),
  contractValueCurrency: z.string().trim().nullable(),
  ownerEmail: z.string().trim().nullable(),
  departmentCategory: z.string().trim().nullable(),
  sourceNotes: z.string().trim().nullable(),
  reviewNotes: z.string().trim().max(500).nullable()
});

const importRowIdSchema = z.object({
  rowId: z.string().uuid(),
  reviewNotes: z.string().trim().max(500).nullable()
});

const importBatchIdSchema = z.object({
  batchId: z.string().uuid()
});

const saasTermIdSchema = z.object({
  saasTermId: z.string().uuid()
});

const conflictResolutionSchema = z.object({
  saasTermId: z.string().uuid(),
  fieldName: z.enum([
    "renewal_date",
    "expiration_date",
    "notice_deadline_date",
    "auto_renewal",
    "contract_value_amount",
    "contract_value_currency"
  ]),
  trustedSource: z.enum(["contract_metadata", "saas_term", "manual_override"]),
  manualOverride: z.string().trim().nullable(),
  resolutionReason: z.string().trim().max(500).nullable()
});

const conflictReopenSchema = z.object({
  resolutionId: z.string().uuid(),
  reason: z.string().trim().max(500).nullable()
});

type OrganizationActionContext = Awaited<ReturnType<typeof requireOrganization>>;
type ReadySaasRenewalImportRow = SaasRenewalActivationPlan["readyRows"][number];

async function auditSaasRenewalDefense(input: {
  organizationId: string;
  actorUserId: string;
  contractId?: string | null;
  softwareId?: string | null;
  saasTermId?: string | null;
  optOutWindowId?: string | null;
  importBatchId?: string | null;
  importRowId?: string | null;
  rowNumber?: number | null;
  issueCodes?: string[] | null;
  findingId?: string | null;
  fieldName?: SaasConflictField | null;
  trustedSource?: SaasTrustedSource | null;
  hasManualOverride?: boolean | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  deadlineWindow?: ReturnType<typeof getOptOutDeadlineWindow> | null;
  amount?: number | null;
  currency?: string | null;
}) {
  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      contractId: input.contractId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: buildSafeSaasRenewalDefenseAuditMetadata(input)
    },
    { mode: "best_effort" }
  );
}

function importBatchStatus(summary: SaasRenewalImportAssessment["summary"]) {
  if (summary.needsReviewCount > 0) return "needs_review";
  if (summary.rejectedCount > 0) return "needs_review";
  return "previewed";
}

function reviewedImportStatus(result: SaasRenewalImportCleanupResult) {
  return result.status === "ready" ? "corrected" : result.status;
}

function importIssueCodes(result: SaasRenewalImportCleanupResult) {
  return result.issues.map((issue) => issue.code);
}

function importRowIssueCodes(row: SaasRenewalImportQueueRow) {
  return Array.isArray(row.issue_codes) ? row.issue_codes : [];
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function ownersByEmail(members: OrganizationMember[]) {
  return new Map(
    members
      .map((member) => {
        const email = member.user?.notification_email?.trim().toLowerCase();
        if (!email) return null;
        return [
          email,
          {
            userId: member.user_id,
            label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
          }
        ] as const;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  );
}

function existingSaasDuplicateKeys(clock: SaasOptOutClock) {
  return new Set(
    clock.items
      .map((item) =>
        buildSaasRenewalImportDuplicateKey({
          vendorName: item.software.vendor_name,
          productName: item.software.name,
          renewalDate: item.latestTerm?.renewal_date ?? null,
          noticeDeadlineDate: item.optOutWindow?.opt_out_deadline ?? item.latestTerm?.notice_deadline_date ?? null
        })
      )
      .filter((key): key is string => Boolean(key))
  );
}

type ScopedContractMetadataForSaasRisk = {
  renewalDate?: string | null;
  expirationDate?: string | null;
  noticeDeadlineDate?: string | null;
  autoRenewal?: boolean | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
};

type ScopedContractMetadataRow = {
  contract_metadata:
    | {
        renewal_date: string | null;
        expiration_date: string | null;
        notice_deadline_date: string | null;
        auto_renewal: boolean | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }
    | Array<{
        renewal_date: string | null;
        expiration_date: string | null;
        notice_deadline_date: string | null;
        auto_renewal: boolean | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }>
    | null;
};

type ScopedSaasTermConflictContext = {
  term: {
    id: string;
    organization_id: string;
    software_id: string;
    contract_id: string | null;
    renewal_date: string | null;
    expiration_date: string | null;
    notice_deadline_date: string | null;
    notice_period_value: number | null;
    notice_period_unit: string | null;
    auto_renewal: boolean | null;
    contract_value_amount: number | null;
    contract_value_currency: string | null;
  };
  contract: {
    id: string;
    owner_user_id: string | null;
    contract_metadata: ScopedContractMetadataRow["contract_metadata"];
  };
  conflicts: SaasMetadataConflict[];
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function getScopedContractMetadataForSaasRisk(
  contractId: string | null,
  organizationId: string
): Promise<ScopedContractMetadataForSaasRisk | null> {
  if (!contractId) return null;

  await requireScopedContract(contractId, organizationId);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id,
      contract_metadata (
        renewal_date,
        expiration_date,
        notice_deadline_date,
        auto_renewal,
        contract_value_amount,
        contract_value_currency
      )
    `)
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  const row = data as ScopedContractMetadataRow | null;
  const metadata = first(row?.contract_metadata);

  if (!metadata) return null;
  return {
    renewalDate: metadata.renewal_date,
    expirationDate: metadata.expiration_date,
    noticeDeadlineDate: metadata.notice_deadline_date,
    autoRenewal: metadata.auto_renewal,
    contractValueAmount: metadata.contract_value_amount,
    contractValueCurrency: metadata.contract_value_currency
  };
}

async function getScopedSaasTermConflictContext(
  saasTermId: string,
  organizationId: string
): Promise<ScopedSaasTermConflictContext> {
  const supabase = createServerSupabaseClient();
  const { data: term, error: termError } = await supabase
    .from("saas_contract_terms")
    .select("*")
    .eq("id", saasTermId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (termError) throw termError;
  if (!term?.id) throw new Error("SaaS contract term not found for active organization.");
  if (!term.contract_id) throw new Error("SaaS contract term is not linked to a contract.");

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select(`
      id,
      owner_user_id,
      contract_metadata (
        renewal_date,
        expiration_date,
        notice_deadline_date,
        auto_renewal,
        contract_value_amount,
        contract_value_currency
      )
    `)
    .eq("id", term.contract_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (contractError) throw contractError;
  const typedContract = contract as ScopedSaasTermConflictContext["contract"] | null;
  if (!typedContract?.id) throw new Error("Linked contract not found for active organization.");

  const metadata = first(typedContract.contract_metadata);
  const typedTerm = term as ScopedSaasTermConflictContext["term"];
  const conflicts = detectSaasContractMetadataConflicts({
    saas: {
      renewalDate: typedTerm.renewal_date,
      expirationDate: typedTerm.expiration_date,
      noticeDeadlineDate: typedTerm.notice_deadline_date,
      noticePeriodValue: typedTerm.notice_period_value,
      noticePeriodUnit: typedTerm.notice_period_unit as NoticePeriodUnit | null,
      autoRenewal: typedTerm.auto_renewal,
      contractValueAmount: typedTerm.contract_value_amount,
      contractValueCurrency: typedTerm.contract_value_currency
    },
    contractMetadata: metadata
      ? {
          renewalDate: metadata.renewal_date,
          expirationDate: metadata.expiration_date,
          noticeDeadlineDate: metadata.notice_deadline_date,
          autoRenewal: metadata.auto_renewal,
          contractValueAmount: metadata.contract_value_amount,
          contractValueCurrency: metadata.contract_value_currency
        }
      : null
  });

  return {
    term: typedTerm,
    contract: typedContract,
    conflicts
  };
}

function requireSaasConflictResolutionPermission(
  context: OrganizationActionContext,
  conflictContext: ScopedSaasTermConflictContext
) {
  if (conflictResolutionRoles.has(context.role)) return;
  if (context.role === "owner" && conflictContext.contract.owner_user_id === context.user.id) return;
  throw new Error("Only admins, operators, reviewers, or the linked contract owner can resolve SaaS metadata conflicts.");
}

function parseManualOverride(fieldName: SaasConflictField, value: string | null): string | number | boolean | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (fieldName === "auto_renewal") {
    if (text === "true") return true;
    if (text === "false") return false;
    throw new Error("Manual auto-renewal override must be exactly true or false.");
  }
  if (fieldName === "contract_value_amount") {
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Manual amount override must be a valid non-negative number.");
    return amount;
  }
  if (fieldName === "contract_value_currency") {
    if (!/^[A-Z]{3}$/.test(text)) throw new Error("Manual currency override must be exactly 3 uppercase letters.");
    return text;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Manual date override must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error("Manual date override must be a valid YYYY-MM-DD date.");
  }
  return text.slice(0, 10);
}

async function updateConflictRiskFindingLifecycle(input: {
  organizationId: string;
  saasTermId: string;
  allConflictFields: SaasConflictField[];
  reopen?: boolean;
}) {
  const supabase = createServerSupabaseClient();
  if (input.reopen) {
    const { error } = await supabase
      .from("saas_contract_risk_findings")
      .update({ status: "open" })
      .eq("organization_id", input.organizationId)
      .eq("contract_term_id", input.saasTermId)
      .eq("finding_type", "contract_saas_metadata_conflict");
    if (error) throw error;
    return;
  }

  const { data: activeResolutions, error: resolutionsError } = await supabase
    .from("saas_contract_metadata_conflict_resolutions")
    .select("field_name")
    .eq("organization_id", input.organizationId)
    .eq("saas_term_id", input.saasTermId)
    .is("reopened_at", null);

  if (resolutionsError) throw resolutionsError;
  const resolvedFields = new Set((activeResolutions ?? []).map((row) => String(row.field_name)));
  const allResolved = input.allConflictFields.every((field) => resolvedFields.has(field));
  if (!allResolved || input.allConflictFields.length === 0) return;

  const { error } = await supabase
    .from("saas_contract_risk_findings")
    .update({ status: "resolved" })
    .eq("organization_id", input.organizationId)
    .eq("contract_term_id", input.saasTermId)
    .eq("finding_type", "contract_saas_metadata_conflict")
    .eq("status", "open");

  if (error) throw error;
}

async function persistSaasRenewalImportAssessment(input: {
  organizationId: string;
  actorUserId: string;
  fileName: string;
  rows: SaasRenewalImportRow[];
  assessment: SaasRenewalImportAssessment;
}) {
  const supabase = createServerSupabaseClient();
  const { data: batch, error: batchError } = await supabase
    .from("saas_renewal_import_batches")
    .insert({
      organization_id: input.organizationId,
      uploaded_by_user_id: input.actorUserId,
      original_filename: input.fileName,
      status: importBatchStatus(input.assessment.summary),
      total_rows: input.assessment.summary.totalRows,
      ready_count: input.assessment.summary.readyCount,
      needs_review_count: input.assessment.summary.needsReviewCount,
      rejected_count: input.assessment.summary.rejectedCount,
      activated_count: 0,
      dismissed_count: 0,
      spend_at_risk_amount: input.assessment.summary.spendAtRiskAmount,
      spend_at_risk_currency: input.assessment.summary.spendAtRiskCurrency
    })
    .select("id")
    .single();

  if (batchError) throw batchError;
  if (!batch?.id) throw new Error("SaaS renewal import batch was not created.");

  const { error: rowsError } = await supabase.from("saas_renewal_import_rows").insert(
    input.assessment.results.map((result) => ({
      organization_id: input.organizationId,
      batch_id: batch.id,
      row_number: result.rowNumber,
      status: result.status,
      weak_evidence_accepted: false,
      duplicate_confirmed: false,
      original_row_json: toJson(input.rows[result.rowNumber - 2] ?? buildSaasRenewalImportRow()),
      normalized_row_json: toJson(result.normalized),
      issue_codes: importIssueCodes(result),
      correction_json: {}
    }))
  );

  if (rowsError) throw rowsError;
  return batch.id as string;
}

async function parseAndPersistSaasRenewalImport(context: OrganizationActionContext, formData: FormData) {
  requireSaasWriteRole(context.role);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Upload a SaaS renewal CSV or XLSX file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseSaasRenewalImportFile(file.name, buffer);
  if (rows.length > MAX_SAAS_RENEWAL_IMPORT_ROWS) {
    throw new Error(`SaaS renewal import is limited to ${MAX_SAAS_RENEWAL_IMPORT_ROWS} rows per cleanup batch.`);
  }

  const [members, clock] = await Promise.all([
    getOrganizationMembers(context.organizationId),
    getSaasOptOutClock(context.organizationId)
  ]);
  const assessment = assessSaasRenewalImportRows(rows, {
    organizationId: context.organizationId,
    ownersByEmail: ownersByEmail(members),
    existingDuplicateKeys: existingSaasDuplicateKeys(clock)
  });
  const batchId = await persistSaasRenewalImportAssessment({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    fileName: file.name,
    rows,
    assessment
  });

  return { assessment, batchId };
}

async function getScopedSaasImportRow(rowId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("saas_renewal_import_rows")
    .select("*")
    .eq("id", rowId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("SaaS renewal import row not found for active organization.");
  return data as SaasRenewalImportQueueRow;
}

async function reassessSingleImportRow(input: {
  context: OrganizationActionContext;
  rawRow: SaasRenewalImportRow;
  rowNumber: number;
  acceptedWeakEvidence: boolean;
  duplicateConfirmed?: boolean;
}) {
  const [members, clock] = await Promise.all([
    getOrganizationMembers(input.context.organizationId),
    getSaasOptOutClock(input.context.organizationId)
  ]);

  const assessment = assessSaasRenewalImportRows([input.rawRow], {
    organizationId: input.context.organizationId,
    ownersByEmail: ownersByEmail(members),
    existingDuplicateKeys: existingSaasDuplicateKeys(clock),
    acceptedWeakEvidenceRowNumbers: input.acceptedWeakEvidence ? new Set([2]) : undefined,
    acceptedDuplicateRowNumbers: input.duplicateConfirmed ? new Set([2]) : undefined
  });
  const result = assessment.results[0];
  if (!result) throw new Error("SaaS renewal import row could not be assessed.");
  return {
    ...result,
    rowNumber: input.rowNumber
  };
}

function rawImportRowFromJson(value: unknown): SaasRenewalImportRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildSaasRenewalImportRow();
  }
  return buildSaasRenewalImportRow(value as Partial<SaasRenewalImportRow>);
}

function currentImportRowFromReviewRow(row: SaasRenewalImportQueueRow): SaasRenewalImportRow {
  if (row.correction_json && typeof row.correction_json === "object" && !Array.isArray(row.correction_json)) {
    const keys = Object.keys(row.correction_json as Record<string, unknown>);
    if (keys.length > 0) return rawImportRowFromJson(row.correction_json);
  }
  return rawImportRowFromJson(row.original_row_json);
}

function correctedRawRow(existing: SaasRenewalImportRow, payload: z.infer<typeof importRowCorrectionSchema>) {
  return buildSaasRenewalImportRow({
    ...existing,
    vendor_name: payload.vendorName ?? existing.vendor_name,
    product_name: payload.productName ?? existing.product_name,
    renewal_date: payload.renewalDate ?? existing.renewal_date,
    notice_deadline_date: payload.noticeDeadlineDate ?? existing.notice_deadline_date,
    notice_period: payload.noticePeriod ?? existing.notice_period,
    contract_value_amount: payload.contractValueAmount ?? existing.contract_value_amount,
    contract_value_currency: payload.contractValueCurrency ?? existing.contract_value_currency,
    owner_email: payload.ownerEmail ?? existing.owner_email,
    department_category: payload.departmentCategory ?? existing.department_category,
    source_notes: payload.sourceNotes ?? existing.source_notes
  });
}

async function updateStoredImportRow(input: {
  rowId: string;
  organizationId: string;
  actorUserId: string;
  originalRow: SaasRenewalImportRow;
  rawRow: SaasRenewalImportRow;
  result: SaasRenewalImportCleanupResult;
  acceptedWeakEvidence?: boolean;
  duplicateConfirmed?: boolean;
  reviewNotes?: string | null;
  statusOverride?: "ready" | "needs_review" | "rejected" | "corrected";
}) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("saas_renewal_import_rows")
    .update({
      status: input.statusOverride ?? input.result.status,
      review_note: input.reviewNotes ?? null,
      original_row_json: toJson(input.originalRow),
      normalized_row_json: toJson(input.result.normalized),
      issue_codes: importIssueCodes(input.result),
      correction_json: toJson(input.rawRow),
      weak_evidence_accepted: Boolean(input.acceptedWeakEvidence),
      duplicate_confirmed: Boolean(input.duplicateConfirmed),
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: input.actorUserId
    })
    .eq("id", input.rowId)
    .eq("organization_id", input.organizationId);

  if (error) throw error;
}

function normalizedImportAmount(row: SaasRenewalImportQueueRow) {
  if (!row.normalized_row_json || typeof row.normalized_row_json !== "object" || Array.isArray(row.normalized_row_json)) {
    return 0;
  }
  const amount = (row.normalized_row_json as { contractValueAmount?: unknown }).contractValueAmount;
  return Number.isFinite(Number(amount)) ? Number(amount) : 0;
}

function normalizedImportCurrency(row: SaasRenewalImportQueueRow) {
  if (!row.normalized_row_json || typeof row.normalized_row_json !== "object" || Array.isArray(row.normalized_row_json)) {
    return null;
  }
  const currency = (row.normalized_row_json as { contractValueCurrency?: unknown }).contractValueCurrency;
  return typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : null;
}

async function listScopedSaasImportRows(batchId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("saas_renewal_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .eq("organization_id", organizationId)
    .order("row_number", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SaasRenewalImportQueueRow[];
}

async function refreshSaasRenewalImportBatchSummary(batchId: string, organizationId: string) {
  const rows = await listScopedSaasImportRows(batchId, organizationId);
  const readyCount = rows.filter((row) => row.status === "ready" || row.status === "corrected").length;
  const needsReviewCount = rows.filter((row) => row.status === "needs_review").length;
  const rejectedCount = rows.filter((row) => row.status === "rejected").length;
  const activatedCount = rows.filter((row) => row.status === "activated").length;
  const dismissedCount = rows.filter((row) => row.status === "dismissed").length;
  const totalRows = rows.length;
  const status =
    totalRows > 0 && activatedCount + dismissedCount === totalRows
      ? activatedCount > 0 ? "activated" : "dismissed"
      : activatedCount > 0
        ? "partially_activated"
        : needsReviewCount > 0 || rejectedCount > 0
          ? "needs_review"
          : "previewed";
  const spendRows = rows.filter((row) => ["ready", "corrected", "activated"].includes(row.status));
  const spendCurrency = spendRows.map(normalizedImportCurrency).find((currency): currency is string => Boolean(currency)) ?? null;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("saas_renewal_import_batches")
    .update({
      status,
      total_rows: totalRows,
      ready_count: readyCount,
      needs_review_count: needsReviewCount,
      rejected_count: rejectedCount,
      activated_count: activatedCount,
      dismissed_count: dismissedCount,
      spend_at_risk_amount: spendRows.reduce((total, row) => total + normalizedImportAmount(row), 0),
      spend_at_risk_currency: spendCurrency
    })
    .eq("id", batchId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

function singleRowActivationPlan(result: SaasRenewalImportCleanupResult): ReadySaasRenewalImportRow | null {
  const plan = buildSaasRenewalActivationPlan({
    results: [result],
    summary: {
      totalRows: 1,
      readyCount: result.status === "ready" ? 1 : 0,
      needsReviewCount: result.status === "needs_review" ? 1 : 0,
      rejectedCount: result.status === "rejected" ? 1 : 0,
      missingNoticeDeadlineCount: result.issues.some((issue) => issue.code === "missing_notice_deadline") ? 1 : 0,
      missingOwnerCount: result.issues.some((issue) => issue.code === "owner_email_missing" || issue.code === "owner_email_unmapped") ? 1 : 0,
      duplicateSuspectedCount: result.issues.some((issue) => issue.code === "duplicate_suspected") ? 1 : 0,
      weakEvidenceCount: result.issues.some((issue) => issue.code === "weak_evidence") ? 1 : 0,
      spendAtRiskAmount: result.status === "ready" ? result.normalized.contractValueAmount ?? 0 : 0,
      spendAtRiskCurrency: result.status === "ready" ? result.normalized.contractValueCurrency : null
    }
  });
  return plan.readyRows[0] ?? null;
}

async function createTrustedSaasOptOutRecordFromImportRow(
  context: OrganizationActionContext,
  readyRow: ReadySaasRenewalImportRow
) {
  const supabase = createServerSupabaseClient();
  const { data: software, error: softwareError } = await supabase
    .from("saas_software_inventory")
    .insert({
      organization_id: context.organizationId,
      name: readyRow.software.name,
      vendor_name: readyRow.software.vendorName,
      category: readyRow.software.category,
      owner_user_id: readyRow.software.ownerUserId,
      created_by: context.user.id
    })
    .select("id")
    .single();

  if (softwareError) throw softwareError;
  if (!software?.id) throw new Error("SaaS software import row did not create a software record.");

  const { data: term, error: termError } = await supabase
    .from("saas_contract_terms")
    .insert({
      organization_id: context.organizationId,
      software_id: software.id,
      renewal_date: readyRow.term.renewalDate,
      auto_renewal: readyRow.term.autoRenewal,
      notice_period_value: readyRow.term.noticePeriodValue,
      notice_period_unit: readyRow.term.noticePeriodUnit,
      notice_deadline_date: readyRow.term.noticeDeadlineDate,
      term_summary: readyRow.term.termSummary,
      contract_value_amount: readyRow.term.contractValueAmount,
      contract_value_currency: readyRow.term.contractValueCurrency,
      created_by: context.user.id
    })
    .select("id")
    .single();

  if (termError) throw termError;
  if (!term?.id) throw new Error("SaaS import row did not create a contract term.");

  const urgency = getOptOutUrgency(readyRow.optOutWindow.optOutDeadline);
  const { data: optOutWindow, error: windowError } = await supabase
    .from("saas_opt_out_windows")
    .insert({
      organization_id: context.organizationId,
      software_id: software.id,
      contract_term_id: term.id,
      opt_out_deadline: readyRow.optOutWindow.optOutDeadline,
      window_closes_on: readyRow.optOutWindow.optOutDeadline,
      status: urgency === "expired" ? "expired" : "open",
      source: readyRow.optOutWindow.source,
      owner_user_id: readyRow.optOutWindow.ownerUserId,
      workflow_status: readyRow.optOutWindow.workflowStatus
    })
    .select("id")
    .single();

  if (windowError) throw windowError;

  if (readyRow.riskFindings.length > 0) {
    const { error: findingsError } = await supabase.from("saas_contract_risk_findings").insert(
      readyRow.riskFindings.map((finding) => ({
        organization_id: context.organizationId,
        software_id: software.id,
        contract_term_id: term.id,
        opt_out_window_id: optOutWindow?.id ?? null,
        finding_type: finding.findingType,
        severity: finding.severity,
        evidence_json: finding.evidence as Json
      }))
    );
    if (findingsError) throw findingsError;
  }

  return {
    softwareId: software.id as string,
    termId: term.id as string,
    optOutWindowId: (optOutWindow?.id as string | undefined) ?? null
  };
}

async function activatePersistedSaasRenewalImportRow(input: {
  context: OrganizationActionContext;
  existing: SaasRenewalImportQueueRow;
  reviewNotes?: string | null;
}) {
  if (!["ready", "corrected"].includes(input.existing.status)) {
    throw new Error("Only ready or corrected SaaS renewal import rows can be activated.");
  }

  const rawRow = currentImportRowFromReviewRow(input.existing);
  const result = await reassessSingleImportRow({
    context: input.context,
    rawRow,
    rowNumber: input.existing.row_number,
    acceptedWeakEvidence: input.existing.weak_evidence_accepted,
    duplicateConfirmed: input.existing.duplicate_confirmed
  });
  const readyRow = singleRowActivationPlan(result);
  if (!readyRow) throw new Error("SaaS renewal import row still needs review before activation.");

  const created = await createTrustedSaasOptOutRecordFromImportRow(input.context, readyRow);
  const now = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error: rowUpdateError } = await supabase
    .from("saas_renewal_import_rows")
    .update({
      status: "activated",
      review_note: input.reviewNotes ?? input.existing.review_note,
      reviewed_at: now,
      reviewed_by_user_id: input.context.user.id,
      activated_at: now
    })
    .eq("id", input.existing.id)
    .eq("organization_id", input.context.organizationId);

  if (rowUpdateError) throw rowUpdateError;
  await auditSaasRenewalDefense({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    softwareId: created.softwareId,
    saasTermId: created.termId,
    optOutWindowId: created.optOutWindowId,
    importBatchId: input.existing.batch_id,
    importRowId: input.existing.id,
    rowNumber: input.existing.row_number,
    issueCodes: importIssueCodes(result),
    action: "saas.import_row_activated",
    entityType: "saas_renewal_import_row",
    entityId: input.existing.id,
    fromStatus: input.existing.status,
    toStatus: "activated",
    deadlineWindow: getOptOutDeadlineWindow(readyRow.optOutWindow.optOutDeadline),
    amount: readyRow.term.contractValueAmount,
    currency: readyRow.term.contractValueCurrency
  });

  await refreshSaasRenewalImportBatchSummary(input.existing.batch_id, input.context.organizationId);
  return created;
}

export async function previewSaasRenewalImportAction(
  formData: FormData
): Promise<SaasRenewalImportPreviewResult> {
  const context = await requireOrganization();
  const { assessment, batchId } = await parseAndPersistSaasRenewalImport(context, formData);
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: batchId,
    action: "saas.import_batch_created",
    entityType: "saas_renewal_import",
    entityId: batchId,
    toStatus: assessment.summary.rejectedCount > 0 || assessment.summary.needsReviewCount > 0 ? "needs_review" : "ready",
    amount: assessment.summary.spendAtRiskAmount,
    currency: assessment.summary.spendAtRiskCurrency
  });

  return {
    batchId,
    assessment,
    canActivateReadyRows: assessment.summary.readyCount > 0
  };
}

export async function previewSaasRenewalImportFormAction(formData: FormData) {
  await previewSaasRenewalImportAction(formData);
  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath("/dashboard");
}

export async function listLatestSaasRenewalImportBatchesAction(): Promise<SaasRenewalImportReviewBatch[]> {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  return getSaasRenewalImportReviewQueue(context.organizationId);
}

export async function getSaasRenewalImportBatchDetailAction(batchId: string): Promise<SaasRenewalImportReviewBatch> {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importBatchIdSchema.parse({ batchId });
  const batches = await getSaasRenewalImportReviewQueue(context.organizationId);
  const batch = batches.find((candidate) => candidate.id === payload.batchId);
  if (!batch) throw new Error("SaaS renewal import batch not found for active organization.");
  return batch;
}

export async function activateReadySaasRenewalImportRowsAction(
  _formData: FormData
): Promise<SaasRenewalImportActivationResult> {
  void _formData;
  throw new Error("Direct SaaS import activation is disabled. Upload imports into a persisted review batch and activate reviewed rows.");
}

export async function activateReadySaasRenewalImportRowsFormAction(formData: FormData) {
  await activateReadySaasRenewalImportRowsAction(formData);
}

export async function correctSaasRenewalImportRowAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importRowCorrectionSchema.parse({
    rowId: String(formData.get("row_id") ?? ""),
    vendorName: correctionText(formData, "vendor_name"),
    productName: correctionText(formData, "product_name"),
    renewalDate: correctionText(formData, "renewal_date"),
    noticeDeadlineDate: correctionText(formData, "notice_deadline_date"),
    noticePeriod: correctionText(formData, "notice_period"),
    contractValueAmount: correctionText(formData, "contract_value_amount"),
    contractValueCurrency: correctionText(formData, "contract_value_currency"),
    ownerEmail: correctionText(formData, "owner_email"),
    departmentCategory: correctionText(formData, "department_category"),
    sourceNotes: correctionText(formData, "source_notes"),
    reviewNotes: correctionText(formData, "review_notes")
  });
  const existing = await getScopedSaasImportRow(payload.rowId, context.organizationId);
  const originalRow = rawImportRowFromJson(existing.original_row_json);
  const rawRow = correctedRawRow(currentImportRowFromReviewRow(existing), payload);
  const result = await reassessSingleImportRow({
    context,
    rawRow,
    rowNumber: existing.row_number,
    acceptedWeakEvidence: existing.weak_evidence_accepted,
    duplicateConfirmed: existing.duplicate_confirmed
  });
  const toStatus = reviewedImportStatus(result);

  await updateStoredImportRow({
    rowId: existing.id,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    originalRow,
    rawRow,
    result,
    acceptedWeakEvidence: existing.weak_evidence_accepted,
    duplicateConfirmed: existing.duplicate_confirmed,
    reviewNotes: payload.reviewNotes,
    statusOverride: toStatus
  });
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: existing.batch_id,
    importRowId: existing.id,
    rowNumber: existing.row_number,
    issueCodes: importIssueCodes(result),
    action: "saas.import_row_corrected",
    entityType: "saas_renewal_import_row",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus
  });
  await refreshSaasRenewalImportBatchSummary(existing.batch_id, context.organizationId);
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function acceptSaasRenewalImportWeakEvidenceAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importRowIdSchema.parse({
    rowId: String(formData.get("row_id") ?? ""),
    reviewNotes: correctionText(formData, "review_notes")
  });
  const existing = await getScopedSaasImportRow(payload.rowId, context.organizationId);
  const originalRow = rawImportRowFromJson(existing.original_row_json);
  const rawRow = currentImportRowFromReviewRow(existing);
  const result = await reassessSingleImportRow({
    context,
    rawRow,
    rowNumber: existing.row_number,
    acceptedWeakEvidence: true,
    duplicateConfirmed: existing.duplicate_confirmed
  });
  const toStatus = reviewedImportStatus(result);

  await updateStoredImportRow({
    rowId: existing.id,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    originalRow,
    rawRow,
    result,
    acceptedWeakEvidence: true,
    duplicateConfirmed: existing.duplicate_confirmed,
    reviewNotes: payload.reviewNotes,
    statusOverride: toStatus
  });
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: existing.batch_id,
    importRowId: existing.id,
    rowNumber: existing.row_number,
    issueCodes: importIssueCodes(result),
    action: "saas.import_row_weak_evidence_accepted",
    entityType: "saas_renewal_import_row",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus
  });
  await refreshSaasRenewalImportBatchSummary(existing.batch_id, context.organizationId);
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function confirmSaasRenewalImportDuplicateAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importRowIdSchema.parse({
    rowId: String(formData.get("row_id") ?? ""),
    reviewNotes: correctionText(formData, "review_notes")
  });
  const existing = await getScopedSaasImportRow(payload.rowId, context.organizationId);
  const originalRow = rawImportRowFromJson(existing.original_row_json);
  const rawRow = currentImportRowFromReviewRow(existing);
  const result = await reassessSingleImportRow({
    context,
    rawRow,
    rowNumber: existing.row_number,
    acceptedWeakEvidence: existing.weak_evidence_accepted,
    duplicateConfirmed: true
  });
  const toStatus = reviewedImportStatus(result);

  await updateStoredImportRow({
    rowId: existing.id,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    originalRow,
    rawRow,
    result,
    acceptedWeakEvidence: existing.weak_evidence_accepted,
    duplicateConfirmed: true,
    reviewNotes: payload.reviewNotes,
    statusOverride: toStatus
  });
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: existing.batch_id,
    importRowId: existing.id,
    rowNumber: existing.row_number,
    issueCodes: importIssueCodes(result),
    action: "saas.import_row_duplicate_confirmed",
    entityType: "saas_renewal_import_row",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus
  });
  await refreshSaasRenewalImportBatchSummary(existing.batch_id, context.organizationId);
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function dismissSaasRenewalImportRowAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importRowIdSchema.parse({
    rowId: String(formData.get("row_id") ?? ""),
    reviewNotes: correctionText(formData, "review_notes")
  });
  const existing = await getScopedSaasImportRow(payload.rowId, context.organizationId);
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("saas_renewal_import_rows")
    .update({
      status: "dismissed",
      review_note: payload.reviewNotes,
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: context.user.id,
      dismissed_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: existing.batch_id,
    importRowId: existing.id,
    rowNumber: existing.row_number,
    issueCodes: importRowIssueCodes(existing),
    action: "saas.import_row_dismissed",
    entityType: "saas_renewal_import_row",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus: "dismissed"
  });
  await refreshSaasRenewalImportBatchSummary(existing.batch_id, context.organizationId);
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export const rejectSaasRenewalImportRowAction = dismissSaasRenewalImportRowAction;

export async function activateSaasRenewalImportRowAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importRowIdSchema.parse({
    rowId: String(formData.get("row_id") ?? ""),
    reviewNotes: correctionText(formData, "review_notes")
  });
  const existing = await getScopedSaasImportRow(payload.rowId, context.organizationId);
  await activatePersistedSaasRenewalImportRow({ context, existing, reviewNotes: payload.reviewNotes });
  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath("/dashboard");
}

export async function activateValidSaasRenewalImportBatchRowsAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);
  const payload = importBatchIdSchema.parse({
    batchId: String(formData.get("batch_id") ?? "")
  });
  const rows = await listScopedSaasImportRows(payload.batchId, context.organizationId);
  let activatedCount = 0;
  let blockedCount = 0;

  for (const row of rows.filter((candidate) => ["ready", "corrected"].includes(candidate.status))) {
    try {
      await activatePersistedSaasRenewalImportRow({ context, existing: row });
      activatedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("still needs review") && !message.includes("Only ready or corrected")) {
        throw error;
      }
      blockedCount += 1;
    }
  }

  await refreshSaasRenewalImportBatchSummary(payload.batchId, context.organizationId);
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    importBatchId: payload.batchId,
    action: "saas.import_batch_activated",
    entityType: "saas_renewal_import",
    entityId: payload.batchId,
    toStatus: blockedCount > 0 ? "partially_activated" : "activated"
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath("/dashboard");

  return {
    batchId: payload.batchId,
    activatedCount,
    blockedCount
  };
}

export async function activateValidSaasRenewalImportBatchRowsFormAction(formData: FormData) {
  await activateValidSaasRenewalImportBatchRowsAction(formData);
}

export async function listSaasMetadataConflictsForTermAction(saasTermId: string) {
  const context = await requireOrganization();
  const conflictContext = await getScopedSaasTermConflictContext(saasTermId, context.organizationId);
  requireSaasConflictResolutionPermission(context, conflictContext);
  return conflictContext.conflicts;
}

export async function resolveSaasMetadataConflictAction(formData: FormData) {
  const context = await requireOrganization();
  const payload = conflictResolutionSchema.parse({
    saasTermId: String(formData.get("saas_term_id") ?? ""),
    fieldName: String(formData.get("field_name") ?? ""),
    trustedSource: String(formData.get("trusted_source") ?? ""),
    manualOverride: correctionText(formData, "manual_override"),
    resolutionReason: correctionText(formData, "resolution_reason")
  });
  const conflictContext = await getScopedSaasTermConflictContext(payload.saasTermId, context.organizationId);
  requireSaasConflictResolutionPermission(context, conflictContext);
  const conflict = conflictContext.conflicts.find((candidate) => candidate.field === payload.fieldName);
  if (!conflict) throw new Error("SaaS metadata conflict is no longer present for this field.");

  const recommendation = deriveRecommendedSaasTrustedSource(conflict);
  const manualOverride = parseManualOverride(payload.fieldName, payload.manualOverride);
  const resolutionReason = payload.resolutionReason ?? recommendation.reason;
  if (payload.trustedSource === "manual_override" && (!manualOverride && manualOverride !== false && manualOverride !== 0)) {
    throw new Error("Manual override requires a value.");
  }
  if (payload.trustedSource === "manual_override" && !payload.resolutionReason) {
    throw new Error("Manual override requires a resolution reason.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingResolution, error: existingError } = await supabase
    .from("saas_contract_metadata_conflict_resolutions")
    .select("id, trusted_source")
    .eq("organization_id", context.organizationId)
    .eq("saas_term_id", payload.saasTermId)
    .eq("field_name", payload.fieldName)
    .is("reopened_at", null)
    .maybeSingle();

  if (existingError) throw existingError;
  const resolutionPayload = {
    organization_id: context.organizationId,
    contract_id: conflictContext.contract.id,
    software_id: conflictContext.term.software_id,
    saas_term_id: conflictContext.term.id,
    field_name: payload.fieldName,
    contract_value_json: toJson(conflict.contractValue),
    saas_value_json: toJson(conflict.saasValue),
    trusted_source: payload.trustedSource,
    manual_override_json: payload.trustedSource === "manual_override" ? toJson(manualOverride) : null,
    resolution_reason: resolutionReason,
    resolved_by_user_id: context.user.id,
    resolved_at: new Date().toISOString()
  };

  const resolutionResult = existingResolution?.id
    ? await supabase
        .from("saas_contract_metadata_conflict_resolutions")
        .update(resolutionPayload)
        .eq("id", existingResolution.id)
        .eq("organization_id", context.organizationId)
    : await supabase.from("saas_contract_metadata_conflict_resolutions").insert(resolutionPayload);

  if (resolutionResult.error) throw resolutionResult.error;
  await updateConflictRiskFindingLifecycle({
    organizationId: context.organizationId,
    saasTermId: conflictContext.term.id,
    allConflictFields: conflictContext.conflicts.map((item) => item.field)
  });
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: conflictContext.contract.id,
    softwareId: conflictContext.term.software_id,
    saasTermId: conflictContext.term.id,
    fieldName: payload.fieldName,
    trustedSource: payload.trustedSource,
    hasManualOverride: payload.trustedSource === "manual_override",
    action: payload.trustedSource === "manual_override"
      ? "saas.metadata_manual_override_recorded"
      : "saas.metadata_conflict_resolved",
    entityType: "saas_metadata_conflict_resolution",
    entityId: existingResolution?.id ?? conflictContext.term.id,
    toStatus: "resolved"
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath(`/dashboard/contracts/${conflictContext.contract.id}`);
  revalidatePath("/dashboard/contracts");
  revalidatePath("/dashboard");
}

export async function bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction(formData: FormData) {
  const context = await requireOrganization();
  const payload = saasTermIdSchema.parse({
    saasTermId: String(formData.get("saas_term_id") ?? "")
  });
  const conflictContext = await getScopedSaasTermConflictContext(payload.saasTermId, context.organizationId);
  requireSaasConflictResolutionPermission(context, conflictContext);

  for (const conflict of conflictContext.conflicts) {
    const form = new FormData();
    form.set("saas_term_id", conflictContext.term.id);
    form.set("field_name", conflict.field);
    form.set("trusted_source", conflict.recommendedTrustedSource);
    form.set("resolution_reason", conflict.recommendationReason);
    await resolveSaasMetadataConflictAction(form);
  }

  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: conflictContext.contract.id,
    softwareId: conflictContext.term.software_id,
    saasTermId: conflictContext.term.id,
    action: "saas.metadata_conflict_bulk_resolved",
    entityType: "saas_metadata_conflict_resolution",
    entityId: conflictContext.term.id,
    toStatus: "resolved"
  });
}

export async function reopenSaasMetadataConflictResolutionAction(formData: FormData) {
  const context = await requireOrganization();
  const payload = conflictReopenSchema.parse({
    resolutionId: String(formData.get("resolution_id") ?? ""),
    reason: correctionText(formData, "reason")
  });
  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("saas_contract_metadata_conflict_resolutions")
    .select("*")
    .eq("id", payload.resolutionId)
    .eq("organization_id", context.organizationId)
    .is("reopened_at", null)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("SaaS metadata conflict resolution not found for active organization.");
  const conflictContext = await getScopedSaasTermConflictContext(String(existing.saas_term_id), context.organizationId);
  requireSaasConflictResolutionPermission(context, conflictContext);

  const { error } = await supabase
    .from("saas_contract_metadata_conflict_resolutions")
    .update({
      reopened_at: new Date().toISOString(),
      reopened_by_user_id: context.user.id,
      resolution_reason: payload.reason ?? existing.resolution_reason
    })
    .eq("id", existing.id)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  await updateConflictRiskFindingLifecycle({
    organizationId: context.organizationId,
    saasTermId: String(existing.saas_term_id),
    allConflictFields: conflictContext.conflicts.map((item) => item.field),
    reopen: true
  });
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: String(existing.contract_id),
    softwareId: String(existing.software_id),
    saasTermId: String(existing.saas_term_id),
    fieldName: existing.field_name as SaasConflictField,
    trustedSource: existing.trusted_source as SaasTrustedSource,
    hasManualOverride: existing.trusted_source === "manual_override",
    action: "saas.metadata_conflict_reopened",
    entityType: "saas_metadata_conflict_resolution",
    entityId: existing.id,
    fromStatus: "resolved",
    toStatus: "open"
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath(`/dashboard/contracts/${existing.contract_id}`);
  revalidatePath("/dashboard/contracts");
  revalidatePath("/dashboard");
}

export async function createSaasSoftwareAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = softwareSchema.parse({
    name: String(formData.get("name") ?? ""),
    vendorName: optionalText(formData.get("vendor_name")),
    category: optionalText(formData.get("category")),
    ownerUserId: optionalText(formData.get("owner_user_id"))
  });

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("saas_software_inventory").insert({
    organization_id: context.organizationId,
    name: payload.name,
    vendor_name: payload.vendorName,
    category: payload.category,
    owner_user_id: payload.ownerUserId,
    created_by: context.user.id
  });

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "saas.software_created",
    entityType: "saas_software"
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function createSaasContractTermAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = contractTermSchema.parse({
    softwareId: String(formData.get("software_id") ?? ""),
    contractId: optionalText(formData.get("contract_id")),
    renewalDate: optionalText(formData.get("renewal_date")),
    expirationDate: optionalText(formData.get("expiration_date")),
    noticeDeadlineDate: optionalText(formData.get("notice_deadline_date")),
    noticePeriodValue: optionalNumber(formData.get("notice_period_value")),
    noticePeriodUnit: optionalText(formData.get("notice_period_unit")) as NoticePeriodUnit | null,
    autoRenewal: formData.get("auto_renewal") === "on",
    termSummary: optionalText(formData.get("term_summary")),
    contractValueAmount: optionalNumber(formData.get("contract_value_amount")),
    contractValueCurrency: optionalText(formData.get("contract_value_currency"))
  });

  const scopedSoftware = await requireScopedSaasSoftware(payload.softwareId, context.organizationId);
  const linkedContractMetadata = await getScopedContractMetadataForSaasRisk(payload.contractId, context.organizationId);

  const noticeDeadline = calculateNoticeDeadline({
    renewalDate: payload.renewalDate,
    expirationDate: payload.expirationDate,
    noticeDeadlineDate: payload.noticeDeadlineDate,
    noticePeriodValue: payload.noticePeriodValue,
    noticePeriodUnit: payload.noticePeriodUnit,
    autoRenewal: payload.autoRenewal
  });
  const findings = calculateSaasContractRiskFindings({
    renewalDate: payload.renewalDate,
    expirationDate: payload.expirationDate,
    noticeDeadlineDate: payload.noticeDeadlineDate,
    noticePeriodValue: payload.noticePeriodValue,
    noticePeriodUnit: payload.noticePeriodUnit,
    autoRenewal: payload.autoRenewal,
    ownerUserId: scopedSoftware.owner_user_id,
    contractValueAmount: payload.contractValueAmount,
    contractValueCurrency: payload.contractValueCurrency,
    evidenceConfidence: MANUAL_SAAS_TERM_EVIDENCE_CONFIDENCE,
    contractMetadata: linkedContractMetadata
  });
  const supabase = createServerSupabaseClient();
  const { data: term, error: termError } = await supabase
    .from("saas_contract_terms")
    .insert({
      organization_id: context.organizationId,
      software_id: payload.softwareId,
      contract_id: payload.contractId,
      renewal_date: payload.renewalDate,
      expiration_date: payload.expirationDate,
      auto_renewal: payload.autoRenewal,
      notice_period_value: payload.noticePeriodValue,
      notice_period_unit: payload.noticePeriodUnit,
      notice_deadline_date: noticeDeadline,
      term_summary: payload.termSummary,
      contract_value_amount: payload.contractValueAmount,
      contract_value_currency: payload.contractValueCurrency,
      created_by: context.user.id
    })
    .select("id")
    .single();

  if (termError) throw termError;
  if (!term?.id) throw new Error("SaaS contract term was not created.");

  let optOutWindowId: string | null = null;
  if (noticeDeadline) {
    const urgency = getOptOutUrgency(noticeDeadline);
    const workflowStatus = deriveSaasOptOutWorkflowStatus({
      noticeDeadline,
      ownerUserId: scopedSoftware.owner_user_id,
      openFindingTypes: findings.map((finding) => finding.findingType),
      today: undefined
    });
    const { data: optOutWindow, error: windowError } = await supabase
      .from("saas_opt_out_windows")
      .insert({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_deadline: noticeDeadline,
        window_closes_on: noticeDeadline,
        status: urgency === "expired" ? "expired" : "open",
        source: payload.noticeDeadlineDate ? "explicit" : "calculated",
        owner_user_id: scopedSoftware.owner_user_id,
        workflow_status: workflowStatus
      })
      .select("id")
      .single();

    if (windowError) throw windowError;
    optOutWindowId = optOutWindow?.id ?? null;
    await auditSaasRenewalDefense({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      contractId: payload.contractId,
      softwareId: payload.softwareId,
      saasTermId: term.id,
      optOutWindowId,
      action: "saas.opt_out_window_created",
      entityType: "saas_opt_out_window",
      entityId: optOutWindowId,
      toStatus: workflowStatus,
      deadlineWindow: getOptOutDeadlineWindow(noticeDeadline),
      amount: payload.contractValueAmount,
      currency: payload.contractValueCurrency
    });
  }

  if (findings.length > 0) {
    const { data: createdFindings, error: findingsError } = await supabase.from("saas_contract_risk_findings").insert(
      findings.map((finding) => ({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_window_id: optOutWindowId,
        finding_type: finding.findingType,
        severity: finding.severity,
        evidence_json: finding.evidence as Json
      }))
    ).select("id, finding_type, severity");

    if (findingsError) throw findingsError;
    for (const finding of createdFindings ?? []) {
      await auditSaasRenewalDefense({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        contractId: payload.contractId,
        softwareId: payload.softwareId,
        saasTermId: term.id,
        optOutWindowId,
        findingId: finding.id,
        action: "saas.risk_finding_created",
        entityType: "saas_contract_risk_finding",
        entityId: finding.id,
        toStatus: "open",
        deadlineWindow: noticeDeadline ? getOptOutDeadlineWindow(noticeDeadline) : "missing",
        amount: payload.contractValueAmount,
        currency: payload.contractValueCurrency
      });
    }
  }

  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: payload.contractId,
    softwareId: payload.softwareId,
    saasTermId: term.id,
    action: payload.contractId ? "saas.term_linked_to_contract" : "saas.term_created",
    entityType: "saas_contract_term",
    entityId: term.id,
    deadlineWindow: noticeDeadline ? getOptOutDeadlineWindow(noticeDeadline) : "missing",
    amount: payload.contractValueAmount,
    currency: payload.contractValueCurrency
  });

  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function updateSaasOptOutWindowWorkflowAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = optOutWorkflowSchema.parse({
    optOutWindowId: String(formData.get("opt_out_window_id") ?? ""),
    ownerUserId: optionalText(formData.get("owner_user_id")),
    nextAction: optionalText(formData.get("next_action")),
    nextActionDueAt: optionalText(formData.get("next_action_due_at")),
    workflowStatus: optionalText(formData.get("workflow_status")) as SaasOptOutWorkflowStatus | null
  });

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("saas_opt_out_windows")
    .select("id, organization_id, software_id, contract_term_id, workflow_status, opt_out_deadline, owner_user_id, next_action, next_action_due_at, resolved_at, accepted_risk_at, ignored_at")
    .eq("id", payload.optOutWindowId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("SaaS opt-out window not found for active organization.");

  const toStatus = payload.workflowStatus ?? existing.workflow_status;
  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    owner_user_id: payload.ownerUserId,
    next_action: payload.nextAction,
    next_action_due_at: payload.nextActionDueAt,
    workflow_status: toStatus
  };
  if (toStatus === "resolved" && existing.workflow_status !== "resolved" && !existing.resolved_at) {
    updatePayload.resolved_at = now;
  }
  if (toStatus === "accepted_risk" && existing.workflow_status !== "accepted_risk" && !existing.accepted_risk_at) {
    updatePayload.accepted_risk_at = now;
  }
  if (toStatus === "ignored" && existing.workflow_status !== "ignored" && !existing.ignored_at) {
    updatePayload.ignored_at = now;
  }

  const { error } = await supabase
    .from("saas_opt_out_windows")
    .update(updatePayload)
    .eq("id", payload.optOutWindowId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  const ownerChanged = payload.ownerUserId !== existing.owner_user_id;
  const nextActionChanged = payload.nextAction !== existing.next_action || payload.nextActionDueAt !== existing.next_action_due_at;
  const statusChanged = toStatus !== existing.workflow_status;
  const auditAction = statusChanged
    ? "saas.workflow_status_updated"
    : ownerChanged
      ? "saas.owner_assigned"
      : nextActionChanged
        ? "saas.next_action_updated"
        : "saas.workflow_reviewed";
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    softwareId: existing.software_id,
    saasTermId: existing.contract_term_id,
    optOutWindowId: existing.id,
    action: auditAction,
    entityType: "saas_opt_out_window",
    entityId: existing.id,
    fromStatus: existing.workflow_status,
    toStatus,
    deadlineWindow: getOptOutDeadlineWindow(existing.opt_out_deadline)
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function updateSaasRiskFindingStatusAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = findingStatusSchema.parse({
    findingId: String(formData.get("finding_id") ?? ""),
    status: String(formData.get("status") ?? "")
  });

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("saas_contract_risk_findings")
    .select("id, organization_id, software_id, contract_term_id, opt_out_window_id, status")
    .eq("id", payload.findingId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("SaaS risk finding not found for active organization.");

  const { error } = await supabase
    .from("saas_contract_risk_findings")
    .update({ status: payload.status })
    .eq("id", payload.findingId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    softwareId: existing.software_id,
    saasTermId: existing.contract_term_id,
    optOutWindowId: existing.opt_out_window_id,
    findingId: existing.id,
    action: payload.status === "accepted_risk" ? "saas.risk_accepted" : "saas.risk_finding_resolved",
    entityType: "saas_contract_risk_finding",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus: payload.status
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}
