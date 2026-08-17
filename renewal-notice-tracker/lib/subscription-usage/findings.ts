import type {
  SubscriptionUsageAcceptedAction,
  SubscriptionUsageFinding,
  SubscriptionUsageFindingReviewInput,
  SubscriptionUsageFindingReviewStatus
} from "@/lib/subscription-usage/types";

export type SubscriptionUsageFindingReviewResult =
  | {
      allowed: true;
      findingId: string;
      organizationId: string;
      actorUserId: string;
      reviewStatus: Exclude<SubscriptionUsageFindingReviewStatus, "open">;
      acceptedAction: SubscriptionUsageAcceptedAction | null;
      realizedSavings: number | null;
      auditMetadata: {
        organizationId: string;
        findingId: string;
        actorUserId: string;
        reviewStatus: Exclude<SubscriptionUsageFindingReviewStatus, "open">;
        acceptedAction: SubscriptionUsageAcceptedAction | null;
        hasRealizedSavings: boolean;
        feedbackClassification: "correct" | "incorrect" | "requires_help" | null;
        feedbackReason: string | null;
      };
    }
  | {
      allowed: false;
      reason: "missing_action" | "invalid_realized_savings" | "automatic_cancellation_not_allowed";
      safeMessage: string;
    };

export function prepareSubscriptionUsageFindingReview(
  input: SubscriptionUsageFindingReviewInput
): SubscriptionUsageFindingReviewResult {
  if ((input.nextStatus === "accepted" || input.nextStatus === "action_planned") && !input.acceptedAction) {
    return {
      allowed: false,
      reason: "missing_action",
      safeMessage: "A human-reviewed action is required before accepting a usage optimization finding."
    };
  }

  if (input.acceptedAction === "terminate" && input.nextStatus === "action_planned") {
    return {
      allowed: false,
      reason: "automatic_cancellation_not_allowed",
      safeMessage: "Termination can only be recorded as a human decision; NoticeControl does not cancel subscriptions."
    };
  }

  if (input.realizedSavings !== null && input.realizedSavings !== undefined) {
    if (!Number.isFinite(input.realizedSavings) || input.realizedSavings < 0) {
      return {
        allowed: false,
        reason: "invalid_realized_savings",
        safeMessage: "Realized savings must be a finite non-negative number."
      };
    }
  }

  return {
    allowed: true,
    findingId: input.findingId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    reviewStatus: input.nextStatus,
    acceptedAction: input.acceptedAction ?? null,
    realizedSavings: input.realizedSavings ?? null,
    auditMetadata: {
      organizationId: input.organizationId,
      findingId: input.findingId,
      actorUserId: input.actorUserId,
      reviewStatus: input.nextStatus,
      acceptedAction: input.acceptedAction ?? null,
      hasRealizedSavings: input.realizedSavings !== null && input.realizedSavings !== undefined,
      feedbackClassification: input.feedbackClassification ?? null,
      feedbackReason: input.feedbackReason ?? null
    }
  };
}

export function summarizeSubscriptionUsageFindings(findings: SubscriptionUsageFinding[]) {
  const realFindings = findings.filter((finding) => !finding.warnings.includes("sample_usage_excluded"));
  return {
    openCount: realFindings.filter((finding) => finding.reviewStatus === "open").length,
    acceptedCount: realFindings.filter((finding) => finding.reviewStatus === "accepted").length,
    actionPlannedCount: realFindings.filter((finding) => finding.reviewStatus === "action_planned").length,
    estimatedSavings: realFindings.reduce((total, finding) => total + Math.max(0, finding.estimatedSavings ?? 0), 0),
    currency: realFindings.find((finding) => finding.currency)?.currency ?? null,
    highConfidenceCount: realFindings.filter((finding) => finding.confidence >= 0.8).length
  };
}

export function sanitizeSubscriptionUsageAuditMetadata(metadata: Record<string, unknown>) {
  const safeKeys = new Set([
    "organizationId",
    "actorUserId",
    "batchId",
    "analysisScopeId",
    "rowId",
    "findingId",
    "rowNumber",
    "issueCodes",
    "reviewStatus",
    "acceptedAction",
    "currency",
    "estimatedSavings",
    "realizedSavings",
    "reasonCode",
    "calculationVersion",
    "confidence",
    "hasRealizedSavings",
    "feedbackClassification",
    "feedbackReason",
    "capabilityCategory",
    "taxonomyVersion",
    "involvedProviders"
  ]);
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => safeKeys.has(key) && value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(value)])
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue).filter((item) => item !== undefined);
  if (value && typeof value === "object") return undefined;
  if (typeof value === "string") {
    if (/raw|payload|secret|token|password|contract text|ocr|email body|storage path/i.test(value)) return "[redacted]";
    return value.slice(0, 160);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}
