import type { Json } from "@/lib/supabase/database.types";

export const OUTREACH_OPPORTUNITY_TYPES = [
  "renewal_risk",
  "price_increase",
  "savings_opportunity",
  "vendor_consolidation",
  "stakeholder_review",
  "legal_review",
  "finance_review",
  "procurement_review",
  "expansion_signal",
  "churn_prevention",
  "contract_cleanup",
  "negotiation_follow_up"
] as const;

export const OUTREACH_OPPORTUNITY_STATUSES = [
  "draft",
  "evidence_pending",
  "ready_for_review",
  "in_approval",
  "approved_for_copy",
  "dismissed",
  "archived"
] as const;

export const OUTREACH_DRAFT_STATUSES = [
  "draft",
  "ready_for_review",
  "in_approval",
  "approved_for_copy",
  "rejected",
  "archived"
] as const;

export const OUTREACH_AUDIENCES = [
  "internal_owner",
  "finance",
  "procurement",
  "legal",
  "executive_sponsor",
  "customer_success",
  "account_manager",
  "vendor_contact_placeholder",
  "stakeholder_group"
] as const;

export const OUTREACH_CHANNELS = [
  "internal_email",
  "internal_note",
  "slack_draft",
  "call_script",
  "meeting_agenda",
  "crm_note"
] as const;

export const OUTREACH_SAFETY_STATUSES = ["safe", "needs_review", "blocked"] as const;
export const OUTREACH_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const OUTREACH_TONES = ["concise", "executive", "collaborative", "firm", "procurement", "customer_success", "legal"] as const;
export const OUTREACH_APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled", "skipped"] as const;
export const OUTREACH_SUPPRESSION_REASON_CODES = [
  "no_outreach_requested",
  "vendor_contact_unavailable",
  "internal_owner_unassigned",
  "legal_hold",
  "customer_sensitive",
  "duplicate_opportunity",
  "already_in_negotiation",
  "manually_dismissed",
  "compliance_blocked"
] as const;

export type OutreachOpportunityType = (typeof OUTREACH_OPPORTUNITY_TYPES)[number];
export type OutreachOpportunityStatus = (typeof OUTREACH_OPPORTUNITY_STATUSES)[number];
export type OutreachDraftStatus = (typeof OUTREACH_DRAFT_STATUSES)[number];
export type OutreachAudience = (typeof OUTREACH_AUDIENCES)[number];
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];
export type OutreachSafetyStatus = (typeof OUTREACH_SAFETY_STATUSES)[number];
export type OutreachPriority = (typeof OUTREACH_PRIORITIES)[number];
export type OutreachTone = (typeof OUTREACH_TONES)[number];
export type OutreachApprovalStatus = (typeof OUTREACH_APPROVAL_STATUSES)[number];
export type OutreachSuppressionReasonCode = (typeof OUTREACH_SUPPRESSION_REASON_CODES)[number];

export type OutreachPriorityBand = OutreachPriority | "blocked";

export type OutreachPriorityScore = {
  priorityScore: number;
  priorityBand: OutreachPriorityBand;
  urgencyReason: string;
  commercialReason: string;
  nextBestAction: string;
  confidenceScore: number;
  scoringBreakdown: Record<string, number>;
};

export type OutreachResolvedAudienceRole =
  | "contract_owner"
  | "decision_owner"
  | "approver"
  | "procurement_reviewer"
  | "finance_reviewer"
  | "legal_reviewer"
  | "executive_sponsor"
  | "customer_success_owner"
  | "account_manager"
  | "vendor_contact_placeholder";

export type OutreachAudienceResolution = {
  audienceRole: OutreachResolvedAudienceRole;
  audienceLabel: string;
  userId: string | null;
  contactIdentifierHash: string | null;
  resolutionConfidence: number;
  blockerCodes: string[];
  warningCodes: string[];
};

export type OutreachSequenceStepType =
  | "internal_owner_note"
  | "finance_review_note"
  | "procurement_review_note"
  | "legal_review_note"
  | "executive_escalation_note"
  | "vendor_draft_prepare"
  | "meeting_agenda_prepare"
  | "crm_note_prepare"
  | "follow_up_reminder";

export type OutreachSequenceStep = {
  stepOrder: number;
  stepType: OutreachSequenceStepType;
  audience: OutreachAudience;
  channel: OutreachChannel;
  purpose: string;
  dueDate: string | null;
  prerequisites: string[];
  approvalRequired: boolean;
  copyAllowed: boolean;
  blockerCodes: string[];
};

export type OutreachSequencePlan = {
  steps: OutreachSequenceStep[];
  blockerCodes: string[];
};

export type OutreachCrmNote = {
  crmNoteTitle: string;
  crmNoteBodyPreview: string;
  relatedContractId: string | null;
  relatedDecisionId: string | null;
  relatedOpportunityId: string;
  commercialTrigger: string;
  recommendedNextStep: string;
  evidenceReferences: string[];
  ownerUserId: string | null;
  dueDate: string | null;
  priorityBand: OutreachPriorityBand;
  syncStatus: "not_configured" | "ready_for_manual_copy" | "blocked" | "archived";
};

export type OutreachSafetyEvaluation = {
  safetyStatus: OutreachSafetyStatus;
  safetyReasons: string[];
  blockedPhrases: string[];
  unsupportedClaims: string[];
  recommendedFix: string | null;
};

export type InternalOutreachOpportunity = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  commercial_decision_id: string | null;
  negotiation_brief_id: string | null;
  created_by_user_id: string | null;
  owner_user_id: string | null;
  approver_user_id: string | null;
  opportunity_type: OutreachOpportunityType;
  status: OutreachOpportunityStatus;
  priority: OutreachPriority;
  audience: OutreachAudience;
  recommended_channel: OutreachChannel;
  reason_summary: string;
  expected_commercial_impact: Json;
  evidence_confidence: number;
  due_date: string | null;
  renewal_deadline: string | null;
  blocker_codes: string[];
  warning_codes: string[];
  safety_status: OutreachSafetyStatus;
  safety_reasons: string[];
  submitted_at: string | null;
  approved_for_copy_at: string | null;
  dismissed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalOutreachEvidenceLink = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  commercial_decision_id: string | null;
  negotiation_brief_id: string | null;
  opportunity_id: string;
  evidence_type: string;
  evidence_id: string | null;
  evidence_label: string;
  confidence: number | null;
  metadata: Json;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalOutreachDraft = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  opportunity_id: string;
  created_by_user_id: string | null;
  approver_user_id: string | null;
  status: OutreachDraftStatus;
  audience: OutreachAudience;
  channel: OutreachChannel;
  tone: OutreachTone;
  title: string;
  subject_or_heading: string | null;
  body_preview: string;
  key_points: string[];
  evidence_references: string[];
  ask: string;
  next_step: string;
  internal_reviewer_note: string;
  safety_status: OutreachSafetyStatus;
  safety_reasons: string[];
  copy_allowed: boolean;
  submitted_at: string | null;
  approved_for_copy_at: string | null;
  rejected_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalOutreachApprovalStep = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  opportunity_id: string;
  outreach_draft_id: string;
  step_order: number;
  status: OutreachApprovalStatus;
  approver_user_id: string | null;
  acted_by_user_id: string | null;
  reviewer_note: string | null;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalOutreachPlaybookItem = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  opportunity_id: string;
  created_by_user_id: string | null;
  title: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type InternalOutreachSuppression = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  opportunity_id: string | null;
  audience: OutreachAudience;
  contact_identifier_hash: string | null;
  scoped_internal_user_id: string | null;
  reason_code: string;
  notes_preview: string | null;
  suppressed_by_user_id: string | null;
  suppressed_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OutreachOpportunityDetection = {
  opportunityType: OutreachOpportunityType;
  priority: OutreachPriority;
  audience: OutreachAudience;
  recommendedChannel: OutreachChannel;
  reasonSummary: string;
  evidenceConfidence: number;
  expectedCommercialImpact: Record<string, Json | undefined>;
  dueDate: string | null;
  renewalDeadline: string | null;
  blockerCodes: string[];
  warningCodes: string[];
  safetyStatus: OutreachSafetyStatus;
  safetyReasons: string[];
  evidenceLinks: Array<{
    evidenceType: string;
    evidenceId?: string | null;
    evidenceLabel: string;
    confidence?: number | null;
    metadata?: Record<string, unknown>;
  }>;
};

export type OutreachDraftGenerationResult = {
  title: string;
  audience: OutreachAudience;
  channel: OutreachChannel;
  tone: OutreachTone;
  subjectOrHeading: string | null;
  bodyPreview: string;
  keyPoints: string[];
  evidenceReferences: string[];
  ask: string;
  nextStep: string;
  internalReviewerNote: string;
  safetyStatus: OutreachSafetyStatus;
  safetyReasons: string[];
  copyAllowed: boolean;
};
