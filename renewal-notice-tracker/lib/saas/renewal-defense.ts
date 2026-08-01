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
  reopenedAt?: string | null;
};
export type ResolvedSaasTrustedField = {
  field: SaasConflictField;
  effectiveValue: string | number | boolean | null;
  trustedSource: SaasTrustedSource;
  resolved: boolean;
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

function severityForUrgency(urgency: OptOutUrgency): SaasRiskSeverity {
  if (urgency === "expired" || urgency === "critical") return "critical";
  if (urgency === "high") return "high";
  if (urgency === "medium") return "medium";
  return "low";
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
      effectiveValue: trustedSource === "saas_term" ? input.conflict.saasValue : input.conflict.contractValue,
      trustedSource,
      resolved: false,
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
    effectiveValue,
    trustedSource: activeResolution.trustedSource,
    resolved: true,
    explanation:
      activeResolution.trustedSource === "manual_override"
        ? "Manual override is trusted because a reviewer recorded an explicit resolution reason."
        : `${activeResolution.trustedSource.replace("_", " ")} is trusted by recorded conflict resolution.`
  };
}

export function explainSaasTrustedValue(input: ResolvedSaasTrustedField) {
  return `${input.field.replaceAll("_", " ")} uses ${input.trustedSource.replace("_", " ")}${input.resolved ? "" : " recommendation"}: ${input.explanation}`;
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
  const urgency = getOptOutUrgency(noticeDeadline, input.today);
  const deadlineWindow = getOptOutDeadlineWindow(noticeDeadline, input.today);
  const findings: CalculatedSaasRiskFinding[] = [];

  if (input.autoRenewal) {
    findings.push({
      findingType: "auto_renewal",
      severity: urgency ? severityForUrgency(urgency) : "medium",
      evidence: {
        auto_renewal: true,
        notice_deadline_date: noticeDeadline,
        urgency
      }
    });
  }

  if (input.autoRenewal && !noticeDeadline) {
    findings.push({
      findingType: "missing_notice_deadline",
      severity: "high",
      evidence: {
        auto_renewal: true,
        renewal_date: input.renewalDate ?? null,
        expiration_date: input.expirationDate ?? null,
        notice_period_value: input.noticePeriodValue ?? null,
        notice_period_unit: input.noticePeriodUnit ?? null
      }
    });
  }

  if (urgency === "expired") {
    findings.push({
      findingType: "expired_opt_out",
      severity: "critical",
      evidence: {
        notice_deadline_date: noticeDeadline,
        days_until_opt_out: daysUntilOptOut(noticeDeadline, input.today)
      }
    });
  } else if (urgency === "critical") {
    findings.push({
      findingType: "critical_opt_out",
      severity: "critical",
      evidence: {
        notice_deadline_date: noticeDeadline,
        days_until_opt_out: daysUntilOptOut(noticeDeadline, input.today)
      }
    });
  }

  if (deadlineWindow === "due_30_days" || deadlineWindow === "due_60_days") {
    findings.push({
      findingType: "deadline_soon",
      severity: deadlineWindow === "due_30_days" ? "high" : "medium",
      evidence: {
        notice_deadline_date: noticeDeadline,
        days_until_opt_out: daysUntilOptOut(noticeDeadline, input.today),
        deadline_window: deadlineWindow
      }
    });
  }

  if (input.evidenceConfidence !== null && input.evidenceConfidence !== undefined && input.evidenceConfidence < WEAK_EVIDENCE_THRESHOLD) {
    findings.push({
      findingType: "weak_evidence",
      severity: "high",
      evidence: {
        evidence_confidence: input.evidenceConfidence,
        threshold: WEAK_EVIDENCE_THRESHOLD
      }
    });
  }

  if (!input.ownerUserId) {
    findings.push({
      findingType: "missing_owner",
      severity: "medium",
      evidence: {
        owner_user_id: null
      }
    });
  }

  if (Number(input.contractValueAmount ?? 0) >= HIGH_SPEND_AT_RISK_THRESHOLD && noticeDeadline) {
    findings.push({
      findingType: "high_spend_at_risk",
      severity: urgency === "expired" || urgency === "critical" ? "critical" : "high",
      evidence: {
        contract_value_amount: Number(input.contractValueAmount),
        contract_value_currency: input.contractValueCurrency ?? null,
        threshold: HIGH_SPEND_AT_RISK_THRESHOLD,
        deadline_window: deadlineWindow
      }
    });
  }

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
  if (conflicts.length > 0) {
    findings.push({
      findingType: "contract_saas_metadata_conflict",
      severity: "high",
      evidence: {
        conflict_count: conflicts.length,
        first_conflict_field: conflicts[0]?.field ?? null
      }
    });
  }

  return findings;
}
