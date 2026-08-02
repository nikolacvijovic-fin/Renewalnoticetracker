import { evaluateSaasRenewalRules } from "@/lib/rules/saas-renewal-rules";
import type { RuleOutcome } from "@/lib/rules/rule-types";

export type NoticePeriodUnit = "days" | "weeks" | "months";
export type OptOutUrgency = "expired" | "critical" | "high" | "medium" | "low";
export type OptOutDeadlineWindow = "expired" | "due_7_days" | "due_30_days" | "due_60_days" | "future" | "missing";
export type SaasRiskFindingType =
  | "auto_renewal"
  | "missing_notice_deadline"
  | "expired_opt_out"
  | "critical_opt_out"
  | "deadline_soon"
  | "weak_evidence"
  | "missing_owner"
  | "high_spend_at_risk"
  | "contract_saas_metadata_conflict";
export type SaasRiskSeverity = "low" | "medium" | "high" | "critical";
export type SaasRiskFindingStatus = "open" | "resolved" | "accepted_risk" | "ignored";
export type SaasOptOutWorkflowStatus =
  | "needs_review"
  | "ready"
  | "owner_assigned"
  | "decision_needed"
  | "resolved"
  | "accepted_risk"
  | "ignored";

export type SaasTermInput = {
  renewalDate?: string | null;
  expirationDate?: string | null;
  noticeDeadlineDate?: string | null;
  noticePeriodValue?: number | null;
  noticePeriodUnit?: NoticePeriodUnit | null;
  autoRenewal?: boolean | null;
};

export type SaasRiskFindingInput = SaasTermInput & {
  today?: string;
  ownerUserId?: string | null;
  evidenceConfidence?: number | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  contractMetadata?: {
    renewalDate?: string | null;
    expirationDate?: string | null;
    noticeDeadlineDate?: string | null;
    autoRenewal?: boolean | null;
    contractValueAmount?: number | null;
    contractValueCurrency?: string | null;
  } | null;
};

export type CalculatedSaasRiskFinding = {
  findingType: SaasRiskFindingType;
  severity: SaasRiskSeverity;
  evidence: Record<string, string | number | boolean | null>;
};

export type SaasMetadataConflict = {
  field: SaasConflictField;
  contractValue: string | number | boolean | null;
  saasValue: string | number | boolean | null;
  severity: SaasRiskSeverity;
  recommendedTrustedSource: SaasTrustedSource;
  recommendationReason: string;
};

export type SaasConflictField =
  | "renewal_date"
  | "expiration_date"
  | "notice_deadline_date"
  | "auto_renewal"
  | "contract_value_amount"
  | "contract_value_currency";
export type SaasTrustedSource = "contract_metadata" | "saas_term" | "manual_override";
export type SaasConflictResolutionInput = {
  fieldName: SaasConflictField;
  trustedSource: SaasTrustedSource;
  manualOverride?: string | number | boolean | null;
  resolutionReason?: string | null;
  resolvedByUserId?: string | null;
  resolvedByLabel?: string | null;
  resolvedAt?: string | null;
  reopenedAt?: string | null;
};
export type ResolvedSaasTrustedField = {
  field: SaasConflictField;
  contractValue: string | number | boolean | null;
  saasValue: string | number | boolean | null;
  effectiveValue: string | number | boolean | null;
  trustedSource: SaasTrustedSource;
  resolved: boolean;
  resolutionReason: string | null;
  resolvedByUserId: string | null;
  resolvedByLabel: string | null;
  resolvedAt: string | null;
  explanation: string;
};
export const SAAS_CONFLICT_FIELDS: SaasConflictField[] = [
  "renewal_date",
  "expiration_date",
  "notice_deadline_date",
  "auto_renewal",
  "contract_value_amount",
  "contract_value_currency"
];

const HIGH_SPEND_AT_RISK_THRESHOLD = 25000;
const WEAK_EVIDENCE_THRESHOLD = 0.75;

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function calculateNoticeDeadline(input: SaasTermInput) {
  if (input.noticeDeadlineDate) {
    return input.noticeDeadlineDate.slice(0, 10);
  }

  const anchor = parseDateOnly(input.renewalDate) ?? parseDateOnly(input.expirationDate);
  if (!anchor || !input.noticePeriodValue || !input.noticePeriodUnit) {
    return null;
  }

  const value = Math.abs(input.noticePeriodValue);
  if (input.noticePeriodUnit === "days") {
    return formatDateOnly(addUtcDays(anchor, -value));
  }

  if (input.noticePeriodUnit === "weeks") {
    return formatDateOnly(addUtcDays(anchor, -value * 7));
  }

  return formatDateOnly(addUtcMonths(anchor, -value));
}

export function daysUntilOptOut(deadline: string | null | undefined, today = formatDateOnly(new Date())) {
  const deadlineDate = parseDateOnly(deadline);
  const todayDate = parseDateOnly(today);
  if (!deadlineDate || !todayDate) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((deadlineDate.getTime() - todayDate.getTime()) / msPerDay);
}

export function getOptOutUrgency(
  deadline: string | null | undefined,
  today?: string
): OptOutUrgency | null {
  const days = daysUntilOptOut(deadline, today);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= 14) return "critical";
  if (days <= 30) return "high";
  if (days <= 60) return "medium";
  return "low";
}

export function getOptOutDeadlineWindow(
  deadline: string | null | undefined,
  today?: string
): OptOutDeadlineWindow {
  const days = daysUntilOptOut(deadline, today);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= 7) return "due_7_days";
  if (days <= 30) return "due_30_days";
  if (days <= 60) return "due_60_days";
  return "future";
}

function normalizeDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function normalizedMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

export function classifySaasMetadataConflictSeverity(field: SaasConflictField): SaasRiskSeverity {
  if (field === "notice_deadline_date" || field === "auto_renewal") return "high";
  if (field === "renewal_date" || field === "contract_value_amount" || field === "contract_value_currency") return "medium";
  return "low";
}

export function deriveRecommendedSaasTrustedSource(conflict: {
  field: SaasConflictField;
  contractValue: string | number | boolean | null;
  saasValue: string | number | boolean | null;
}): { trustedSource: SaasTrustedSource; reason: string } {
  if (conflict.field === "notice_deadline_date" || conflict.field === "renewal_date" || conflict.field === "expiration_date") {
    return {
      trustedSource: "contract_metadata",
      reason: "Contract metadata is the primary reviewed renewal evidence for date fields."
    };
  }

  if (conflict.field === "contract_value_amount" || conflict.field === "contract_value_currency") {
    return {
      trustedSource: "contract_metadata",
      reason: "Contract metadata is the reviewed commercial source unless finance explicitly overrides it."
    };
  }

  return {
    trustedSource: "contract_metadata",
    reason: "Auto-renewal should default to reviewed contract metadata until an operator records a manual trust decision."
  };
}

function buildSaasMetadataConflict(input: {
  field: SaasConflictField;
  contractValue: string | number | boolean | null;
  saasValue: string | number | boolean | null;
}): SaasMetadataConflict {
  const recommendation = deriveRecommendedSaasTrustedSource(input);
  return {
    ...input,
    severity: classifySaasMetadataConflictSeverity(input.field),
    recommendedTrustedSource: recommendation.trustedSource,
    recommendationReason: recommendation.reason
  };
}

export function detectSaasContractMetadataConflicts(input: {
  saas: SaasTermInput & {
    contractValueAmount?: number | null;
    contractValueCurrency?: string | null;
  };
  contractMetadata?: SaasRiskFindingInput["contractMetadata"];
}): SaasMetadataConflict[] {
  const metadata = input.contractMetadata;
  if (!metadata) return [];

  const comparisons: SaasMetadataConflict[] = [
    buildSaasMetadataConflict({
      field: "renewal_date",
      contractValue: normalizeDate(metadata.renewalDate),
      saasValue: normalizeDate(input.saas.renewalDate)
    }),
    buildSaasMetadataConflict({
      field: "expiration_date",
      contractValue: normalizeDate(metadata.expirationDate),
      saasValue: normalizeDate(input.saas.expirationDate)
    }),
    buildSaasMetadataConflict({
      field: "notice_deadline_date",
      contractValue: normalizeDate(metadata.noticeDeadlineDate),
      saasValue: normalizeDate(calculateNoticeDeadline(input.saas))
    }),
    buildSaasMetadataConflict({
      field: "auto_renewal",
      contractValue: metadata.autoRenewal ?? null,
      saasValue: input.saas.autoRenewal ?? null
    }),
    buildSaasMetadataConflict({
      field: "contract_value_amount",
      contractValue: normalizedMoney(metadata.contractValueAmount),
      saasValue: normalizedMoney(input.saas.contractValueAmount)
    }),
    buildSaasMetadataConflict({
      field: "contract_value_currency",
      contractValue: metadata.contractValueCurrency?.toUpperCase() ?? null,
      saasValue: input.saas.contractValueCurrency?.toUpperCase() ?? null
    })
  ];

  return comparisons.filter((comparison) =>
    comparison.contractValue !== null &&
    comparison.saasValue !== null &&
    comparison.contractValue !== comparison.saasValue
  );
}

export function resolveSaasTrustedField(input: {
  conflict: Pick<SaasMetadataConflict, "field" | "contractValue" | "saasValue" | "recommendedTrustedSource">;
  resolution?: SaasConflictResolutionInput | null;
}): ResolvedSaasTrustedField {
  const activeResolution = input.resolution?.reopenedAt ? null : input.resolution;
  if (!activeResolution) {
    const trustedSource = input.conflict.recommendedTrustedSource;
    return {
      field: input.conflict.field,
      contractValue: input.conflict.contractValue,
      saasValue: input.conflict.saasValue,
      effectiveValue: trustedSource === "saas_term" ? input.conflict.saasValue : input.conflict.contractValue,
      trustedSource,
      resolved: false,
      resolutionReason: null,
      resolvedByUserId: null,
      resolvedByLabel: null,
      resolvedAt: null,
      explanation: "Unresolved conflict; showing the recommended source until a reviewer records a trust decision."
    };
  }

  const effectiveValue =
    activeResolution.trustedSource === "manual_override"
      ? activeResolution.manualOverride ?? null
      : activeResolution.trustedSource === "saas_term"
        ? input.conflict.saasValue
        : input.conflict.contractValue;

  return {
    field: input.conflict.field,
    contractValue: input.conflict.contractValue,
    saasValue: input.conflict.saasValue,
    effectiveValue,
    trustedSource: activeResolution.trustedSource,
    resolved: true,
    resolutionReason: activeResolution.resolutionReason ?? null,
    resolvedByUserId: activeResolution.resolvedByUserId ?? null,
    resolvedByLabel: activeResolution.resolvedByLabel ?? null,
    resolvedAt: activeResolution.resolvedAt ?? null,
    explanation:
      activeResolution.trustedSource === "manual_override"
        ? "Manual override is trusted because a reviewer recorded an explicit resolution reason."
        : `${activeResolution.trustedSource.replace("_", " ")} is trusted by recorded conflict resolution.`
  };
}

export function explainSaasTrustedValue(input: ResolvedSaasTrustedField) {
  const field = input.field.replaceAll("_", " ");
  const source = input.trustedSource.replace("_", " ");
  if (!input.resolved) {
    return `${field} uses ${source} recommendation only: ${input.explanation} Contract value: ${String(input.contractValue)}. SaaS value: ${String(input.saasValue)}.`;
  }
  const actor = input.resolvedByLabel ?? input.resolvedByUserId ?? "recorded reviewer";
  const resolvedAt = input.resolvedAt ? ` on ${input.resolvedAt.slice(0, 10)}` : "";
  const reason = input.resolutionReason ? ` Reason: ${input.resolutionReason}` : "";
  return `${field} uses ${source}: ${input.explanation} Resolved by ${actor}${resolvedAt}.${reason} Contract value: ${String(input.contractValue)}. SaaS value: ${String(input.saasValue)}.`;
}

export function deriveSaasOptOutWorkflowStatus(input: {
  noticeDeadline: string | null;
  ownerUserId?: string | null;
  openFindingTypes?: SaasRiskFindingType[];
  currentStatus?: SaasOptOutWorkflowStatus | null;
  today?: string;
}): SaasOptOutWorkflowStatus {
  if (input.currentStatus && ["resolved", "accepted_risk", "ignored"].includes(input.currentStatus)) {
    return input.currentStatus;
  }

  const findingTypes = new Set(input.openFindingTypes ?? []);
  if (!input.noticeDeadline || findingTypes.has("missing_notice_deadline") || findingTypes.has("weak_evidence") || findingTypes.has("contract_saas_metadata_conflict")) {
    return "needs_review";
  }
  if (!input.ownerUserId || findingTypes.has("missing_owner")) {
    return "owner_assigned";
  }
  const window = getOptOutDeadlineWindow(input.noticeDeadline, input.today);
  if (window === "expired" || window === "due_7_days" || window === "due_30_days") {
    return "decision_needed";
  }
  return "ready";
}

export function buildSafeSaasRenewalDefenseAuditMetadata(input: {
  organizationId: string;
  actorUserId?: string | null;
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
  fromStatus?: string | null;
  toStatus?: string | null;
  deadlineWindow?: OptOutDeadlineWindow | null;
  amount?: number | null;
  currency?: string | null;
}) {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    contractId: input.contractId ?? null,
    softwareId: input.softwareId ?? null,
    saasTermId: input.saasTermId ?? null,
    optOutWindowId: input.optOutWindowId ?? null,
    importBatchId: input.importBatchId ?? null,
    importRowId: input.importRowId ?? null,
    rowNumber: input.rowNumber ?? null,
    issueCodes: input.issueCodes ?? [],
    findingId: input.findingId ?? null,
    fieldName: input.fieldName ?? null,
    trustedSource: input.trustedSource ?? null,
    hasManualOverride: Boolean(input.hasManualOverride),
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    deadlineWindow: input.deadlineWindow ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null
  };
}

export function calculateSaasContractRiskFindings(
  input: SaasRiskFindingInput
): CalculatedSaasRiskFinding[] {
  const noticeDeadline = calculateNoticeDeadline(input);
  const deadlineWindow = getOptOutDeadlineWindow(noticeDeadline, input.today);
  const conflicts = detectSaasContractMetadataConflicts({
    saas: {
      renewalDate: input.renewalDate,
      expirationDate: input.expirationDate,
      noticeDeadlineDate: input.noticeDeadlineDate,
      noticePeriodValue: input.noticePeriodValue,
      noticePeriodUnit: input.noticePeriodUnit,
      autoRenewal: input.autoRenewal,
      contractValueAmount: input.contractValueAmount,
      contractValueCurrency: input.contractValueCurrency
    },
    contractMetadata: input.contractMetadata
  });

  return evaluateSaasRenewalRules({
    noticeDeadline,
    today: input.today,
    autoRenewal: input.autoRenewal,
    ownerUserId: input.ownerUserId,
    evidenceConfidence: input.evidenceConfidence,
    contractValueAmount: input.contractValueAmount,
    contractValueCurrency: input.contractValueCurrency,
    metadataConflictCount: conflicts.length
  })
    .filter((outcome) =>
      outcome.code !== "no_send_boundary" &&
      (outcome.code !== "missing_notice_deadline" || Boolean(input.autoRenewal))
    )
    .map((outcome) => mapSaasRuleOutcomeToFinding(outcome, {
      input,
      noticeDeadline,
      deadlineWindow,
      conflicts
    }))
    .filter((finding): finding is CalculatedSaasRiskFinding => Boolean(finding));
}

function mapSaasRuleOutcomeToFinding(
  outcome: RuleOutcome,
  context: {
    input: SaasRiskFindingInput;
    noticeDeadline: string | null;
    deadlineWindow: OptOutDeadlineWindow;
    conflicts: SaasMetadataConflict[];
  }
): CalculatedSaasRiskFinding | null {
  const findingTypeByCode: Record<string, SaasRiskFindingType> = {
    auto_renewal: "auto_renewal",
    missing_notice_deadline: "missing_notice_deadline",
    expired_opt_out_window: "expired_opt_out",
    critical_opt_out_window: "critical_opt_out",
    deadline_soon: "deadline_soon",
    weak_evidence: "weak_evidence",
    missing_owner: "missing_owner",
    high_spend_at_risk: "high_spend_at_risk",
    metadata_conflict: "contract_saas_metadata_conflict"
  };
  const findingType = findingTypeByCode[outcome.code];
  if (!findingType || outcome.severity === "info") return null;
  const severity = outcome.severity === "low" ? "medium" : outcome.severity;
  const evidenceByFinding: Record<SaasRiskFindingType, CalculatedSaasRiskFinding["evidence"]> = {
    auto_renewal: {
      auto_renewal: true,
      notice_deadline_date: context.noticeDeadline,
      urgency: getOptOutUrgency(context.noticeDeadline, context.input.today)
    },
    missing_notice_deadline: {
      auto_renewal: true,
      renewal_date: context.input.renewalDate ?? null,
      expiration_date: context.input.expirationDate ?? null,
      notice_period_value: context.input.noticePeriodValue ?? null,
      notice_period_unit: context.input.noticePeriodUnit ?? null
    },
    expired_opt_out: {
      notice_deadline_date: context.noticeDeadline,
      days_until_opt_out: daysUntilOptOut(context.noticeDeadline, context.input.today)
    },
    critical_opt_out: {
      notice_deadline_date: context.noticeDeadline,
      days_until_opt_out: daysUntilOptOut(context.noticeDeadline, context.input.today)
    },
    deadline_soon: {
      notice_deadline_date: context.noticeDeadline,
      days_until_opt_out: daysUntilOptOut(context.noticeDeadline, context.input.today),
      deadline_window: context.deadlineWindow
    },
    weak_evidence: {
      evidence_confidence: context.input.evidenceConfidence ?? null,
      threshold: WEAK_EVIDENCE_THRESHOLD
    },
    missing_owner: {
      owner_user_id: null
    },
    high_spend_at_risk: {
      contract_value_amount: Number(context.input.contractValueAmount),
      contract_value_currency: context.input.contractValueCurrency ?? null,
      threshold: HIGH_SPEND_AT_RISK_THRESHOLD,
      deadline_window: context.deadlineWindow
    },
    contract_saas_metadata_conflict: {
      conflict_count: context.conflicts.length,
      first_conflict_field: context.conflicts[0]?.field ?? null
    }
  };

  return {
    findingType,
    severity,
    evidence: evidenceByFinding[findingType]
  };
}
