"use server";

// Transitional implementation container.
// Public contract actions are re-exported through focused modules in this folder.
// Still here because these paths share cross-domain helpers for upload/import,
// extraction, counterparty normalization, evidence rows, reminder regeneration,
// billing redirects, and template defaulting. Move them only with focused tests.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assertCanUseShippedAction,
  requireOrganization,
  requireShippedRuntimeAction
} from "@/lib/auth";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { extractTextFromFile } from "@/lib/extractors/file-text";
import { runFullDocumentContractExtraction } from "@/lib/contract-intelligence/python-extraction-runner";
import { mapExtractionEvidenceToLegacyMetadata } from "@/lib/contract-intelligence/legacy-metadata-adapter";
import { resolveDocumentTextForExtraction } from "@/lib/ocr/ingestion";
import { enqueueOcrJob } from "@/lib/ocr/jobs";
import { generateReminderRecommendations } from "@/lib/contracts/reminders";
import { selectInternalRenewalReminderRecipients } from "@/lib/contracts/internal-renewal-reminders";
import {
  deriveCycleStatusFromDecision,
  getPhase1ReviewDirtyFlags,
  getPhase1ReviewMode,
  hasPreviouslyVerifiedP0Changes,
  PHASE1_P0_FIELDS,
  requiresReviewReason
} from "@/lib/contracts/phase1-pilot";
import {
  manualContractSchema,
  recipientListSchema,
  reviewContractSchema,
  uploadContractSchema,
  type ExtractedContractFields
} from "@/lib/validation/contract";
import { reminderSchema } from "@/lib/validation/reminder";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { recordSampleToFirstRealContractStartedIfNeeded } from "@/lib/actions/contracts/sample";
import { getAppConfig } from "@/lib/config";
import { splitEmails, uniqueEmails } from "@/lib/utils";
import {
  getScopedContractMetadataId,
  requireScopedContract,
  getOrganizationContractCount,
  getOrganizationMembers,
  getTemplates
} from "@/lib/contracts/kernel-queries";
import {
  counterpartySchema,
  templateSchema
} from "@/lib/validation/contract";
import {
  applyTemplateNoticeDeadline
} from "@/lib/contracts/templates";
import {
  assessImportRows,
  type ImportRowResult,
  parseImportFile
} from "@/lib/contracts/import";
import {
  buildCounterpartyIdentity,
  resolveCounterpartyAlias,
  suggestDuplicateCounterparties
} from "@/lib/contracts/counterparty-normalization";
import {
  getReminderActivationState,
  type ReminderActivationState
} from "@/lib/contracts/shipped-reminder-policy";
import {
  deriveFinancialDataTrustStatus,
  normalizeFinancialCurrencyCode,
  normalizeFinancialTrustStatus,
  normalizeFinancialValuePeriod,
  type FinancialDataTrustStatus
} from "@/lib/intelligence/financial/model";
import {
  canEnterReminderGenerationState,
  initialManualContractStatus,
  nextReviewedContractStatus,
  transitionContractStatus
} from "@/lib/contracts/lifecycle";
import { buildEvidenceRows } from "@/lib/contracts/evidence";
import { recordProcessingError } from "@/lib/contracts/processing-errors";
import {
  sanitizeInternalError,
  sanitizeSensitiveProcessingError
} from "@/lib/errors";
import {
  applyManualPdfRenewalCorrections,
  preparePdfRenewalExtractionForReview
} from "@/lib/contracts/pdf-renewal-control";
import {
  contractTitleFromPdfFileName,
  hasContractPdfSignature,
  sanitizeContractPdfFileName,
  validateContractPdf,
  type PdfContractUploadActionResult
} from "@/lib/contracts/pdf-upload";
import { REMINDER_RETRY_POLICY } from "@/lib/constants";
import {
  type BillingSnapshot,
  CommercialAccessError,
  createCommercialDenialAuditLog,
  enforceFeatureAccess,
  getContractTrackingLimitResult,
  getAllowedReminderRecipients,
  getBillingSnapshot,
  getCommercialRedirectCode
} from "@/lib/billing/entitlements";
import { enforceDesignPartnerBetaMutation } from "@/lib/billing/design-partner-beta";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";

function fallbackMetadata(
  contractTitle: FormDataEntryValue | null,
  parserError: string | null
): ExtractedContractFields & { needs_review: boolean } {
  return {
    contract_title: typeof contractTitle === "string" ? contractTitle : null,
    counterparty_name: null,
    contract_type: null,
    effective_date: null,
    renewal_date: null,
    expiration_date: null,
    auto_renewal: null,
    renewal_term: null,
    notice_period_value: null,
    notice_period_unit: null,
    notice_deadline_date: null,
    termination_window: null,
    governing_law: null,
    payment_terms: null,
    contract_value_amount: null,
    contract_value_currency: null,
    contract_value_period: null,
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: "low",
    extracted_clauses: [],
    field_confidence: {},
    field_source_snippets: {},
    reminder_recommendations: ["Review manually because parsing failed."],
    reviewer_notes: parserError,
    needs_review: true
  };
}

function serializeImportRowReport(rowResults: ImportRowResult[]) {
  return rowResults.map((result) => ({
    row: result.row,
    status: result.status,
    field: result.field ?? null,
    contract_title: result.contract_title,
    counterparty_name: result.counterparty_name,
    owner_email: result.owner_email,
    error: result.errors.join(" | "),
    warnings: result.warnings
  }));
}

type PersistedReviewFlagFields = {
  has_conflict: boolean;
  has_derived_date: boolean;
  has_weak_evidence: boolean;
  is_ocr_assisted: boolean;
  is_manual_without_evidence: boolean;
  changes_previously_verified_p0: boolean;
  accepted_unverified_risk_requested: boolean;
};

type PreviouslyStoredReviewMetadata = {
  needs_review?: boolean | null;
  notice_deadline_date?: string | null;
  renewal_date?: string | null;
  expiration_date?: string | null;
  termination_window?: string | null;
  auto_renewal?: boolean | null;
};

function parseBooleanFormValue(value: FormDataEntryValue | null) {
  return value === "true";
}

function parseNullableStringFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseNullableNumberFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveFinancialMetadataFields(input: {
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  contractValuePeriod?: string | null;
  priceChangeTrigger?: string | null;
  paymentTrigger?: string | null;
  financialDataTrustStatus?: FinancialDataTrustStatus | null;
  needsReview?: boolean | null;
}) {
  const contractValueCurrency = normalizeFinancialCurrencyCode(input.contractValueCurrency);
  const explicitTrustStatus = normalizeFinancialTrustStatus(input.financialDataTrustStatus);

  return {
    contract_value_amount: input.contractValueAmount ?? null,
    contract_value_currency: contractValueCurrency,
    contract_value_period: normalizeFinancialValuePeriod(input.contractValuePeriod),
    price_change_trigger: parseNullableStringFormValue(input.priceChangeTrigger ?? null),
    payment_trigger: parseNullableStringFormValue(input.paymentTrigger ?? null),
    financial_data_trust_status: deriveFinancialDataTrustStatus({
      explicitTrustStatus,
      needsReview: input.needsReview ?? null,
      contractValueAmount: input.contractValueAmount ?? null,
      contractValueCurrency
    })
  };
}

function hasAnyP0Value(metadata: {
  notice_deadline_date?: string | null;
  renewal_date?: string | null;
  expiration_date?: string | null;
  termination_window?: string | null;
  auto_renewal?: boolean | null;
}) {
  return PHASE1_P0_FIELDS.some((field) => {
    const value = metadata[field];
    return field === "auto_renewal" ? value !== null && value !== undefined : Boolean(value);
  });
}

function hasAnyP0EvidenceSnippets(fieldSourceSnippets: Record<string, string>) {
  return PHASE1_P0_FIELDS.some((field) => Boolean(fieldSourceSnippets[field]?.trim()));
}

function resolvePhase1ReviewAssessment(input: {
  metadata: {
    contract_title?: string | null;
    counterparty_name?: string | null;
    contract_type?: string | null;
    effective_date?: string | null;
    needs_review: boolean;
    review_mode?: string | null;
    review_reason?: string | null;
    extracted_clauses?: string[];
    field_confidence?: Record<string, number>;
    field_source_snippets: Record<string, string>;
    reminder_recommendations?: string[];
    reviewer_notes?: string | null;
    contract_value_amount?: number | null;
    contract_value_currency?: string | null;
    contract_value_period?: string | null;
    price_change_trigger?: string | null;
    payment_trigger?: string | null;
    financial_data_trust_status?: FinancialDataTrustStatus | null;
    renewal_term?: string | null;
    notice_period_value?: number | null;
    notice_period_unit?: string | null;
    governing_law?: string | null;
    payment_terms?: string | null;
    notice_deadline_date?: string | null;
    renewal_date?: string | null;
    expiration_date?: string | null;
    termination_window?: string | null;
    auto_renewal?: boolean | null;
    has_conflict?: boolean;
    has_derived_date?: boolean;
    has_weak_evidence?: boolean;
    is_ocr_assisted?: boolean;
    is_manual_without_evidence?: boolean;
    changes_previously_verified_p0?: boolean;
    accepted_unverified_risk_requested?: boolean;
  };
  sourceType: "upload" | "manual" | "review";
  previousMetadata?: PreviouslyStoredReviewMetadata | null;
}) {
  const isManualWithoutEvidence =
    input.metadata.is_manual_without_evidence === true ||
    (input.sourceType === "manual" &&
      hasAnyP0Value(input.metadata) &&
      !hasAnyP0EvidenceSnippets(input.metadata.field_source_snippets));
  const changesPreviouslyVerifiedP0 =
    input.metadata.changes_previously_verified_p0 === true ||
    hasPreviouslyVerifiedP0Changes(input.previousMetadata, input.metadata);
  const dirtyFlags = getPhase1ReviewDirtyFlags({
    ...input.metadata,
    is_manual_without_evidence: isManualWithoutEvidence,
    changes_previously_verified_p0: changesPreviouslyVerifiedP0
  });
  const reviewMode = getPhase1ReviewMode({
    ...input.metadata,
    ...dirtyFlags
  });
  const requestedReviewMode = input.metadata.review_mode ?? reviewMode;

  if (requestedReviewMode === "fast_review" && reviewMode !== "fast_review") {
    throw new Error("Fast Review is only allowed when no dirty review flags are present.");
  }

  if (
    !requiresReviewReason({
      reviewMode,
      needsReview: input.metadata.needs_review,
      reviewReason: input.metadata.review_reason ?? null
    })
  ) {
    throw new Error("Exception review requires a typed reason so reminder trust changes are auditable.");
  }

  return {
    reviewMode,
    dirtyFlags: dirtyFlags satisfies PersistedReviewFlagFields
  };
}

function redirectWithCommercialCode(
  path: string,
  feature: Parameters<typeof getCommercialRedirectCode>[0],
  reason?: Parameters<typeof getCommercialRedirectCode>[1]
) {
  redirect(`${path}?commercial=${getCommercialRedirectCode(feature, reason)}`);
}

async function enforceReminderRecipientsOrRedirect(input: {
  billingSnapshot: Awaited<ReturnType<typeof getBillingSnapshot>>;
  recipients: string[];
  organizationId: string;
  actorUserId: string;
  featurePath: string;
  context: Record<string, unknown>;
}) {
  try {
    return getAllowedReminderRecipients(input.billingSnapshot, input.recipients, { strict: true });
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      await createCommercialDenialAuditLog({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        feature: error.feature,
        billingSnapshot: input.billingSnapshot,
        context: input.context
      });
      redirectWithCommercialCode(input.featurePath, error.feature, error.access.reason);
    }
    throw error;
  }
}

async function enforceContractTrackingCapacityOrRedirect(input: {
  organizationId: string;
  actorUserId: string;
  billingSnapshot: BillingSnapshot;
  featurePath: string;
  context: Record<string, unknown>;
  additionalContracts?: number;
  redirectOnDenied?: boolean;
}) {
  const currentCount = await getOrganizationContractCount(input.organizationId);
  const access = getContractTrackingLimitResult(
    input.billingSnapshot,
    currentCount + ((input.additionalContracts ?? 1) - 1)
  );

  if (access.allowed) {
    return { currentCount, access };
  }

  await createCommercialDenialAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    feature: "manual_contracts",
    billingSnapshot: input.billingSnapshot,
    context: {
      ...input.context,
      current_contract_count: currentCount,
      contract_limit: access.limit
    }
  });

  if (input.redirectOnDenied !== false) {
    redirect(`${input.featurePath}?commercial=billing.contract_tracking_limit_reached`);
  }

  throw new ContractTrackingCapacityError();
}

class ContractTrackingCapacityError extends Error {
  constructor() {
    super("Contract tracking capacity has been reached.");
    this.name = "ContractTrackingCapacityError";
  }
}

async function findOrCreateCounterparty(params: {
  organizationId: string;
  name: string | null;
}) {
  if (!params.name) return null;
  const identity = buildCounterpartyIdentity(params.name);
  if (!identity.rawCounterpartyName || !identity.normalizedCounterpartyName) return null;
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  const [{ data: existingCounterparties, error: counterpartyError }, { data: aliases, error: aliasError }] =
    await Promise.all([
      admin
        .from("counterparties")
        .select("id, raw_counterparty_name, normalized_counterparty_name, merged_into_counterparty_id")
        .eq("organization_id", params.organizationId),
      admin
        .from("counterparty_aliases")
        .select("counterparty_id, alias_name, normalized_alias_name")
        .eq("organization_id", params.organizationId)
    ]);

  if (counterpartyError) throw counterpartyError;
  if (aliasError) throw aliasError;

  const matchedId = resolveCounterpartyAlias(
    (existingCounterparties ?? []) as Array<{
      id: string;
      raw_counterparty_name: string;
      normalized_counterparty_name: string;
      merged_into_counterparty_id: string | null;
    }>,
    (aliases ?? []) as Array<{
      counterparty_id: string;
      alias_name: string;
      normalized_alias_name: string;
    }>,
    identity.rawCounterpartyName
  );

  if (matchedId) return matchedId;

  const { data, error } = await admin
    .from("counterparties")
    .insert({
      organization_id: params.organizationId,
      name: identity.rawCounterpartyName,
      raw_counterparty_name: identity.rawCounterpartyName,
      normalized_counterparty_name: identity.normalizedCounterpartyName
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

function dedupeCounterpartyAliases(
  aliases: Array<{ alias_name: string; normalized_alias_name: string }>
) {
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    if (!alias.normalized_alias_name || seen.has(alias.normalized_alias_name)) {
      return false;
    }
    seen.add(alias.normalized_alias_name);
    return true;
  });
}

async function resolveTemplateNoticeDeadline(params: {
  organizationId: string;
  templateKey: string | null;
  expirationDate: string | null;
}) {
  if (!params.templateKey || !params.expirationDate) return null;
  const templates = await getTemplates(params.organizationId);
  const template = templates.find(
    (item: { template_key: string }) => item.template_key === params.templateKey
  );
  if (!template) return null;

  return applyTemplateNoticeDeadline(
    params.expirationDate,
    (template.default_notice_period_value as number | null) ?? null,
    (template.default_notice_period_unit as "days" | "weeks" | "months" | null) ?? null
  );
}

async function getDefaultRecipients(userId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const [{ data: userRow }, { data: org }, members] = await Promise.all([
    supabase.from("users").select("notification_email").eq("id", userId).maybeSingle(),
    supabase.from("organizations").select("billing_email").eq("id", organizationId).single(),
    getOrganizationMembers(organizationId)
  ]);

  const emails = uniqueEmails([
    userRow?.notification_email ?? "",
    org?.billing_email ?? "",
    ...(members ?? []).map((member) => member.user?.notification_email ?? "")
  ]);

  return emails;
}

async function insertReminders(params: {
  contractId: string;
  organizationId: string;
  reminders: Array<{
    reminder_type:
      | "notice_deadline"
      | "renewal"
      | "expiration"
      | "renewal_date"
      | "expiration_date"
      | "decision_request"
      | "acknowledgment_request"
      | "internal_review_needed"
      | "late_activation_action_required"
      | "missed_notice_deadline"
      | "custom";
    remind_at: string;
    recipient_email: string;
    recipient_emails: string[];
    delivery_key?: string | null;
    escalation_level?: number;
    rule_name?: null;
    source: "system" | "manual";
  }>;
}) {
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  if (params.reminders.length === 0) return;

  await admin.from("reminders").insert(
    params.reminders.map((reminder) => ({
      contract_id: params.contractId,
      organization_id: params.organizationId,
      ...reminder,
      next_retry_at: reminder.remind_at,
      max_attempts: REMINDER_RETRY_POLICY.maxAttempts
    }))
  );
}

async function replaceEvidenceRows(params: {
  metadataId: string;
  fieldSourceSnippets: Record<string, string>;
  fieldConfidence: Record<string, number>;
  source?: string;
}) {
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  await admin
    .from("extracted_field_evidence")
    .delete()
    .eq("contract_metadata_id", params.metadataId);

  const rows = buildEvidenceRows(
    params.fieldSourceSnippets,
    params.fieldConfidence,
    params.source ?? "extraction"
  );
  if (rows.length === 0) return;

  await admin.from("extracted_field_evidence").insert(
    rows.map((row) => ({
      contract_metadata_id: params.metadataId,
      field_name: row.field_name,
      snippet: row.snippet,
      confidence: row.confidence
    }))
  );
}

async function regenerateSystemReminders(params: {
  contractId: string;
  organizationId: string;
  actorUserId: string;
  billingSnapshot: BillingSnapshot;
  metadata: ExtractedContractFields & {
    needs_review?: boolean | null;
    owner_user_id?: string | null;
  };
  templateKey?: string | null;
  fallbackRecipients: string[];
}) {
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  const { data: existingReminders, error } = await admin
    .from("reminders")
    .select("id, source, recipient_emails, recipient_email, status, delivery_key")
    .eq("contract_id", params.contractId)
    .order("created_at");

  if (error) throw error;

  const members = await getOrganizationMembers(params.organizationId);
  const mergedRecipients = selectInternalRenewalReminderRecipients({
    ownerUserId: params.metadata.owner_user_id,
    members,
    fallbackRecipients: params.fallbackRecipients
  });
  const activeSystemReminders = ((existingReminders ?? []) as Array<{
    id: string;
    source: string;
    status: string;
    delivery_key?: string | null;
  }>).filter(
    (reminder) =>
      reminder.source === "system" &&
      ["pending", "processing", "retry_pending"].includes(reminder.status)
  );
  const existingDeliveryKeys = new Set(
    ((existingReminders ?? []) as Array<{
      source: string;
      status: string;
      delivery_key?: string | null;
    }>)
      .filter(
        (reminder) =>
          reminder.source === "system" &&
          reminder.delivery_key &&
          !["superseded", "cancelled", "failed_terminal"].includes(reminder.status)
      )
      .map((reminder) => reminder.delivery_key!)
  );

  if (activeSystemReminders.length > 0) {
    await admin
      .from("reminders")
      .update({
        status: "superseded",
        last_attempt_at: new Date().toISOString(),
        processing_started_at: null,
        processing_token: null
      })
      .in(
        "id",
        activeSystemReminders.map((reminder) => reminder.id)
      )
      .eq("organization_id", params.organizationId);
  }

  const activationState = getReminderActivationState({
    needsReview: params.metadata.needs_review,
    ownerUserId: params.metadata.owner_user_id ?? null,
    noticeDeadlineDate: params.metadata.notice_deadline_date,
    renewalDate: params.metadata.renewal_date,
    expirationDate: params.metadata.expiration_date,
    recipientCount: mergedRecipients.length
  });

  if (mergedRecipients.length === 0) {
    return {
      generatedCount: 0,
      supersededCount: activeSystemReminders.length,
      activationState: "failed" as const
    };
  }

  const recipients = await enforceReminderRecipientsOrRedirect({
    billingSnapshot: params.billingSnapshot,
    recipients: mergedRecipients,
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    featurePath: `/dashboard/contracts/${params.contractId}`,
    context: { contract_id: params.contractId, source: "regenerate_system_reminders" }
  });

  const generated = generateReminderRecommendations(params.metadata, recipients, {
    organizationId: params.organizationId,
    contractId: params.contractId
  })
    .map((reminder) =>
      reminderSchema.parse({
        ...reminder,
        ical_uid: `${params.contractId}-${reminder.reminder_type}-${reminder.remind_at}`
      })
    )
    .filter((reminder) => !reminder.delivery_key || !existingDeliveryKeys.has(reminder.delivery_key));
  if (generated.length === 0) {
    return {
      generatedCount: 0,
      supersededCount: activeSystemReminders.length,
      activationState
    };
  }
  await insertReminders({
    contractId: params.contractId,
    organizationId: params.organizationId,
    reminders: generated
  });

  const generatedTypes = new Set(generated.map((reminder) => reminder.reminder_type));
  const nextActivationState = generatedTypes.has("internal_review_needed")
    ? ("blocked_by_review" as const)
    : activationState === "scheduled"
      ? ("scheduled" as const)
      : activationState;

  return {
    generatedCount: generated.length,
    supersededCount: activeSystemReminders.length,
    activationState: nextActivationState
  };
}

async function createContractFromUpload(
  formData: FormData,
  options: { redirectOnSuccess: boolean }
): Promise<PdfContractUploadActionResult> {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const file = formData.get("file");
  const contractTitle = formData.get("contractTitle");
  const ownerUserId = String(formData.get("owner_user_id") ?? "") || null;
  const department = String(formData.get("department") ?? "") || null;
  const statusTag = String(formData.get("status_tag") ?? "active");
  const manualRecipients = String(formData.get("recipient_emails") ?? "");
  const counterpartyId = String(formData.get("counterparty_id") ?? "") || null;
  const templateKey = String(formData.get("contract_template_key") ?? "") || null;

  if (!(file instanceof File)) {
    throw new Error("A file upload is required.");
  }

  uploadContractSchema.parse({
    contractTitle,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size
  });

  if (ownerUserId) {
    const members = await getOrganizationMembers(organizationId);
    if (!members.some((member) => member.user_id === ownerUserId)) {
      throw new Error("Assigned owner must be a member of the active organization.");
    }
  }

  const billingSnapshot = await getBillingSnapshot(organizationId);
  const trackingCapacity = await enforceContractTrackingCapacityOrRedirect({
    organizationId,
    actorUserId: user.id,
    billingSnapshot,
    featurePath: "/dashboard/contracts/new",
    context: { source: "upload_contract_action" },
    redirectOnDenied: options.redirectOnSuccess
  });
  await enforceDesignPartnerBetaMutation({
    organizationId,
    action: "upload_contract",
    currentContracts: trackingCapacity.currentCount
  });
  const parsedRecipients =
    manualRecipients.trim().length > 0
      ? recipientListSchema.parse(manualRecipients)
      : await getDefaultRecipients(user.id, organizationId);
  let recipients: string[];
  try {
    recipients = getAllowedReminderRecipients(billingSnapshot, parsedRecipients, {
      strict: options.redirectOnSuccess
    });
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      await createCommercialDenialAuditLog({
        organizationId,
        actorUserId: user.id,
        feature: error.feature,
        billingSnapshot,
        context: { source: "upload_contract_action" }
      });
      if (options.redirectOnSuccess) {
        redirectWithCommercialCode("/dashboard/contracts/new", error.feature, error.access.reason);
      }
    }
    throw error;
  }

  const admin = createPrivilegedSupabaseClient("contract_action_legacy");

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .insert({
      organization_id: organizationId,
      created_by: user.id,
      status: "uploaded",
      cycle_status: "open",
      source_type: "upload",
      owner_user_id: ownerUserId,
      department,
      status_tag: statusTag,
      counterparty_id: counterpartyId
    })
    .select("id")
    .single();

  if (contractError) throw contractError;

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop() ?? "bin";
  const storagePath = `${organizationId}/${contract.id}/${randomUUID()}.${extension}`;
  const storageResult = await admin.storage
    .from(getAppConfig().supabase.storageBucket)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false
    });

  if (storageResult.error) {
    await recordProcessingError({
      organizationId,
      contractId: contract.id,
      stage: "upload",
      message: sanitizeInternalError(storageResult.error),
      details: { file_name: file.name, storage_path: storagePath }
    });
    throw storageResult.error;
  }

  const { data: contractFile, error: fileError } = await admin
    .from("contract_files")
    .insert({
      contract_id: contract.id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      extracted_text: null,
      extraction_error: null,
      uploaded_by: user.id
    })
    .select("id")
    .single();

  if (fileError) {
    await recordProcessingError({
      organizationId,
      contractId: contract.id,
      stage: "upload",
      message: sanitizeInternalError(fileError),
      details: { file_name: file.name }
    });
    throw fileError;
  }

  await admin
    .from("contracts")
    .update({ latest_file_id: contractFile.id })
    .eq("id", contract.id)
    .eq("organization_id", organizationId);

  await transitionContractStatus(admin, contract.id, organizationId, "queued_for_text_extraction");
  await transitionContractStatus(admin, contract.id, organizationId, "extracting_text");

  const parsedText = await extractTextFromFile(buffer, file.type);
  const resolvedText = await resolveDocumentTextForExtraction({
    buffer,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    nativeExtraction: parsedText
  });
  await admin
    .from("contract_files")
    .update({
      extracted_text: resolvedText.text,
      extraction_error: resolvedText.error,
      extraction_source: resolvedText.source,
      ocr_provider: resolvedText.ocrProvider,
      ocr_status: resolvedText.ocrStatus,
      ocr_confidence: resolvedText.ocrConfidence,
      ocr_detected_needed: resolvedText.ocrDetectedNeeded
    })
    .eq("id", contractFile.id)
    .eq("contract_id", contract.id);

  if (resolvedText.ocrEstimatedCost !== null) {
    await admin.from("cost_usage_logs").insert({
      organization_id: organizationId,
      cost_category: "ocr",
      quantity: 1,
      unit: "document",
      estimated_cost: resolvedText.ocrEstimatedCost,
      reference_key: contract.id,
      details: {
        provider: resolvedText.ocrProvider,
        source: resolvedText.source
      }
    });
  }

  let metadata: ExtractedContractFields & { needs_review: boolean } = fallbackMetadata(
    contractTitle,
    resolvedText.error
  );
  let pdfRenewalReviewReasons: string[] = [];
  let finalStatus: "needs_review" | "extraction_failed" = "needs_review";

  if (
    resolvedText.ocrDetectedNeeded &&
    resolvedText.ocrStatus &&
    resolvedText.ocrStatus !== "completed" &&
    resolvedText.ocrStatus !== "async_required"
  ) {
    await recordProcessingError({
      organizationId,
      contractId: contract.id,
      contractFileId: contractFile.id,
      stage: "ocr",
      message: resolvedText.error ?? "OCR fallback failed.",
      details: {
        file_name: file.name,
        provider: resolvedText.ocrProvider,
        reason: resolvedText.ocrDecision.reason
      }
    });
  }

  if (resolvedText.ocrStatus === "async_required") {
    await enqueueOcrJob({
      organizationId,
      contractId: contract.id,
      contractFileId: contractFile.id,
      provider: resolvedText.ocrProvider ?? "ocr",
      detectionReason: resolvedText.ocrDecision.reason,
      details: {
        file_name: file.name,
        size_bytes: file.size
      }
    });
    metadata = {
      ...fallbackMetadata(contractTitle, null),
      reviewer_notes:
        "OCR fallback has been queued for this document. Review is still required before any reminder-driving fields can be trusted.",
      needs_review: true
    };
    finalStatus = "needs_review";
    await transitionContractStatus(admin, contract.id, organizationId, "needs_review");
  } else if (!resolvedText.text || resolvedText.error) {
    await transitionContractStatus(admin, contract.id, organizationId, "text_extraction_failed");
    await recordProcessingError({
      organizationId,
      contractId: contract.id,
      contractFileId: contractFile.id,
      stage: "text_extraction",
      message: resolvedText.error ?? "No extractable text was found in the uploaded file.",
      details: {
        file_name: file.name,
        mime_type: file.type,
        extraction_source: resolvedText.source
      }
    });
  } else {
    await transitionContractStatus(admin, contract.id, organizationId, "text_extracted");
    await transitionContractStatus(admin, contract.id, organizationId, "queued_for_field_extraction");
    await transitionContractStatus(admin, contract.id, organizationId, "extracting_fields");

    try {
      const extraction = await runFullDocumentContractExtraction({
        organizationId,
        contractId: contract.id,
        contractFileId: contractFile.id,
        requestedByUserId: user.id
      });
      if (!extraction.ok) throw new Error(extraction.safeMessage);
      metadata = mapExtractionEvidenceToLegacyMetadata({
        fields: extraction.fields,
        fallbackTitle: String(contractTitle),
        partial: extraction.run?.status === "partial"
      });
      const assessedMetadata = preparePdfRenewalExtractionForReview(metadata, {
        extractionSource: resolvedText.source,
        ocrConfidence: resolvedText.ocrConfidence,
        parserError: resolvedText.error
      });
      pdfRenewalReviewReasons = assessedMetadata.pdf_renewal_review_reasons;
      metadata = assessedMetadata;
      finalStatus = "needs_review";
    } catch {
      metadata = fallbackMetadata(contractTitle, sanitizeSensitiveProcessingError("extraction"));
      const assessedMetadata = preparePdfRenewalExtractionForReview(metadata, {
        extractionSource: resolvedText.source,
        ocrConfidence: resolvedText.ocrConfidence,
        parserError: sanitizeSensitiveProcessingError("extraction")
      });
      pdfRenewalReviewReasons = assessedMetadata.pdf_renewal_review_reasons;
      metadata = assessedMetadata;
      finalStatus = "extraction_failed";
      await recordProcessingError({
        organizationId,
        contractId: contract.id,
        contractFileId: contractFile.id,
        stage: "field_extraction",
        message: sanitizeSensitiveProcessingError("extraction"),
        details: { file_name: file.name }
      });
    }
  }

  if (pdfRenewalReviewReasons.length === 0) {
    const assessedMetadata = preparePdfRenewalExtractionForReview(metadata, {
      extractionSource: resolvedText.source,
      ocrConfidence: resolvedText.ocrConfidence,
      parserError: resolvedText.error
    });
    pdfRenewalReviewReasons = assessedMetadata.pdf_renewal_review_reasons;
    metadata = assessedMetadata;
  }

  const metadataForInsert = { ...metadata } as typeof metadata & {
    pdf_renewal_review_reasons?: string[];
  };
  delete metadataForInsert.pdf_renewal_review_reasons;
  const { data: metadataRow, error: metadataError } = await admin
    .from("contract_metadata")
    .insert({
      contract_id: contract.id,
      ...metadataForInsert,
      ...resolvePhase1ReviewAssessment({
        metadata: {
          ...metadata,
          is_ocr_assisted: resolvedText.source === "ocr"
        },
        sourceType: "upload"
      }).dirtyFlags,
      review_mode: getPhase1ReviewMode({
        ...metadata,
        is_ocr_assisted: resolvedText.source === "ocr"
      }),
      review_reason: metadata.reviewer_notes ?? null,
      contract_template_key: templateKey
    })
    .select("id")
    .single();

  if (metadataError) throw metadataError;

  await replaceEvidenceRows({
    metadataId: metadataRow.id,
    fieldSourceSnippets: metadata.field_source_snippets,
    fieldConfidence: metadata.field_confidence,
    source: resolvedText.source === "ocr" ? "ocr" : "extraction"
  });

  if (finalStatus === "extraction_failed") {
    await transitionContractStatus(admin, contract.id, organizationId, "extraction_failed");
  } else {
    await transitionContractStatus(admin, contract.id, organizationId, "needs_review");
  }
  let uploadReminderGeneratedCount = 0;
  let uploadReminderActivationState: ReminderActivationState | null = null;
  if (finalStatus !== "extraction_failed") {
    const regeneration = await regenerateSystemReminders({
      contractId: contract.id,
      organizationId,
      actorUserId: user.id,
      billingSnapshot,
      metadata: {
        ...metadata,
        owner_user_id: ownerUserId,
        needs_review: metadata.needs_review
      },
      templateKey,
      fallbackRecipients: recipients
    });
    uploadReminderGeneratedCount = regeneration.generatedCount;
    uploadReminderActivationState = regeneration.activationState;
  }

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId: contract.id,
    action: "contract.created",
    entityType: "contract",
    entityId: contract.id,
    details: {
      source_type: "upload",
      file_name: file.name,
      parser_error: parsedText.error,
      extraction_source: resolvedText.source,
      ocr_detected_needed: resolvedText.ocrDetectedNeeded,
      ocr_provider: resolvedText.ocrProvider,
      pdf_renewal_review_reasons: pdfRenewalReviewReasons,
      recipients,
      internal_reminder_generated_count: uploadReminderGeneratedCount,
      internal_reminder_processing_status: uploadReminderActivationState,
      counterparty_id: counterpartyId,
      contract_template_key: templateKey,
      status: finalStatus === "extraction_failed" ? "extraction_failed" : "needs_review"
    }
  });

  await recordSampleToFirstRealContractStartedIfNeeded({
    organizationId,
    actorUserId: user.id,
    realContractId: contract.id,
    realContractSourceType: "upload"
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "contract_upload_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `contract_upload_completed:${contract.id}`,
    properties: {
      contract_id: contract.id,
      extraction_source: resolvedText.source,
      ocr_detected_needed: resolvedText.ocrDetectedNeeded
    }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: finalStatus === "extraction_failed" ? "extraction_failed" : "extraction_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `extraction_result:${contract.id}:${finalStatus}`,
    properties: {
      contract_id: contract.id,
      extraction_source: resolvedText.source,
      ocr_status: resolvedText.ocrStatus,
      needs_review: metadata.needs_review
    }
  });

  await recalculateEvidenceReadiness({
    organizationId,
    contractId: contract.id,
    actorUserId: user.id,
    trigger: "contract_extraction_completed"
  }).catch(() => null);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/saas-opt-out-clock");

  const result: PdfContractUploadActionResult = {
    ok: true,
    contractId: contract.id,
    contractFileId: contractFile.id,
    contractPath: `/dashboard/contracts/${contract.id}`,
    extractionStatus: finalStatus,
    needsReview: true,
    reviewReasons: pdfRenewalReviewReasons,
    safeMessage:
      finalStatus === "extraction_failed"
        ? "The PDF was uploaded, but extraction needs attention. Open the contract to retry or enter the fields manually."
        : "The PDF was extracted and is ready for human review."
  };

  if (options.redirectOnSuccess) {
    redirect(result.contractPath);
  }

  return result;
}

export async function createContractAction(formData: FormData) {
  return createContractFromUpload(formData, { redirectOnSuccess: true });
}

export async function uploadSaasOptOutClockPdfAction(
  formData: FormData
): Promise<PdfContractUploadActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false,
      errorCode: "invalid_file_type",
      safeMessage: "Choose a PDF contract to upload."
    };
  }

  const validation = validateContractPdf(file);
  if (!validation.ok) {
    return {
      ok: false,
      errorCode: validation.code,
      safeMessage: validation.safeMessage
    };
  }

  if (!(await hasContractPdfSignature(file))) {
    return {
      ok: false,
      errorCode: "invalid_file_type",
      safeMessage: "The selected file is not a valid PDF contract."
    };
  }

  const safeFileName = sanitizeContractPdfFileName(file.name);
  const normalizedFormData = new FormData();
  normalizedFormData.set(
    "file",
    safeFileName === file.name
      ? file
      : new File([file], safeFileName, {
          type: "application/pdf",
          lastModified: file.lastModified
        })
  );
  normalizedFormData.set(
    "contractTitle",
    String(formData.get("contractTitle") ?? "").trim() || contractTitleFromPdfFileName(safeFileName)
  );

  const ownerUserId = formData.get("owner_user_id");
  if (typeof ownerUserId === "string" && ownerUserId) {
    normalizedFormData.set("owner_user_id", ownerUserId);
  }

  try {
    return await createContractFromUpload(normalizedFormData, { redirectOnSuccess: false });
  } catch (error) {
    if (error instanceof ContractTrackingCapacityError) {
      return {
        ok: false,
        errorCode: "contract_limit_reached",
        safeMessage: "Your tracked contract limit has been reached. Add capacity before uploading another PDF."
      };
    }

    if (error instanceof CommercialAccessError) {
      return {
        ok: false,
        errorCode: "permission_denied",
        safeMessage: error.access.message
      };
    }

    return {
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The PDF could not be processed safely. Retry the upload or add the contract manually."
    };
  }
}

export async function createManualContractAction(formData: FormData) {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const billingSnapshot = await getBillingSnapshot(organizationId);
  try {
    await enforceFeatureAccess({
      organizationId,
      actorUserId: user.id,
      feature: "manual_contracts",
      context: { source: "manual_contract_action" }
    });
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      redirectWithCommercialCode("/dashboard/contracts/new", error.feature, error.access.reason);
    }
    throw error;
  }
  const trackingCapacity = await enforceContractTrackingCapacityOrRedirect({
    organizationId,
    actorUserId: user.id,
    billingSnapshot,
    featurePath: "/dashboard/contracts/new",
    context: { source: "manual_contract_action" }
  });
  await enforceDesignPartnerBetaMutation({
    organizationId,
    action: "upload_contract",
    currentContracts: trackingCapacity.currentCount
  });

  const payload = manualContractSchema.parse({
    contract_title: formData.get("contract_title"),
    counterparty_name: formData.get("counterparty_name") || null,
    contract_type: formData.get("contract_type") || null,
    effective_date: formData.get("effective_date") || null,
    renewal_date: formData.get("renewal_date") || null,
    expiration_date: formData.get("expiration_date") || null,
    auto_renewal:
      formData.get("auto_renewal") === "true"
        ? true
        : formData.get("auto_renewal") === "false"
          ? false
          : null,
    renewal_term: formData.get("renewal_term") || null,
    notice_period_value: formData.get("notice_period_value")
      ? Number(formData.get("notice_period_value"))
      : null,
    notice_period_unit: formData.get("notice_period_unit") || null,
    notice_deadline_date: formData.get("notice_deadline_date") || null,
    termination_window: formData.get("termination_window") || null,
    governing_law: formData.get("governing_law") || null,
    payment_terms: formData.get("payment_terms") || null,
    contract_value_amount: parseNullableNumberFormValue(formData.get("contract_value_amount")),
    contract_value_currency: parseNullableStringFormValue(formData.get("contract_value_currency")),
    contract_value_period: parseNullableStringFormValue(formData.get("contract_value_period")),
    price_change_trigger: parseNullableStringFormValue(formData.get("price_change_trigger")),
    payment_trigger: parseNullableStringFormValue(formData.get("payment_trigger")),
    financial_data_trust_status: parseNullableStringFormValue(
      formData.get("financial_data_trust_status")
    ),
    extracted_clauses: [],
    field_confidence: {},
    field_source_snippets: {},
    reminder_recommendations: [],
    reviewer_notes: formData.get("reviewer_notes") || null,
    needs_review: formData.get("needs_review") === "true",
    review_mode: formData.get("review_mode") || "exception_review",
    review_reason: formData.get("review_reason") || null,
    has_conflict: parseBooleanFormValue(formData.get("has_conflict")),
    has_derived_date: parseBooleanFormValue(formData.get("has_derived_date")),
    has_weak_evidence: parseBooleanFormValue(formData.get("has_weak_evidence")),
    is_ocr_assisted: parseBooleanFormValue(formData.get("is_ocr_assisted")),
    is_manual_without_evidence: parseBooleanFormValue(formData.get("is_manual_without_evidence")),
    changes_previously_verified_p0: false,
    accepted_unverified_risk_requested: parseBooleanFormValue(
      formData.get("accepted_unverified_risk_requested")
    ),
    owner_user_id: formData.get("owner_user_id") || null,
    department: formData.get("department") || null,
    status_tag: formData.get("status_tag") || "draft"
  });
  const manualReviewAssessment = resolvePhase1ReviewAssessment({
    metadata: payload,
    sourceType: "manual"
  });

  let recipients: string[];
  try {
    recipients = getAllowedReminderRecipients(
      billingSnapshot,
      recipientListSchema.parse(String(formData.get("recipient_emails") ?? "")),
      { strict: true }
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      await createCommercialDenialAuditLog({
        organizationId,
        actorUserId: user.id,
        feature: error.feature,
        billingSnapshot,
        context: { source: "manual_contract_action" }
      });
      redirectWithCommercialCode("/dashboard/contracts/new", error.feature, error.access.reason);
    }
    throw error;
  }
  const counterpartyId = String(formData.get("counterparty_id") ?? "") || null;
  const templateKey = String(formData.get("contract_template_key") ?? "") || null;
  const resolvedCounterpartyId =
    counterpartyId ?? (await findOrCreateCounterparty({ organizationId, name: payload.counterparty_name }));
  const templateNoticeDeadline = await resolveTemplateNoticeDeadline({
    organizationId,
    templateKey,
    expirationDate: payload.expiration_date
  });
  const finalNoticeDeadline = payload.notice_deadline_date ?? templateNoticeDeadline;
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  let generatedReminderCount = 0;
  let supersededReminderCount = 0;
  let reminderActivationState: ReminderActivationState = getReminderActivationState({
    needsReview: payload.needs_review,
    ownerUserId: payload.owner_user_id ?? null,
    noticeDeadlineDate: finalNoticeDeadline,
    renewalDate: payload.renewal_date ?? null,
    expirationDate: payload.expiration_date ?? null
  });
  const canUseReminderLifecycleStatus = canEnterReminderGenerationState({
    needsReview: payload.needs_review,
    ownerUserId: payload.owner_user_id ?? null,
    noticeDeadlineDate: finalNoticeDeadline,
    renewalDate: payload.renewal_date ?? null,
    expirationDate: payload.expiration_date ?? null
  });
  const shouldGenerateInternalReminders =
    payload.needs_review ||
    canUseReminderLifecycleStatus ||
    reminderActivationState === "blocked_by_missing_owner";

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .insert({
      organization_id: organizationId,
      created_by: user.id,
      status: initialManualContractStatus(payload.needs_review),
      cycle_status: payload.needs_review
        ? "open"
        : deriveCycleStatusFromDecision(payload.renewal_decision_status, "open"),
      source_type: "manual",
      owner_user_id: payload.owner_user_id ?? null,
      department: payload.department ?? null,
      status_tag: payload.status_tag,
      counterparty_id: resolvedCounterpartyId
    })
    .select("id")
    .single();

  if (contractError) throw contractError;

  const { data: metadataRow, error: metadataError } = await admin
    .from("contract_metadata")
    .insert({
      contract_id: contract.id,
      contract_title: payload.contract_title,
      counterparty_name: payload.counterparty_name,
      contract_type: payload.contract_type,
      effective_date: payload.effective_date,
      renewal_date: payload.renewal_date,
      expiration_date: payload.expiration_date,
      auto_renewal: payload.auto_renewal,
      renewal_term: payload.renewal_term,
      notice_period_value: payload.notice_period_value,
      notice_period_unit: payload.notice_period_unit,
    notice_deadline_date: finalNoticeDeadline,
    termination_window: payload.termination_window,
    governing_law: payload.governing_law,
    payment_terms: payload.payment_terms,
    ...resolveFinancialMetadataFields({
      contractValueAmount: payload.contract_value_amount,
      contractValueCurrency: payload.contract_value_currency,
      contractValuePeriod: payload.contract_value_period,
      priceChangeTrigger: payload.price_change_trigger,
      paymentTrigger: payload.payment_trigger,
      financialDataTrustStatus: payload.financial_data_trust_status,
      needsReview: payload.needs_review
    }),
    extracted_clauses: payload.extracted_clauses,
      field_confidence: payload.field_confidence,
      field_source_snippets: payload.field_source_snippets,
      reminder_recommendations: payload.reminder_recommendations,
      reviewer_notes: payload.reviewer_notes,
      needs_review: payload.needs_review,
      review_mode: manualReviewAssessment.reviewMode,
      review_reason: payload.review_reason ?? null,
      ...manualReviewAssessment.dirtyFlags,
      contract_template_key: templateKey
    })
    .select("id")
    .single();

  if (metadataError) throw metadataError;

  await replaceEvidenceRows({
    metadataId: metadataRow.id,
    fieldSourceSnippets: payload.field_source_snippets,
    fieldConfidence: payload.field_confidence
  });

  if (shouldGenerateInternalReminders) {
    if (payload.needs_review || canUseReminderLifecycleStatus) {
      await transitionContractStatus(admin, contract.id, organizationId, "reminder_generation_pending");
    }
    const regeneration = await regenerateSystemReminders({
      contractId: contract.id,
      organizationId,
      actorUserId: user.id,
      billingSnapshot,
      metadata: {
        ...payload,
        notice_deadline_date: finalNoticeDeadline,
        owner_user_id: payload.owner_user_id ?? null,
        needs_review: payload.needs_review
      },
      templateKey,
      fallbackRecipients: recipients
    });
    generatedReminderCount = regeneration.generatedCount;
    supersededReminderCount = regeneration.supersededCount;
    reminderActivationState = regeneration.activationState;

    if (regeneration.activationState === "scheduled" && regeneration.generatedCount > 0) {
      await transitionContractStatus(admin, contract.id, organizationId, "reminders_scheduled");
    } else if (payload.needs_review || canUseReminderLifecycleStatus) {
      await transitionContractStatus(admin, contract.id, organizationId, "reviewed");
    }
  }

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId: contract.id,
    action: "contract.manual_created",
    entityType: "contract",
    entityId: contract.id,
    details: {
      source_type: "manual",
      recipients,
      status_tag: payload.status_tag,
      department: payload.department,
      counterparty_id: counterpartyId,
      review_mode: manualReviewAssessment.reviewMode,
      dirty_review_flags: manualReviewAssessment.dirtyFlags,
      trusted_workflow_active: !payload.needs_review && Boolean(payload.owner_user_id),
      contract_template_key: templateKey,
      reminder_regenerated_count: generatedReminderCount,
      superseded_reminder_count: supersededReminderCount,
      processing_status: payload.needs_review ? "needs_review" : reminderActivationState
    }
  });

  await recordSampleToFirstRealContractStartedIfNeeded({
    organizationId,
    actorUserId: user.id,
    realContractId: contract.id,
    realContractSourceType: "manual"
  });

  if (!payload.needs_review) {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "contract_review_completed",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `contract_review_completed:${contract.id}`,
      properties: { contract_id: contract.id, source_type: "manual" }
    });
  }

  if (payload.owner_user_id) {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "contract_owner_assigned",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `contract_owner_assigned:${contract.id}:${payload.owner_user_id}`,
      properties: { contract_id: contract.id, owner_user_id: payload.owner_user_id }
    });
  }

  if (!payload.needs_review && generatedReminderCount > 0) {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "reminder_scheduled",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `reminder_scheduled:manual_contract:${contract.id}`,
      properties: {
        contract_id: contract.id,
        recipient_count: recipients.length,
        reminder_count: generatedReminderCount
      }
    });
  }

  await recalculateEvidenceReadiness({
    organizationId,
    contractId: contract.id,
    actorUserId: user.id,
    trigger: "contract_created"
  }).catch(() => null);

  revalidatePath("/dashboard");
  redirect(`/dashboard/contracts/${contract.id}`);
}

export async function updateContractReviewAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  await assertCanUseShippedAction(context, "edit_p0", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  await assertCanUseShippedAction(context, "assign_owner", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "review_contract" });
  const { user, organizationId } = context;
  const metadataId = await getScopedContractMetadataId(contractId, organizationId);
  const supabase = createServerSupabaseClient();
  const { data: currentMetadata, error: currentMetadataError } = await supabase
    .from("contract_metadata")
    .select(
      "needs_review, notice_deadline_date, renewal_date, expiration_date, termination_window, auto_renewal, contract_value_amount, contract_value_currency, is_ocr_assisted"
    )
    .eq("id", metadataId)
    .single();

  if (currentMetadataError) throw currentMetadataError;
  const { data: currentContract, error: currentContractError } = await supabase
    .from("contracts")
    .select("owner_user_id, department")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();
  if (currentContractError) throw currentContractError;
  const payload = reviewContractSchema.parse({
    contract_title: formData.get("contract_title"),
    counterparty_name: formData.get("counterparty_name"),
    contract_type: formData.get("contract_type"),
    effective_date: formData.get("effective_date") || null,
    renewal_date: formData.get("renewal_date") || null,
    expiration_date: formData.get("expiration_date") || null,
    auto_renewal:
      formData.get("auto_renewal") === "true"
        ? true
        : formData.get("auto_renewal") === "false"
          ? false
          : null,
    renewal_term: formData.get("renewal_term"),
    notice_period_value: formData.get("notice_period_value")
      ? Number(formData.get("notice_period_value"))
      : null,
    notice_period_unit: formData.get("notice_period_unit") || null,
    notice_deadline_date: formData.get("notice_deadline_date") || null,
    termination_window: formData.get("termination_window") || null,
    governing_law: formData.get("governing_law"),
    payment_terms: formData.get("payment_terms"),
    contract_value_amount: parseNullableNumberFormValue(formData.get("contract_value_amount")),
    contract_value_currency: parseNullableStringFormValue(formData.get("contract_value_currency")),
    contract_value_period: parseNullableStringFormValue(formData.get("contract_value_period")),
    price_change_trigger: parseNullableStringFormValue(formData.get("price_change_trigger")),
    payment_trigger: parseNullableStringFormValue(formData.get("payment_trigger")),
    financial_data_trust_status: parseNullableStringFormValue(
      formData.get("financial_data_trust_status")
    ),
    extracted_clauses: JSON.parse(String(formData.get("extracted_clauses") ?? "[]")),
    field_confidence: JSON.parse(String(formData.get("field_confidence") ?? "{}")),
    field_source_snippets: JSON.parse(String(formData.get("field_source_snippets") ?? "{}")),
    reminder_recommendations: JSON.parse(
      String(formData.get("reminder_recommendations") ?? "[]")
    ),
    reviewer_notes: formData.get("reviewer_notes"),
    needs_review: formData.get("needs_review") === "true",
    review_mode: formData.get("review_mode") || undefined,
    review_reason: formData.get("review_reason") || null,
    has_conflict: parseBooleanFormValue(formData.get("has_conflict")),
    has_derived_date: parseBooleanFormValue(formData.get("has_derived_date")),
    has_weak_evidence: parseBooleanFormValue(formData.get("has_weak_evidence")),
    is_ocr_assisted: parseBooleanFormValue(formData.get("is_ocr_assisted")),
    is_manual_without_evidence: parseBooleanFormValue(formData.get("is_manual_without_evidence")),
    changes_previously_verified_p0: parseBooleanFormValue(
      formData.get("changes_previously_verified_p0")
    ),
    accepted_unverified_risk_requested: parseBooleanFormValue(
      formData.get("accepted_unverified_risk_requested")
    ),
    owner_user_id: formData.get("owner_user_id") || null,
    department: formData.get("department") || null,
    status_tag: formData.get("status_tag") || "active",
    counterparty_id: formData.get("counterparty_id") || null,
    contract_template_key: formData.get("contract_template_key") || null,
    renewal_decision_status: formData.get("renewal_decision_status") || "undecided",
    renewal_decision_date: formData.get("renewal_decision_date") || null
  });
  const correctionTrust = applyManualPdfRenewalCorrections({
    previous: currentMetadata,
    next: payload,
    fieldConfidence: payload.field_confidence,
    fieldSourceSnippets: payload.field_source_snippets
  });
  payload.field_confidence = correctionTrust.fieldConfidence;
  payload.field_source_snippets = correctionTrust.fieldSourceSnippets;
  const reviewAssessment = resolvePhase1ReviewAssessment({
    metadata: {
      ...payload,
      is_ocr_assisted: payload.is_ocr_assisted || (currentMetadata?.is_ocr_assisted ?? false)
    },
    sourceType: "review",
    previousMetadata: currentMetadata
  });

  const resolvedCounterpartyId =
    payload.counterparty_id ??
    (await findOrCreateCounterparty({ organizationId, name: payload.counterparty_name }));
  const templateNoticeDeadline = await resolveTemplateNoticeDeadline({
    organizationId,
    templateKey: payload.contract_template_key ?? null,
    expirationDate: payload.expiration_date ?? null
  });
  const finalNoticeDeadline = payload.notice_deadline_date ?? templateNoticeDeadline;
  const nextCycleStatus = payload.needs_review
    ? "open"
    : deriveCycleStatusFromDecision(payload.renewal_decision_status, "open");

  const [{ error: metadataError }, { error: contractError }] = await Promise.all([
    supabase
      .from("contract_metadata")
      .update({
        contract_title: payload.contract_title,
        counterparty_name: payload.counterparty_name,
        contract_type: payload.contract_type,
        effective_date: payload.effective_date,
        renewal_date: payload.renewal_date,
        expiration_date: payload.expiration_date,
        auto_renewal: payload.auto_renewal,
        renewal_term: payload.renewal_term,
        notice_period_value: payload.notice_period_value,
        notice_period_unit: payload.notice_period_unit,
        notice_deadline_date: finalNoticeDeadline,
        termination_window: payload.termination_window,
        governing_law: payload.governing_law,
        payment_terms: payload.payment_terms,
        ...resolveFinancialMetadataFields({
          contractValueAmount: payload.contract_value_amount,
          contractValueCurrency: payload.contract_value_currency,
          contractValuePeriod: payload.contract_value_period,
          priceChangeTrigger: payload.price_change_trigger,
          paymentTrigger: payload.payment_trigger,
          financialDataTrustStatus: payload.financial_data_trust_status,
          needsReview: payload.needs_review
        }),
        extracted_clauses: payload.extracted_clauses,
        field_confidence: payload.field_confidence,
        field_source_snippets: payload.field_source_snippets,
        reminder_recommendations: payload.reminder_recommendations,
        reviewer_notes: payload.reviewer_notes,
        needs_review: payload.needs_review,
        review_mode: reviewAssessment.reviewMode,
        review_reason: payload.review_reason ?? null,
        ...reviewAssessment.dirtyFlags,
        contract_template_key: payload.contract_template_key ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        deadline_verified_at: !payload.needs_review && finalNoticeDeadline ? new Date().toISOString() : null,
        financial_terms_reviewed_at: !payload.needs_review && payload.contract_value_amount !== null && payload.contract_value_currency
          ? new Date().toISOString()
          : null
      })
      .eq("id", metadataId),
    supabase
      .from("contracts")
      .update({
        owner_user_id: payload.owner_user_id ?? null,
        department: payload.department ?? null,
        owner_confirmed_at: currentContract.owner_user_id !== (payload.owner_user_id ?? null) && payload.owner_user_id
          ? new Date().toISOString()
          : undefined,
        owner_confirmed_by_user_id: currentContract.owner_user_id !== (payload.owner_user_id ?? null) && payload.owner_user_id
          ? user.id
          : undefined,
        department_confirmed_at: currentContract.department !== (payload.department ?? null) && payload.department
          ? new Date().toISOString()
          : undefined,
        status_tag: payload.status_tag,
        counterparty_id: resolvedCounterpartyId,
        renewal_decision_status: payload.renewal_decision_status,
        renewal_decision_date: payload.renewal_decision_date ?? null,
        cycle_status: nextCycleStatus
      })
      .eq("id", contractId)
      .eq("organization_id", organizationId)
  ]);

  if (metadataError) throw metadataError;
  if (contractError) throw contractError;

  await replaceEvidenceRows({
    metadataId,
    fieldSourceSnippets: payload.field_source_snippets,
    fieldConfidence: payload.field_confidence
  });

  const reviewedStatus = nextReviewedContractStatus(payload.needs_review);
  const recipients = await getDefaultRecipients(user.id, organizationId);
  const billingSnapshot = await getBillingSnapshot(organizationId);
  let regeneratedReminderCount = 0;
  let supersededReminderCount = 0;
  let reminderActivationState: ReminderActivationState = getReminderActivationState({
    needsReview: payload.needs_review,
    ownerUserId: payload.owner_user_id ?? null,
    noticeDeadlineDate: finalNoticeDeadline,
    renewalDate: payload.renewal_date ?? null,
    expirationDate: payload.expiration_date ?? null
  });
  const canUseReminderLifecycleStatus = canEnterReminderGenerationState({
    needsReview: payload.needs_review,
    ownerUserId: payload.owner_user_id ?? null,
    noticeDeadlineDate: finalNoticeDeadline,
    renewalDate: payload.renewal_date ?? null,
    expirationDate: payload.expiration_date ?? null
  });
  const shouldGenerateInternalReminders =
    payload.needs_review ||
    canUseReminderLifecycleStatus ||
    reminderActivationState === "blocked_by_missing_owner";

  await transitionContractStatus(supabase, contractId, organizationId, reviewedStatus);

  if (shouldGenerateInternalReminders) {
    if (payload.needs_review || canUseReminderLifecycleStatus) {
      await transitionContractStatus(supabase, contractId, organizationId, "reminder_generation_pending");
    }
    const regeneration = await regenerateSystemReminders({
      contractId,
      organizationId,
      actorUserId: user.id,
      billingSnapshot,
      metadata: {
        contract_title: payload.contract_title,
        counterparty_name: payload.counterparty_name,
        contract_type: payload.contract_type,
        effective_date: payload.effective_date,
        renewal_date: payload.renewal_date,
        expiration_date: payload.expiration_date,
        auto_renewal: payload.auto_renewal,
        renewal_term: payload.renewal_term,
        notice_period_value: payload.notice_period_value,
        notice_period_unit: payload.notice_period_unit,
        notice_deadline_date: finalNoticeDeadline,
        termination_window: payload.termination_window,
        governing_law: payload.governing_law,
        payment_terms: payload.payment_terms,
        contract_value_amount: payload.contract_value_amount,
        contract_value_currency: payload.contract_value_currency,
        contract_value_period: payload.contract_value_period,
        price_change_trigger: payload.price_change_trigger,
        payment_trigger: payload.payment_trigger,
        financial_data_trust_status: payload.financial_data_trust_status,
        extracted_clauses: payload.extracted_clauses,
        field_confidence: payload.field_confidence,
        field_source_snippets: payload.field_source_snippets,
        reminder_recommendations: payload.reminder_recommendations,
        reviewer_notes: payload.reviewer_notes,
        owner_user_id: payload.owner_user_id ?? null,
        needs_review: payload.needs_review
      },
      templateKey: payload.contract_template_key,
      fallbackRecipients: recipients
    });
    regeneratedReminderCount = regeneration.generatedCount;
    supersededReminderCount = regeneration.supersededCount;
    reminderActivationState = regeneration.activationState;

    if (regeneration.activationState === "scheduled" && regeneration.generatedCount > 0) {
      await transitionContractStatus(supabase, contractId, organizationId, "reminders_scheduled");
    } else if (payload.needs_review || canUseReminderLifecycleStatus) {
      await transitionContractStatus(supabase, contractId, organizationId, "reviewed");
    }
  }

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "contract.review_updated",
    entityType: "contract",
    entityId: contractId,
    details: {
      needs_review: payload.needs_review,
      review_mode: reviewAssessment.reviewMode,
      dirty_review_flags: reviewAssessment.dirtyFlags,
      corrected_critical_fields: correctionTrust.correctedFields,
      owner_user_id: payload.owner_user_id,
      department: payload.department,
      status_tag: payload.status_tag,
      counterparty_id: payload.counterparty_id,
      renewal_decision_status: payload.renewal_decision_status,
      cycle_status: nextCycleStatus,
      reminder_regenerated_count: regeneratedReminderCount,
      superseded_reminder_count: supersededReminderCount,
      processing_status: payload.needs_review ? "needs_review" : reminderActivationState
    }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "contract_review_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `contract_review_completed:${contractId}:${payload.needs_review ? "pending" : "final"}`,
    properties: {
      contract_id: contractId,
      needs_review: payload.needs_review,
      reminder_regenerated_count: regeneratedReminderCount
    }
  });

  if (payload.owner_user_id) {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "contract_owner_assigned",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `contract_owner_assigned:${contractId}:${payload.owner_user_id}`,
      properties: { contract_id: contractId, owner_user_id: payload.owner_user_id }
    });
  }

  if (!payload.needs_review && regeneratedReminderCount > 0) {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "reminder_scheduled",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `reminder_scheduled:review:${contractId}`,
      properties: {
        contract_id: contractId,
        reminder_regenerated_count: regeneratedReminderCount
      }
    });
  }

  await recalculateEvidenceReadiness({
    organizationId,
    contractId,
    actorUserId: user.id,
    trigger: "contract_reviewed"
  }).catch(() => null);

  revalidatePath(`/dashboard/contracts/${contractId}`);
}

export async function createReminderAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "manage_reminders", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  const { user, organizationId } = context;
  const billingSnapshot = await getBillingSnapshot(organizationId);
  const parsedRecipients = recipientListSchema.parse(String(formData.get("recipient_emails") ?? ""));
  let recipients: string[];

  try {
    recipients = getAllowedReminderRecipients(billingSnapshot, parsedRecipients, { strict: true });
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      await createCommercialDenialAuditLog({
        organizationId,
        actorUserId: user.id,
        feature: error.feature,
        billingSnapshot,
        context: { contract_id: contractId, source: "manual_reminder" }
      });
      redirectWithCommercialCode(`/dashboard/contracts/${contractId}`, error.feature, error.access.reason);
    }
    throw error;
  }

  const supabase = createServerSupabaseClient();
  const { data: reminderContract, error: reminderContractError } = await supabase
    .from("contracts")
    .select("owner_user_id, contract_metadata(needs_review, notice_deadline_date, renewal_date, expiration_date)")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (reminderContractError) throw reminderContractError;

  const typedReminderContract = reminderContract as unknown as {
    owner_user_id: string | null;
    contract_metadata:
      | {
          needs_review: boolean | null;
          notice_deadline_date: string | null;
          renewal_date: string | null;
          expiration_date: string | null;
        }
      | Array<{
          needs_review: boolean | null;
          notice_deadline_date: string | null;
          renewal_date: string | null;
          expiration_date: string | null;
        }>
      | null;
  };
  const reminderMetadata = Array.isArray(typedReminderContract.contract_metadata)
    ? typedReminderContract.contract_metadata[0]
    : typedReminderContract.contract_metadata;

  const activationState = getReminderActivationState({
    needsReview: reminderMetadata?.needs_review ?? true,
    ownerUserId: typedReminderContract.owner_user_id ?? null,
    noticeDeadlineDate: reminderMetadata?.notice_deadline_date ?? null,
    renewalDate: reminderMetadata?.renewal_date ?? null,
    expirationDate: reminderMetadata?.expiration_date ?? null,
    recipientCount: recipients.length
  });

  if (activationState !== "scheduled") {
    await createAuditLog({
      organizationId,
      actorUserId: user.id,
      contractId,
      action: "reminder.blocked",
      entityType: "reminder",
      entityId: null,
      details: { processing_status: activationState }
    });

    throw new Error(
      activationState === "blocked_by_review"
        ? "Trusted reminders stay blocked until review is complete."
        : activationState === "blocked_by_missing_owner"
          ? "Trusted reminders stay blocked until an owner is assigned."
          : "Trusted reminders stay blocked until the contract has one confirmed operational date."
    );
  }

  const reminder = reminderSchema.parse({
    reminder_type: formData.get("reminder_type"),
    remind_at: formData.get("remind_at"),
    recipient_email: recipients[0],
    recipient_emails: recipients,
    rule_name: null,
    escalation_level: 0,
    ical_uid: `${contractId}-${String(formData.get("remind_at") ?? "")}-${Date.now()}`,
    source: "manual"
  });
  const { data: createdReminder, error } = await supabase
    .from("reminders")
    .insert({
      contract_id: contractId,
      organization_id: organizationId,
      ...reminder,
      next_retry_at: reminder.remind_at,
      max_attempts: REMINDER_RETRY_POLICY.maxAttempts
    })
    .select("id")
    .single();

  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "reminder.created",
    entityType: "reminder",
    entityId: createdReminder.id,
    details: reminder
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "reminder_scheduled",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `reminder_scheduled:${createdReminder.id}`,
    properties: {
      contract_id: contractId,
      reminder_id: createdReminder.id,
      recipient_count: recipients.length
    }
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
}

export async function createCounterpartyAction(formData: FormData) {
  const { user, organizationId } = await requireOrganization();
  const payload = counterpartySchema.parse({
    name: formData.get("name")
  });
  const identity = buildCounterpartyIdentity(payload.name);

  const supabase = createServerSupabaseClient();
  const { data: existingCounterparties } = await supabase
    .from("counterparties")
    .select("id, raw_counterparty_name, normalized_counterparty_name, merged_into_counterparty_id")
    .eq("organization_id", organizationId);
  const duplicateSuggestions = suggestDuplicateCounterparties(
    (existingCounterparties ?? []) as Array<{
      id: string;
      raw_counterparty_name: string;
      normalized_counterparty_name: string;
      merged_into_counterparty_id: string | null;
      contract_count?: number;
    }>,
    identity.rawCounterpartyName
  );
  const { data, error } = await supabase
    .from("counterparties")
    .insert({
      organization_id: organizationId,
      ...payload,
      name: identity.rawCounterpartyName,
      raw_counterparty_name: identity.rawCounterpartyName,
      normalized_counterparty_name: identity.normalizedCounterpartyName
    })
    .select("id")
    .single();
  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "counterparty.created",
    entityType: "counterparty",
    entityId: data.id,
    details: {
      raw_counterparty_name: identity.rawCounterpartyName,
      normalized_counterparty_name: identity.normalizedCounterpartyName,
      duplicate_suggestions: duplicateSuggestions.map((suggestion) => ({
        id: suggestion.id,
        raw_counterparty_name: suggestion.rawCounterpartyName,
        score: suggestion.score
      }))
    }
  });

  revalidatePath("/dashboard/counterparties");
  revalidatePath("/dashboard/contracts/new");
}

export async function mergeCounterpartyAction(sourceCounterpartyId: string, targetCounterpartyId: string) {
  const { user, organizationId } = await requireOrganization();
  if (sourceCounterpartyId === targetCounterpartyId) {
    throw new Error("Counterparty merge requires two different counterparties.");
  }

  const supabase = createServerSupabaseClient();
  const [{ data: counterparties, error: counterpartyError }, { data: existingAliases, error: aliasError }] =
    await Promise.all([
      supabase
        .from("counterparties")
        .select("id, organization_id, raw_counterparty_name, normalized_counterparty_name, merged_into_counterparty_id")
        .eq("organization_id", organizationId)
        .in("id", [sourceCounterpartyId, targetCounterpartyId]),
      supabase
        .from("counterparty_aliases")
        .select("counterparty_id, alias_name, normalized_alias_name")
        .eq("organization_id", organizationId)
        .in("counterparty_id", [sourceCounterpartyId, targetCounterpartyId])
    ]);

  if (counterpartyError) throw counterpartyError;
  if (aliasError) throw aliasError;

  const source = (counterparties ?? []).find((row) => row.id === sourceCounterpartyId);
  const target = (counterparties ?? []).find((row) => row.id === targetCounterpartyId);

  if (!source || !target) {
    throw new Error("Counterparty not found for active organization.");
  }
  if (source.merged_into_counterparty_id) {
    throw new Error("Source counterparty is already merged.");
  }
  if (target.merged_into_counterparty_id) {
    throw new Error("Target counterparty must be a canonical vendor identity.");
  }

  await supabase
    .from("contracts")
    .update({ counterparty_id: targetCounterpartyId })
    .eq("organization_id", organizationId)
    .eq("counterparty_id", sourceCounterpartyId);

  const aliasPayload = dedupeCounterpartyAliases([
    {
      alias_name: source.raw_counterparty_name,
      normalized_alias_name: source.normalized_counterparty_name
    },
    ...((existingAliases ?? []) as Array<{
      counterparty_id: string;
      alias_name: string;
      normalized_alias_name: string;
    }>)
      .filter((alias) => alias.counterparty_id === sourceCounterpartyId)
      .map((alias) => ({
        alias_name: alias.alias_name,
        normalized_alias_name: alias.normalized_alias_name
      }))
  ]).filter(
    (alias) => alias.normalized_alias_name !== target.normalized_counterparty_name
  );

  if (aliasPayload.length > 0) {
    await supabase.from("counterparty_aliases").upsert(
      aliasPayload.map((alias) => ({
        organization_id: organizationId,
        counterparty_id: targetCounterpartyId,
        alias_name: alias.alias_name,
        normalized_alias_name: alias.normalized_alias_name
      })),
      {
        onConflict: "counterparty_id,normalized_alias_name",
        ignoreDuplicates: true
      }
    );
  }

  await supabase
    .from("counterparties")
    .update({ merged_into_counterparty_id: targetCounterpartyId })
    .eq("id", sourceCounterpartyId)
    .eq("organization_id", organizationId);

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "counterparty.merged",
    entityType: "counterparty",
    entityId: sourceCounterpartyId,
    details: {
      merged_into_counterparty_id: targetCounterpartyId,
      preserved_aliases: aliasPayload.map((alias) => alias.alias_name)
    }
  });

  revalidatePath("/dashboard/counterparties");
  revalidatePath("/dashboard/contracts");
  revalidatePath("/dashboard/contracts/new");
}

export async function createTemplateAction(formData: FormData) {
  const { user, organizationId } = await requireOrganization();
  const payload = templateSchema.parse({
    template_key: formData.get("template_key"),
    name: formData.get("name"),
    contract_type: formData.get("contract_type") || null,
    default_notice_period_value: formData.get("default_notice_period_value")
      ? Number(formData.get("default_notice_period_value"))
      : null,
    default_notice_period_unit: formData.get("default_notice_period_unit") || null,
    default_reminder_offsets: splitEmails(String(formData.get("default_reminder_offsets") ?? "")).map(
      (item) => item.toUpperCase()
    ),
    checklist: String(formData.get("checklist") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
  });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contract_templates")
    .insert({ organization_id: organizationId, ...payload })
    .select("id")
    .single();
  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "template.created",
    entityType: "template",
    entityId: data.id,
    details: payload
  });

  revalidatePath("/dashboard/contracts/new");
}

export async function importContractsAction(formData: FormData) {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  let billingSnapshot;
  try {
    const result = await enforceFeatureAccess({
      organizationId,
      actorUserId: user.id,
      feature: "manual_contracts",
      context: { source: "import_contracts_action" }
    });
    billingSnapshot = result.billingSnapshot;
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      redirectWithCommercialCode("/dashboard/contracts/new", error.feature, error.access.reason);
    }
    throw error;
  }
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Spreadsheet file is required.");
  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.import_started",
    entityType: "import",
    details: { file_name: file.name }
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = parseImportFile(file.name, buffer);

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "import_started",
    sourceOfTruth: "event",
    idempotencyKey: `import_started:${organizationId}:${file.name}:${file.size}`,
    properties: {
      file_name: file.name,
      row_count: parsedRows.length
    }
  });

  const trackingCapacity = await enforceContractTrackingCapacityOrRedirect({
    organizationId,
    actorUserId: user.id,
    billingSnapshot,
    featurePath: "/dashboard/contracts/new",
    context: { source: "import_contracts_action", row_count: parsedRows.length },
    additionalContracts: Math.max(parsedRows.length, 1)
  });
  await enforceDesignPartnerBetaMutation({
    organizationId,
    action: "upload_contract",
    currentContracts: trackingCapacity.currentCount + Math.max(parsedRows.length - 1, 0)
  });
  const admin = createPrivilegedSupabaseClient("contract_action_legacy");
  const members = await getOrganizationMembers(organizationId);
  const ownerByEmail = new Map(
    members
      .filter((member) => member.user?.notification_email)
      .map((member) => [member.user?.notification_email?.toLowerCase() ?? "", member.user_id] as const)
  );
  const knownOwnerEmails = new Set(ownerByEmail.keys());
  const { data: existingContracts, error: existingContractsError } = await admin
    .from("contracts")
    .select(
      `
      contract_metadata (
        contract_title,
        counterparty_name,
        notice_deadline_date,
        renewal_date,
        expiration_date
      )
    `
    )
    .eq("organization_id", organizationId);

  if (existingContractsError) throw existingContractsError;

  const existingDuplicateKeys = new Set(
    ((existingContracts ?? []) as unknown as Array<{
      contract_metadata:
        | {
            contract_title: string | null;
            counterparty_name: string | null;
            notice_deadline_date: string | null;
            renewal_date: string | null;
            expiration_date: string | null;
          }
        | Array<{
            contract_title: string | null;
            counterparty_name: string | null;
            notice_deadline_date: string | null;
            renewal_date: string | null;
            expiration_date: string | null;
          }>
        | null;
    }>)
      .map((contract) =>
        Array.isArray(contract.contract_metadata)
          ? contract.contract_metadata[0]
          : contract.contract_metadata
      )
      .flatMap((metadata) => {
        if (
          !metadata?.contract_title ||
          !metadata.counterparty_name ||
          (!metadata.notice_deadline_date && !metadata.renewal_date && !metadata.expiration_date)
        ) {
          return [];
        }
        return [
          [
            metadata.contract_title.trim().toLowerCase(),
            metadata.counterparty_name.trim().toLowerCase(),
            metadata.notice_deadline_date ?? "",
            metadata.renewal_date ?? "",
            metadata.expiration_date ?? ""
          ].join("|")
        ];
      })
  );
  const assessment = assessImportRows(parsedRows, {
    knownOwnerEmails,
    existingDuplicateKeys
  });

  const { data: importJob } = await admin
    .from("import_jobs")
    .insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      file_name: file.name,
      row_count: assessment.summary.totalRows,
      status: "pending"
    })
    .select("id")
    .single();

  let importedCount = 0;
  const rowResults = assessment.results.map((result) => ({ ...result }));
  try {
    for (const result of rowResults) {
      if (result.status === "failed") continue;
      try {
        const counterpartyId = await findOrCreateCounterparty({
          organizationId,
          name: result.normalized.counterparty_name
        });
        const contract = await admin
          .from("contracts")
          .insert({
            organization_id: organizationId,
            created_by: user.id,
            status: "needs_review",
            cycle_status: "open",
            source_type: "manual",
            owner_user_id: result.normalized.owner_email
              ? ownerByEmail.get(result.normalized.owner_email) ?? null
              : null,
            department: result.normalized.department ?? null,
            status_tag: "active",
            counterparty_id: counterpartyId
          })
          .select("id")
          .single();

        await admin.from("contract_metadata").insert({
          ...resolvePhase1ReviewAssessment({
            metadata: {
              contract_title: result.normalized.contract_title,
              counterparty_name: result.normalized.counterparty_name ?? null,
              contract_type: null,
              effective_date: null,
              renewal_date: result.normalized.renewal_date ?? null,
              expiration_date: result.normalized.expiration_date ?? null,
              auto_renewal: result.normalized.auto_renewal,
              renewal_term: null,
              notice_period_value: null,
              notice_period_unit: null,
              notice_deadline_date: result.normalized.notice_deadline_date ?? null,
              termination_window: result.normalized.termination_window ?? null,
              governing_law: null,
              payment_terms: null,
              contract_value_amount: result.normalized.contract_value,
              contract_value_currency: null,
              contract_value_period: null,
              price_change_trigger: null,
              payment_trigger: null,
              extracted_clauses: [],
              field_confidence: {},
              field_source_snippets: {},
              reminder_recommendations: [],
              reviewer_notes:
                result.warnings.length > 0 ? result.warnings.join(" ") : null,
              needs_review: true,
              review_mode: "exception_review",
              review_reason: [
                "Imported contracts require human review before trusted reminders activate.",
                ...result.warnings
              ].join(" "),
              is_manual_without_evidence: true
            },
            sourceType: "manual"
          }).dirtyFlags,
          contract_id: contract.data!.id,
          contract_title: result.normalized.contract_title,
          counterparty_name: result.normalized.counterparty_name ?? null,
          contract_type: null,
          renewal_date: result.normalized.renewal_date ?? null,
          expiration_date: result.normalized.expiration_date ?? null,
          notice_deadline_date: result.normalized.notice_deadline_date ?? null,
          termination_window: result.normalized.termination_window ?? null,
          auto_renewal: result.normalized.auto_renewal,
          ...resolveFinancialMetadataFields({
            contractValueAmount: result.normalized.contract_value,
            contractValueCurrency: null,
            contractValuePeriod: null,
            priceChangeTrigger: null,
            paymentTrigger: null,
            financialDataTrustStatus: "low",
            needsReview: true
          }),
          field_confidence: {},
          field_source_snippets: {},
          extracted_clauses: [],
          reminder_recommendations: [],
          needs_review: true,
          review_mode: "exception_review",
          review_reason: [
            "Imported contracts require human review before trusted reminders activate.",
            ...result.warnings
          ].join(" ")
        });
        importedCount += 1;
      } catch (error) {
        result.status = "failed";
        result.errors.push(error instanceof Error ? error.message : "Import row failed");
      }
    }

    const rescueRowCount = rowResults.filter((result) => result.status !== "imported").length;
    const importJobStatus =
      assessment.cleanupTriggers.length > 0
        ? "needs_cleanup"
        : rescueRowCount > 0
          ? "completed_with_errors"
          : "completed";
    const importJobMessage =
      assessment.cleanupTriggers.length > 0
        ? assessment.cleanupTriggers.join(" ")
        : rescueRowCount > 0
          ? `${rescueRowCount} import rows need rescue. Download the row report for details.`
          : null;

    await admin
      .from("import_jobs")
      .update({
        imported_count: importedCount,
        status: importJobStatus,
        error_message: importJobMessage,
        error_report_json: serializeImportRowReport(rowResults)
      })
      .eq("id", importJob?.id ?? "")
      .eq("organization_id", organizationId);
  } catch (error) {
    await admin
      .from("import_jobs")
      .update({
        imported_count: importedCount,
        status: "failed",
        error_message: error instanceof Error ? error.message : "Import failed",
        error_report_json: serializeImportRowReport(rowResults)
      })
      .eq("id", importJob?.id ?? "")
      .eq("organization_id", organizationId);
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "import_failed",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `import_failed:${importJob?.id ?? file.name}`,
      properties: {
        file_name: file.name,
        imported_count: importedCount,
        error_count: rowResults.filter((result) => result.status === "failed").length
      }
    });
    if (error instanceof CommercialAccessError) {
      await createCommercialDenialAuditLog({
        organizationId,
        actorUserId: user.id,
        feature: error.feature,
        billingSnapshot,
        context: { source: "import_contracts_action", file_name: file.name }
      });
      redirectWithCommercialCode("/dashboard/contracts/new", error.feature, error.access.reason);
    }
    throw error;
  }

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.imported",
    entityType: "import",
    entityId: importJob?.id ?? null,
    details: {
      file_name: file.name,
      row_count: assessment.summary.totalRows,
      imported_count: importedCount,
      error_count: rowResults.filter((result) => result.status === "failed").length,
      cleanup_trigger_count: assessment.cleanupTriggers.length,
      review_queue_created_count: importedCount
    }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "import_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `import_completed:${importJob?.id ?? file.name}`,
    properties: {
      file_name: file.name,
      row_count: assessment.summary.totalRows,
      imported_count: importedCount,
      error_count: rowResults.filter((result) => result.status === "failed").length
    }
  });

  revalidatePath("/dashboard/contracts");
}
