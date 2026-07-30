import { sanitizeOutreachText } from "@/lib/internal-outreach-intelligence/outreach-safety";
import type { ColdOutreachSuppressionStatus } from "@/lib/internal-outreach-intelligence/cold-outreach-types";
import {
  COLD_OUTREACH_LEAD_STAGES,
  type ColdOutreachActivityEvaluationInput,
  type ColdOutreachActivityEvaluationResult,
  type ColdOutreachCrmActivityMetricInput,
  type ColdOutreachCrmDraftMetricInput,
  type ColdOutreachCrmLeadMetricInput,
  type ColdOutreachCrmMetrics,
  type ColdOutreachLeadStage,
  type ColdOutreachSafeActivityMetadata,
  type ColdOutreachStageTransitionInput,
  type ColdOutreachStageTransitionResult
} from "@/lib/internal-outreach-intelligence/cold-outreach-crm-types";

const ACTIVE_STAGES: ColdOutreachLeadStage[] = [
  "new",
  "qualified",
  "draft_ready",
  "copied_manually",
  "replied",
  "meeting_booked"
];

const TERMINAL_STAGES: ColdOutreachLeadStage[] = ["not_fit", "suppressed", "archived"];

const ALLOWED_STAGE_TRANSITIONS: Record<ColdOutreachLeadStage, ColdOutreachLeadStage[]> = {
  new: ["qualified", "not_fit", "suppressed", "archived"],
  qualified: ["draft_ready", "not_fit", "suppressed", "archived"],
  draft_ready: ["copied_manually", "not_fit", "suppressed", "archived"],
  copied_manually: ["replied", "not_fit", "suppressed", "archived"],
  replied: ["meeting_booked", "not_fit", "suppressed", "archived"],
  meeting_booked: ["not_fit", "suppressed", "archived"],
  not_fit: ["archived"],
  suppressed: ["archived"],
  archived: []
};

const SAFE_METADATA_KEYS = new Set<keyof ColdOutreachSafeActivityMetadata>([
  "organizationId",
  "leadId",
  "draftId",
  "actorUserId",
  "fromStage",
  "toStage",
  "activityType",
  "reasonCode",
  "reasonCodes",
  "suppressionStatus",
  "approvalState",
  "nextAction",
  "nextActionDueAt",
  "manualTouchAt",
  "stageChanged",
  "noteRecorded",
  "count"
]);

const FORBIDDEN_METADATA_KEY_PATTERN =
  /(raw|body|ocr|payload|provider|secret|token|bearer|password|api[_-]?key|storage|path|email|message|contact|phone|linkedin|scraped|content|document)/i;
const FORBIDDEN_METADATA_VALUE_PATTERN =
  /(raw\s+(contract|ocr|payload|document|email|message)|ocr output|provider payload|storage path|uploaded document|full note|secret|token|bearer|password|api[_ -]?key|scraped contact|private email|personal mobile|external delivery provider)/i;

function isSuppressionBlocking(status: ColdOutreachSuppressionStatus | undefined) {
  return status === "suppressed" || status === "opted_out" || status === "complained";
}

function isActiveStage(stage: ColdOutreachLeadStage) {
  return ACTIVE_STAGES.includes(stage);
}

function isValidStage(stage: string): stage is ColdOutreachLeadStage {
  return COLD_OUTREACH_LEAD_STAGES.includes(stage as ColdOutreachLeadStage);
}

function normalizeSafeString(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return null;
  if (FORBIDDEN_METADATA_VALUE_PATTERN.test(value)) return null;
  const sanitized = sanitizeOutreachText(value, maxLength);
  if (!sanitized || sanitized.startsWith("[redacted:")) return null;
  return sanitized;
}

function normalizeReasonCodes(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const reasonCodes = value
    .map((item) => normalizeSafeString(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  return reasonCodes.length ? reasonCodes : undefined;
}

export function sanitizeColdOutreachActivityMetadata(input: Record<string, unknown> = {}): ColdOutreachSafeActivityMetadata {
  const safe: ColdOutreachSafeActivityMetadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key as keyof ColdOutreachSafeActivityMetadata)) continue;
    if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) continue;

    if (key === "reasonCodes") {
      const reasonCodes = normalizeReasonCodes(value);
      if (reasonCodes) safe.reasonCodes = reasonCodes;
      continue;
    }

    if (["stageChanged", "noteRecorded"].includes(key)) {
      if (typeof value === "boolean") safe[key as "stageChanged" | "noteRecorded"] = value;
      continue;
    }

    if (key === "count") {
      if (typeof value === "number" && Number.isFinite(value)) safe.count = Math.max(0, Math.round(value));
      continue;
    }

    const sanitized = normalizeSafeString(value, key === "nextAction" ? 240 : 160);
    if (!sanitized) continue;

    if ((key === "fromStage" || key === "toStage") && !isValidStage(sanitized)) continue;
    safe[key as Exclude<keyof ColdOutreachSafeActivityMetadata, "reasonCodes" | "stageChanged" | "noteRecorded" | "count">] = sanitized as never;
  }

  return safe;
}

export function evaluateColdOutreachStageTransition(
  input: ColdOutreachStageTransitionInput
): ColdOutreachStageTransitionResult {
  const reasonCodes: string[] = [];

  if (input.fromStage === input.toStage) {
    reasonCodes.push("stage_unchanged");
  }

  if (input.fromStage === "archived") {
    reasonCodes.push("archived_stage_is_terminal");
  }

  if (isSuppressionBlocking(input.suppressionStatus) && isActiveStage(input.toStage)) {
    reasonCodes.push("suppression_overrides_active_workflow");
  }

  if (!ALLOWED_STAGE_TRANSITIONS[input.fromStage].includes(input.toStage)) {
    reasonCodes.push("stage_transition_not_allowed");
  }

  if (input.toStage === "copied_manually" && !input.hasApprovedForCopyDraft) {
    reasonCodes.push("approved_for_copy_draft_required");
  }

  return {
    allowed: reasonCodes.length === 0,
    fromStage: input.fromStage,
    toStage: input.toStage,
    resultingStage: reasonCodes.length === 0 ? input.toStage : input.fromStage,
    reasonCodes
  };
}

export function evaluateColdOutreachActivity(input: ColdOutreachActivityEvaluationInput): ColdOutreachActivityEvaluationResult {
  const reasonCodes: string[] = [];
  const activeSuppression = isSuppressionBlocking(input.suppressionStatus);

  if (activeSuppression && input.activityType !== "suppression_added") {
    reasonCodes.push("suppression_overrides_activity");
  }

  if (input.activityType === "draft_copied" && input.draftApprovalState !== "approved_for_copy") {
    reasonCodes.push("approved_for_copy_draft_required");
  }

  if (input.activityType === "manual_send_logged" && !input.performedOutsideNoticeControl) {
    reasonCodes.push("manual_send_must_be_outside_noticecontrol");
  }

  const metadata = sanitizeColdOutreachActivityMetadata({
    ...input.metadata,
    activityType: input.activityType,
    suppressionStatus: input.suppressionStatus ?? null,
    approvalState: input.draftApprovalState ?? null,
    reasonCodes
  });

  return {
    allowed: reasonCodes.length === 0,
    activityType: input.activityType,
    reasonCodes,
    noticeControlSent: false,
    safeMetadata: metadata
  };
}

export function createEmptyColdOutreachCrmMetrics(): ColdOutreachCrmMetrics {
  return {
    leadsByStage: {
      new: 0,
      qualified: 0,
      draft_ready: 0,
      copied_manually: 0,
      replied: 0,
      meeting_booked: 0,
      not_fit: 0,
      suppressed: 0,
      archived: 0
    },
    approvedDraftsForCopy: 0,
    manualSendsLogged: 0,
    repliesLogged: 0,
    meetingsBooked: 0,
    suppressedCount: 0,
    notFitCount: 0
  };
}

export function buildColdOutreachCrmMetrics(input: {
  leads?: ColdOutreachCrmLeadMetricInput[];
  drafts?: ColdOutreachCrmDraftMetricInput[];
  activities?: ColdOutreachCrmActivityMetricInput[];
}): ColdOutreachCrmMetrics {
  const metrics = createEmptyColdOutreachCrmMetrics();

  for (const lead of input.leads ?? []) {
    metrics.leadsByStage[lead.stage] += 1;
    if (lead.stage === "suppressed" || isSuppressionBlocking(lead.suppressionStatus)) {
      metrics.suppressedCount += 1;
    }
    if (lead.stage === "not_fit") {
      metrics.notFitCount += 1;
    }
  }

  for (const draft of input.drafts ?? []) {
    if (draft.approvalState === "approved_for_copy") {
      metrics.approvedDraftsForCopy += 1;
    }
  }

  for (const activity of input.activities ?? []) {
    if (activity.activityType === "manual_send_logged") metrics.manualSendsLogged += 1;
    if (activity.activityType === "reply_received") metrics.repliesLogged += 1;
    if (activity.activityType === "meeting_booked") metrics.meetingsBooked += 1;
  }

  return metrics;
}

export function isColdOutreachTerminalStage(stage: ColdOutreachLeadStage) {
  return TERMINAL_STAGES.includes(stage);
}

export function isColdOutreachSuppressionBlocking(status: ColdOutreachSuppressionStatus | undefined) {
  return isSuppressionBlocking(status);
}
