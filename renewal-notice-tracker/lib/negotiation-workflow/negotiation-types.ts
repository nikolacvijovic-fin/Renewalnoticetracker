import type { Json } from "@/lib/supabase/database.types";

export const NEGOTIATION_BRIEF_STATUSES = [
  "draft",
  "evidence_pending",
  "ready_for_review",
  "in_approval",
  "approved",
  "rejected",
  "archived"
] as const;

export const VENDOR_COMMUNICATION_DRAFT_STATUSES = [
  "draft",
  "ready_for_review",
  "in_approval",
  "approved_for_copy",
  "rejected",
  "archived"
] as const;

export const NEGOTIATION_STRATEGIES = [
  "challenge_price_increase",
  "request_discount",
  "preserve_existing_discount",
  "request_term_change",
  "request_usage_rights_review",
  "consolidate_vendor",
  "ask_for_benchmark",
  "escalate_to_legal",
  "cancel_or_nonrenew",
  "defer_decision"
] as const;

export const VENDOR_COMMUNICATION_CHANNELS = ["email", "internal_note", "call_script"] as const;
export const VENDOR_COMMUNICATION_TONES = ["neutral", "firm", "collaborative", "executive"] as const;
export const NEGOTIATION_APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled", "skipped"] as const;

export type NegotiationBriefStatus = (typeof NEGOTIATION_BRIEF_STATUSES)[number];
export type VendorCommunicationDraftStatus = (typeof VENDOR_COMMUNICATION_DRAFT_STATUSES)[number];
export type NegotiationStrategy = (typeof NEGOTIATION_STRATEGIES)[number];
export type VendorCommunicationChannel = (typeof VENDOR_COMMUNICATION_CHANNELS)[number];
export type VendorCommunicationTone = (typeof VENDOR_COMMUNICATION_TONES)[number];
export type NegotiationApprovalStatus = (typeof NEGOTIATION_APPROVAL_STATUSES)[number];

export type NegotiationBrief = {
  id: string;
  organization_id: string;
  contract_id: string;
  commercial_decision_id: string;
  created_by_user_id: string | null;
  owner_user_id: string | null;
  approver_user_id: string | null;
  status: NegotiationBriefStatus;
  strategy: NegotiationStrategy;
  executive_summary: string;
  target_ask: string;
  fallback_position: string;
  evidence_summary: Json;
  commercial_risk_summary: string;
  savings_argument: string | null;
  deadline_risk: string | null;
  blocker_codes: string[];
  warning_codes: string[];
  review_flags: string[];
  confidence_score: number;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NegotiationBriefEvidenceLink = {
  id: string;
  organization_id: string;
  contract_id: string;
  commercial_decision_id: string;
  negotiation_brief_id: string;
  evidence_type: string;
  evidence_id: string | null;
  evidence_label: string;
  confidence: number | null;
  metadata: Json;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorCommunicationDraft = {
  id: string;
  organization_id: string;
  contract_id: string;
  commercial_decision_id: string;
  negotiation_brief_id: string;
  created_by_user_id: string | null;
  approver_user_id: string | null;
  status: VendorCommunicationDraftStatus;
  channel: VendorCommunicationChannel;
  tone: VendorCommunicationTone;
  subject: string | null;
  draft_body: string;
  internal_reviewer_note: string;
  evidence_trace: Json;
  submitted_at: string | null;
  approved_for_copy_at: string | null;
  rejected_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorCommunicationApprovalStep = {
  id: string;
  organization_id: string;
  contract_id: string;
  commercial_decision_id: string;
  negotiation_brief_id: string;
  vendor_communication_draft_id: string;
  step_order: number;
  status: NegotiationApprovalStatus;
  approver_user_id: string | null;
  acted_by_user_id: string | null;
  reviewer_note: string | null;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NegotiationPlaybookItem = {
  id: string;
  organization_id: string;
  contract_id: string;
  commercial_decision_id: string;
  negotiation_brief_id: string | null;
  created_by_user_id: string | null;
  title: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type NegotiationBriefBuildResult = {
  status: NegotiationBriefStatus;
  strategy: NegotiationStrategy;
  executiveSummary: string;
  targetAsk: string;
  fallbackPosition: string;
  evidenceSummary: Record<string, Json | undefined>;
  commercialRiskSummary: string;
  savingsArgument: string | null;
  deadlineRisk: string | null;
  blockerCodes: string[];
  warningCodes: string[];
  reviewFlags: string[];
  confidenceScore: number;
};

export type VendorCommunicationDraftResult = {
  channel: VendorCommunicationChannel;
  tone: VendorCommunicationTone;
  subject: string | null;
  draftBody: string;
  internalReviewerNote: string;
  evidenceTrace: Record<string, Json | undefined>;
};
