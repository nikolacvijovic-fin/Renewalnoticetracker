import type { ColdOutreachApprovalState, ColdOutreachSuppressionStatus } from "@/lib/internal-outreach-intelligence/cold-outreach-types";

export const COLD_OUTREACH_LEAD_STAGES = [
  "new",
  "qualified",
  "draft_ready",
  "copied_manually",
  "replied",
  "meeting_booked",
  "not_fit",
  "suppressed",
  "archived"
] as const;

export const COLD_OUTREACH_ACTIVITY_TYPES = [
  "draft_copied",
  "manual_send_logged",
  "reply_received",
  "meeting_booked",
  "disqualified",
  "suppression_added",
  "stage_changed",
  "next_action_updated"
] as const;

export type ColdOutreachLeadStage = (typeof COLD_OUTREACH_LEAD_STAGES)[number];
export type ColdOutreachActivityType = (typeof COLD_OUTREACH_ACTIVITY_TYPES)[number];

export type ColdOutreachSafeActivityMetadata = {
  organizationId?: string | null;
  leadId?: string | null;
  draftId?: string | null;
  actorUserId?: string | null;
  fromStage?: ColdOutreachLeadStage | null;
  toStage?: ColdOutreachLeadStage | null;
  activityType?: ColdOutreachActivityType | null;
  reasonCode?: string | null;
  reasonCodes?: string[];
  suppressionStatus?: ColdOutreachSuppressionStatus | null;
  approvalState?: ColdOutreachApprovalState | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  manualTouchAt?: string | null;
  stageChanged?: boolean;
  noteRecorded?: boolean;
  count?: number;
};

export type ColdOutreachStageTransitionInput = {
  fromStage: ColdOutreachLeadStage;
  toStage: ColdOutreachLeadStage;
  suppressionStatus?: ColdOutreachSuppressionStatus;
  hasApprovedForCopyDraft?: boolean;
};

export type ColdOutreachStageTransitionResult = {
  allowed: boolean;
  fromStage: ColdOutreachLeadStage;
  toStage: ColdOutreachLeadStage;
  resultingStage: ColdOutreachLeadStage;
  reasonCodes: string[];
};

export type ColdOutreachActivityEvaluationInput = {
  activityType: ColdOutreachActivityType;
  currentStage: ColdOutreachLeadStage;
  suppressionStatus?: ColdOutreachSuppressionStatus;
  draftApprovalState?: ColdOutreachApprovalState | null;
  performedOutsideNoticeControl?: boolean;
  metadata?: Record<string, unknown>;
};

export type ColdOutreachActivityEvaluationResult = {
  allowed: boolean;
  activityType: ColdOutreachActivityType;
  reasonCodes: string[];
  noticeControlSent: false;
  safeMetadata: ColdOutreachSafeActivityMetadata;
};

export type ColdOutreachCrmLeadMetricInput = {
  stage: ColdOutreachLeadStage;
  suppressionStatus?: ColdOutreachSuppressionStatus;
};

export type ColdOutreachCrmDraftMetricInput = {
  approvalState: ColdOutreachApprovalState;
};

export type ColdOutreachCrmActivityMetricInput = {
  activityType: ColdOutreachActivityType;
};

export type ColdOutreachCrmMetrics = {
  leadsByStage: Record<ColdOutreachLeadStage, number>;
  approvedDraftsForCopy: number;
  manualSendsLogged: number;
  repliesLogged: number;
  meetingsBooked: number;
  suppressedCount: number;
  notFitCount: number;
};
