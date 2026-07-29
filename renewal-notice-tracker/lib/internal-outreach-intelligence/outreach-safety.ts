import { createHash } from "node:crypto";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import type {
  InternalOutreachOpportunity,
  InternalOutreachSuppression,
  OutreachAudience,
  OutreachSafetyEvaluation,
  OutreachSafetyStatus,
  OutreachSuppressionReasonCode
} from "@/lib/internal-outreach-intelligence/outreach-types";
import { OUTREACH_SUPPRESSION_REASON_CODES } from "@/lib/internal-outreach-intelligence/outreach-types";

const SENSITIVE_PATTERNS = [
  /raw\s+(contract|quote|ocr|document|payload|message|email)/i,
  /ocr output/i,
  /provider payload/i,
  /storage path/i,
  /uploaded document/i,
  /full note/i,
  /\b(secret|token|bearer|password|api[_ -]?key)\b/i
];

const DECEPTIVE_PATTERNS = [
  /we spoke/i,
  /as discussed/i,
  /per our conversation/i,
  /you requested/i,
  /guaranteed savings/i,
  /guarantee(d)? discount/i,
  /promise(d)?\s+(roi|savings|discount)/i,
  /will save\s+[$€£]?\d/i
];

const URGENCY_MANIPULATION_PATTERNS = [
  /act now or lose/i,
  /final warning/i,
  /last chance/i,
  /immediate external action/i
];

const UNSAFE_EXTERNAL_DELIVERY_PATTERNS = [
  /\b(send now|auto[- ]?send|deliver externally|smtp|sendgrid|resend|mailgun|postmark)\b/i,
  /\b(send|deliver)\s+(this|the)\s+(email|message|draft)\b/i
];

const UNSCOPED_PERSONAL_DATA_PATTERNS = [
  /personal mobile/i,
  /private email/i,
  /linkedin profile/i,
  /scraped contact/i
];

const EXTERNAL_COLD_AUDIENCES: OutreachAudience[] = ["vendor_contact_placeholder"];

export function normalizeContactIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function hashContactIdentifier(value: string) {
  return createHash("sha256").update(normalizeContactIdentifier(value)).digest("hex");
}

export function containsSensitiveOutreachMarker(value: string) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeOutreachText(value: string | null | undefined, maxLength = 900) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (containsSensitiveOutreachMarker(normalized)) return "[redacted: sensitive source content removed]";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

export function sanitizeOutreachMetadata(input: Record<string, unknown>) {
  return sanitizeQuoteEvidence(input) as Record<string, unknown>;
}

function matchingPhrases(patterns: RegExp[], value: string) {
  return patterns.filter((pattern) => pattern.test(value)).map((pattern) => pattern.source);
}

export function evaluateOutreachSafety(input: {
  audience: OutreachAudience;
  draftText?: string | null;
  hasEvidenceForSavingsClaim?: boolean;
  suppressions?: InternalOutreachSuppression[];
}): OutreachSafetyEvaluation {
  const reasons = new Set<string>();
  const draftText = input.draftText ?? "";
  const blockedPhrases = [
    ...matchingPhrases(SENSITIVE_PATTERNS, draftText),
    ...matchingPhrases(UNSAFE_EXTERNAL_DELIVERY_PATTERNS, draftText),
    ...matchingPhrases(UNSCOPED_PERSONAL_DATA_PATTERNS, draftText)
  ];
  const unsupportedClaims = [
    ...matchingPhrases(DECEPTIVE_PATTERNS, draftText),
    ...matchingPhrases(URGENCY_MANIPULATION_PATTERNS, draftText)
  ];
  if ((input.suppressions ?? []).some((suppression) => isSuppressionActive(suppression))) {
    reasons.add("active_suppression");
  }
  if (EXTERNAL_COLD_AUDIENCES.includes(input.audience)) {
    reasons.add("external_contact_placeholder_requires_review");
  }
  if (containsSensitiveOutreachMarker(draftText)) {
    reasons.add("sensitive_content_marker_detected");
  }
  if (unsupportedClaims.length) {
    reasons.add("unsupported_or_deceptive_claim");
  }
  if (/discount|savings/i.test(draftText) && input.hasEvidenceForSavingsClaim === false) {
    reasons.add("savings_claim_without_evidence");
  }
  if (UNSAFE_EXTERNAL_DELIVERY_PATTERNS.some((pattern) => pattern.test(draftText))) {
    reasons.add("external_send_action_detected");
  }
  if (UNSCOPED_PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(draftText))) {
    reasons.add("unscoped_personal_data_detected");
  }

  const reasonList = Array.from(reasons);
  const status: OutreachSafetyStatus = reasonList.some((reason) =>
    [
      "active_suppression",
      "sensitive_content_marker_detected",
      "unsupported_or_deceptive_claim",
      "external_send_action_detected",
      "unscoped_personal_data_detected"
    ].includes(reason)
  )
    ? "blocked"
    : reasonList.length
      ? "needs_review"
      : "safe";
  return {
    safetyStatus: status,
    safetyReasons: reasonList,
    blockedPhrases,
    unsupportedClaims,
    recommendedFix:
      status === "blocked"
        ? "Remove unsafe claims, raw-source markers, external delivery instructions, and active suppression blockers before approval."
        : status === "needs_review"
          ? "Confirm evidence, audience scope, and reviewer approval before manual copy."
          : null
  };
}

export function isSuppressionActive(suppression: Pick<InternalOutreachSuppression, "expires_at">) {
  if (!suppression.expires_at) return true;
  return new Date(suppression.expires_at).getTime() > Date.now();
}

export function assertNoExternalOutreachSendPath(actionName: string) {
  if (/send|deliver|smtp|provider/i.test(actionName)) {
    return {
      allowed: false,
      reasonCode: "external_send_action_not_supported"
    };
  }
  return { allowed: true, reasonCode: null };
}

export function buildSafeOutreachAuditMetadata(input: {
  opportunity?: Pick<
    InternalOutreachOpportunity,
    | "id"
    | "contract_id"
    | "commercial_decision_id"
    | "negotiation_brief_id"
    | "opportunity_type"
    | "audience"
    | "recommended_channel"
    | "priority"
    | "status"
    | "evidence_confidence"
    | "safety_status"
    | "safety_reasons"
    | "blocker_codes"
    | "warning_codes"
  > | null;
  draftId?: string | null;
  previousStatus?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return sanitizeOutreachMetadata({
    opportunityId: input.opportunity?.id ?? null,
    draftId: input.draftId ?? null,
    contractId: input.opportunity?.contract_id ?? null,
    commercialDecisionId: input.opportunity?.commercial_decision_id ?? null,
    negotiationBriefId: input.opportunity?.negotiation_brief_id ?? null,
    opportunityType: input.opportunity?.opportunity_type ?? null,
    audience: input.opportunity?.audience ?? null,
    channel: input.opportunity?.recommended_channel ?? null,
    priority: input.opportunity?.priority ?? null,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.opportunity?.status ?? null,
    evidenceConfidence: input.opportunity?.evidence_confidence ?? null,
    safetyStatus: input.opportunity?.safety_status ?? null,
    safetyReasons: input.opportunity?.safety_reasons ?? [],
    blockerCodes: input.opportunity?.blocker_codes ?? [],
    warningCodes: input.opportunity?.warning_codes ?? [],
    ...(input.metadata ?? {})
  });
}

export function normalizeOutreachSuppressionReasonCode(value: string): OutreachSuppressionReasonCode {
  return OUTREACH_SUPPRESSION_REASON_CODES.includes(value as OutreachSuppressionReasonCode)
    ? (value as OutreachSuppressionReasonCode)
    : "manually_dismissed";
}

export function isLegalHoldSuppression(suppression: Pick<InternalOutreachSuppression, "reason_code">) {
  return suppression.reason_code === "legal_hold";
}

export function buildSuppressionAuditMetadata(input: {
  suppressionId?: string | null;
  reasonCode: string;
  audience: OutreachAudience;
  expiresAt?: string | null;
  notesPreview?: string | null;
}) {
  return sanitizeOutreachMetadata({
    suppressionId: input.suppressionId ?? null,
    reasonCode: normalizeOutreachSuppressionReasonCode(input.reasonCode),
    audience: input.audience,
    expiresAt: input.expiresAt ?? null,
    notesRecorded: Boolean(input.notesPreview)
  });
}
