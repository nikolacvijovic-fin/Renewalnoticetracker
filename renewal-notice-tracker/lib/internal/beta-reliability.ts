export const BETA_ACTIVATION_STAGES = [
  "signed_up",
  "uploaded_contract",
  "extraction_completed",
  "reviewed_deadline",
  "assigned_owner",
  "reminder_enabled_or_tested",
  "calendar_exported",
  "decision_recorded",
  "activated"
] as const;

export type BetaActivationStage = (typeof BETA_ACTIVATION_STAGES)[number];

export const BETA_STUCK_REASONS = [
  "no_contract_uploaded",
  "extraction_failed",
  "deadline_needs_review",
  "no_owner_assigned",
  "reminder_email_not_configured",
  "no_decision_recorded",
  "urgent_deadline_unresolved"
] as const;

export type BetaStuckReason = (typeof BETA_STUCK_REASONS)[number];

export const BETA_RELIABILITY_EVENT_CONTRACTS = [
  "beta.organization_signed_up",
  "beta.activation_step_completed",
  "beta.activation_stalled",
  "beta.upload_failed",
  "beta.extraction_failed",
  "beta.reminder_failed",
  "beta.email_test_failed",
  "beta.help_requested",
  "beta.support_note_resolved"
] as const;

export type BetaReliabilityEventName = (typeof BETA_RELIABILITY_EVENT_CONTRACTS)[number];

export type BetaOrganizationReliabilityMetrics = {
  contractCount: number;
  pdfUploadCount: number;
  extractionSuccessCount: number;
  extractionFailureCount: number;
  contractsNeedingReviewCount: number;
  trustedNoticeDeadlinesCount: number;
  urgentDeadlineCount: number;
  ownerAssignmentCount: number;
  reminderEmailSuccessCount: number;
  reminderEmailFailureCount: number;
  calendarExportCount: number;
  decisionCount: number;
  lowConfidenceCriticalFieldCount?: number;
  failedUploadCount?: number;
  ocrFailureCount?: number;
  skippedReminderCount?: number;
  duplicateReminderConflictCount?: number;
  sampleContractCount?: number;
  sampleExploredCount?: number;
  sampleDiagnosticIssueCount?: number;
  lastActivityAt?: string | null;
};

export type BetaOrganizationReliabilityInput = {
  organizationId: string;
  organizationName: string;
  createdAt: string;
  metrics: BetaOrganizationReliabilityMetrics;
};

export type FounderAssistAction = {
  label: string;
  href: string;
  reason: BetaStuckReason | "healthy";
};

export type BetaOrganizationReliabilitySummary = {
  organizationId: string;
  organizationName: string;
  createdAt: string;
  currentStage: BetaActivationStage;
  completedSteps: BetaActivationStage[];
  activationCompletionPercent: number;
  stuckReason: BetaStuckReason | null;
  nextRecommendedFounderAction: string;
  assistActions: FounderAssistAction[];
  metrics: Required<BetaOrganizationReliabilityMetrics>;
};

export type FounderBetaReliabilityDashboard = {
  generatedAt: string;
  organizations: BetaOrganizationReliabilitySummary[];
  feedback: FounderBetaFeedbackSummary;
  totals: {
    organizationCount: number;
    activatedCount: number;
    stalledCount: number;
    extractionFailureCount: number;
    reminderEmailFailureCount: number;
    contractsNeedingReviewCount: number;
    urgentDeadlineCount: number;
  };
};

export type CustomerFeedbackSummaryRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  contractId: string | null;
  entityType: string | null;
  entityId: string | null;
  submittedByUserId: string;
  feedbackType: string;
  severity: string;
  status: string;
  messagePreview: string;
  createdAt: string;
};

export type FounderBetaFeedbackSummary = {
  openCount: number;
  urgentCount: number;
  byType: Record<string, number>;
  byOrganization: Record<string, number>;
  latest: CustomerFeedbackSummaryRow[];
};

const ZERO_METRICS: Required<BetaOrganizationReliabilityMetrics> = {
  contractCount: 0,
  pdfUploadCount: 0,
  extractionSuccessCount: 0,
  extractionFailureCount: 0,
  contractsNeedingReviewCount: 0,
  trustedNoticeDeadlinesCount: 0,
  urgentDeadlineCount: 0,
  ownerAssignmentCount: 0,
  reminderEmailSuccessCount: 0,
  reminderEmailFailureCount: 0,
  calendarExportCount: 0,
  decisionCount: 0,
  lowConfidenceCriticalFieldCount: 0,
  failedUploadCount: 0,
  ocrFailureCount: 0,
  skippedReminderCount: 0,
  duplicateReminderConflictCount: 0,
  sampleContractCount: 0,
  sampleExploredCount: 0,
  sampleDiagnosticIssueCount: 0,
  lastActivityAt: null
};

const SUPPORT_NOTE_METADATA_ALLOWLIST = new Set([
  "organizationId",
  "contractId",
  "status",
  "issueType",
  "failureCode",
  "failureCategory",
  "stage",
  "count",
  "createdAt",
  "updatedAt",
  "deadlineWindow",
  "activationStage",
  "stuckReason",
  "reminderStatus",
  "ocrStatus"
]);

const FORBIDDEN_KEY_PATTERN =
  /(raw|body|text|clause|ocr|payload|secret|token|password|private|note|email_body|storage|path|provider_response|assertion|debug|file_content)/i;

const SENSITIVE_VALUE_PATTERN =
  /(raw contract|full contract|ocr output|provider payload|private note|secret_|token_|bearer\s+[a-z0-9._-]+|-----BEGIN|storage\/|\.pdf\b|email body)/gi;
const SENSITIVE_VALUE_TEST_PATTERN =
  /(raw contract|full contract|ocr output|provider payload|private note|secret_|token_|bearer\s+[a-z0-9._-]+|-----BEGIN|storage\/|\.pdf\b|email body)/i;

function safeCount(value: number | undefined) {
  const count = value ?? 0;
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.trunc(count);
}

function normalizeMetrics(metrics: BetaOrganizationReliabilityMetrics): Required<BetaOrganizationReliabilityMetrics> {
  return {
    ...ZERO_METRICS,
    ...metrics,
    contractCount: safeCount(metrics.contractCount),
    pdfUploadCount: safeCount(metrics.pdfUploadCount),
    extractionSuccessCount: safeCount(metrics.extractionSuccessCount),
    extractionFailureCount: safeCount(metrics.extractionFailureCount),
    contractsNeedingReviewCount: safeCount(metrics.contractsNeedingReviewCount),
    trustedNoticeDeadlinesCount: safeCount(metrics.trustedNoticeDeadlinesCount),
    urgentDeadlineCount: safeCount(metrics.urgentDeadlineCount),
    ownerAssignmentCount: safeCount(metrics.ownerAssignmentCount),
    reminderEmailSuccessCount: safeCount(metrics.reminderEmailSuccessCount),
    reminderEmailFailureCount: safeCount(metrics.reminderEmailFailureCount),
    calendarExportCount: safeCount(metrics.calendarExportCount),
    decisionCount: safeCount(metrics.decisionCount),
    lowConfidenceCriticalFieldCount: safeCount(metrics.lowConfidenceCriticalFieldCount),
    failedUploadCount: safeCount(metrics.failedUploadCount),
    ocrFailureCount: safeCount(metrics.ocrFailureCount),
    skippedReminderCount: safeCount(metrics.skippedReminderCount),
    duplicateReminderConflictCount: safeCount(metrics.duplicateReminderConflictCount),
    sampleContractCount: safeCount(metrics.sampleContractCount),
    sampleExploredCount: safeCount(metrics.sampleExploredCount),
    sampleDiagnosticIssueCount: safeCount(metrics.sampleDiagnosticIssueCount),
    lastActivityAt: metrics.lastActivityAt ?? null
  };
}

function getCompletedSteps(metrics: Required<BetaOrganizationReliabilityMetrics>) {
  const completed: BetaActivationStage[] = ["signed_up"];

  if (metrics.contractCount > 0 || metrics.pdfUploadCount > 0) completed.push("uploaded_contract");
  if (metrics.extractionSuccessCount > 0) completed.push("extraction_completed");
  if (metrics.trustedNoticeDeadlinesCount > 0) completed.push("reviewed_deadline");
  if (metrics.ownerAssignmentCount > 0) completed.push("assigned_owner");
  if (metrics.reminderEmailSuccessCount > 0) completed.push("reminder_enabled_or_tested");
  if (metrics.calendarExportCount > 0) completed.push("calendar_exported");
  if (metrics.decisionCount > 0) completed.push("decision_recorded");

  const activated =
    metrics.trustedNoticeDeadlinesCount > 0 &&
    metrics.ownerAssignmentCount > 0 &&
    metrics.reminderEmailSuccessCount > 0 &&
    metrics.decisionCount > 0;

  if (activated) completed.push("activated");
  return completed;
}

function getStuckReason(metrics: Required<BetaOrganizationReliabilityMetrics>): BetaStuckReason | null {
  if (metrics.contractCount === 0 && metrics.pdfUploadCount === 0) return "no_contract_uploaded";
  if (metrics.extractionFailureCount > 0 && metrics.extractionSuccessCount === 0) return "extraction_failed";
  if (
    metrics.contractsNeedingReviewCount > 0 ||
    metrics.lowConfidenceCriticalFieldCount > 0 ||
    metrics.trustedNoticeDeadlinesCount === 0
  ) {
    return "deadline_needs_review";
  }
  if (metrics.ownerAssignmentCount === 0) return "no_owner_assigned";
  if (metrics.reminderEmailSuccessCount === 0) return "reminder_email_not_configured";
  if (metrics.decisionCount === 0) return "no_decision_recorded";
  if (metrics.urgentDeadlineCount > 0) return "urgent_deadline_unresolved";
  return null;
}

function getNextFounderAction(reason: BetaStuckReason | null) {
  switch (reason) {
    case "no_contract_uploaded":
      return "Help the customer upload their first contract PDF.";
    case "extraction_failed":
      return "Open the failed extraction and guide manual metadata entry.";
    case "deadline_needs_review":
      return "Point the customer to review and trust the notice deadline.";
    case "no_owner_assigned":
      return "Ask the customer to assign an internal owner for the renewal.";
    case "reminder_email_not_configured":
      return "Verify reminder email setup or ask the customer to send a test reminder.";
    case "no_decision_recorded":
      return "Prompt the customer to record the first renewal decision.";
    case "urgent_deadline_unresolved":
      return "Check the urgent contract and help resolve the missed or upcoming deadline.";
    default:
      return "No immediate founder action needed.";
  }
}

function buildAssistActions(organizationId: string, reason: BetaStuckReason | null): FounderAssistAction[] {
  const safeOrganizationId = encodeURIComponent(organizationId);
  return [
    {
      label: "Open internal ops",
      href: `/internal/ops?organizationId=${safeOrganizationId}`,
      reason: reason ?? "healthy"
    },
    {
      label: "Open audit trail",
      href: `/admin/audit?organizationId=${safeOrganizationId}`,
      reason: reason ?? "healthy"
    }
  ];
}

export function buildBetaOrganizationReliabilitySummary(
  input: BetaOrganizationReliabilityInput
): BetaOrganizationReliabilitySummary {
  const metrics = normalizeMetrics(input.metrics);
  const completedSteps = getCompletedSteps(metrics);
  const currentStage = completedSteps[completedSteps.length - 1] ?? "signed_up";
  const stuckReason = getStuckReason(metrics);

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    createdAt: input.createdAt,
    currentStage,
    completedSteps,
    activationCompletionPercent: Math.round((completedSteps.length / BETA_ACTIVATION_STAGES.length) * 100),
    stuckReason,
    nextRecommendedFounderAction: getNextFounderAction(stuckReason),
    assistActions: buildAssistActions(input.organizationId, stuckReason),
    metrics
  };
}

export function buildFounderBetaReliabilityDashboard(
  inputs: BetaOrganizationReliabilityInput[],
  feedbackRowsOrGeneratedAt: CustomerFeedbackSummaryRow[] | string = [],
  generatedAt = new Date().toISOString()
): FounderBetaReliabilityDashboard {
  const feedbackRows = Array.isArray(feedbackRowsOrGeneratedAt) ? feedbackRowsOrGeneratedAt : [];
  const resolvedGeneratedAt = typeof feedbackRowsOrGeneratedAt === "string" ? feedbackRowsOrGeneratedAt : generatedAt;
  const organizations = inputs
    .map(buildBetaOrganizationReliabilitySummary)
    .sort((left, right) => {
      if (left.stuckReason && !right.stuckReason) return -1;
      if (!left.stuckReason && right.stuckReason) return 1;
      const leftActivity = left.metrics.lastActivityAt ?? left.createdAt;
      const rightActivity = right.metrics.lastActivityAt ?? right.createdAt;
      return rightActivity.localeCompare(leftActivity);
    });

  return {
    generatedAt: resolvedGeneratedAt,
    organizations,
    feedback: buildFounderBetaFeedbackSummary(feedbackRows),
    totals: {
      organizationCount: organizations.length,
      activatedCount: organizations.filter((organization) => organization.currentStage === "activated").length,
      stalledCount: organizations.filter((organization) => organization.stuckReason !== null).length,
      extractionFailureCount: organizations.reduce(
        (sum, organization) => sum + organization.metrics.extractionFailureCount,
        0
      ),
      reminderEmailFailureCount: organizations.reduce(
        (sum, organization) => sum + organization.metrics.reminderEmailFailureCount,
        0
      ),
      contractsNeedingReviewCount: organizations.reduce(
        (sum, organization) => sum + organization.metrics.contractsNeedingReviewCount,
        0
      ),
      urgentDeadlineCount: organizations.reduce((sum, organization) => sum + organization.metrics.urgentDeadlineCount, 0)
    }
  };
}

export function buildFounderBetaFeedbackSummary(rows: CustomerFeedbackSummaryRow[]): FounderBetaFeedbackSummary {
  const safeRows = rows.map((row) => ({
    ...row,
    messagePreview: sanitizeBetaSupportNoteText(row.messagePreview).slice(0, 240)
  }));
  const activeRows = safeRows.filter((row) => row.status === "open" || row.status === "in_review");

  return {
    openCount: activeRows.length,
    urgentCount: activeRows.filter((row) => row.severity === "urgent").length,
    byType: activeRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.feedbackType] = (counts[row.feedbackType] ?? 0) + 1;
      return counts;
    }, {}),
    byOrganization: activeRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.organizationName] = (counts[row.organizationName] ?? 0) + 1;
      return counts;
    }, {}),
    latest: safeRows
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 10)
  };
}

export type BetaSupportNoteStatus = "open" | "resolved";

export type BetaSupportNoteInput = {
  organizationId: string;
  contractId?: string | null;
  issueType: string;
  safeNote: string;
  createdByUserId: string;
  status?: BetaSupportNoteStatus;
  metadata?: Record<string, unknown>;
};

export type BetaSupportNoteInsert = {
  organization_id: string;
  contract_id: string | null;
  status: BetaSupportNoteStatus;
  issue_type: string;
  safe_note: string;
  created_by_user_id: string;
  metadata_json: Record<string, unknown>;
};

export function sanitizeBetaSupportNoteText(value: string) {
  return value
    .replace(SENSITIVE_VALUE_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export function sanitizeBetaSupportNoteMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SUPPORT_NOTE_METADATA_ALLOWLIST.has(key) || FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (entry === null || typeof entry === "boolean" || typeof entry === "number") {
      output[key] = entry;
      continue;
    }
    if (typeof entry === "string") {
      if (SENSITIVE_VALUE_TEST_PATTERN.test(entry)) continue;
      output[key] = entry.slice(0, 160);
    }
  }

  return output;
}

export function buildBetaSupportNoteInsert(input: BetaSupportNoteInput): BetaSupportNoteInsert {
  const safeNote = sanitizeBetaSupportNoteText(input.safeNote);
  if (!input.organizationId.trim()) {
    throw new Error("organization_id_required");
  }
  if (!input.createdByUserId.trim()) {
    throw new Error("created_by_user_id_required");
  }
  if (!input.issueType.trim()) {
    throw new Error("issue_type_required");
  }
  if (!safeNote) {
    throw new Error("safe_note_required");
  }

  return {
    organization_id: input.organizationId,
    contract_id: input.contractId ?? null,
    status: input.status ?? "open",
    issue_type: input.issueType.trim().slice(0, 80),
    safe_note: safeNote,
    created_by_user_id: input.createdByUserId,
    metadata_json: sanitizeBetaSupportNoteMetadata(input.metadata)
  };
}
