import type { Json } from "@/lib/supabase/database.types";

export const COMMERCIAL_RECOMMENDED_ACTIONS = [
  "renew",
  "renegotiate",
  "cancel",
  "escalate",
  "defer",
  "needs_review"
] as const;

export const COMMERCIAL_DECISION_STATUSES = [
  "draft",
  "evidence_pending",
  "ready_for_review",
  "in_approval",
  "approved",
  "rejected",
  "finalized",
  "archived"
] as const;

export const NEGOTIATION_POSTURES = [
  "accept_quote",
  "challenge_increase",
  "ask_for_discount",
  "request_term_change",
  "consolidate_vendor",
  "delay_renewal",
  "terminate_service",
  "legal_review_required"
] as const;

export const COMMERCIAL_RISK_LEVELS = ["unknown", "info", "low", "medium", "high", "critical"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled", "skipped"] as const;

export type CommercialRecommendedAction = (typeof COMMERCIAL_RECOMMENDED_ACTIONS)[number];
export type CommercialDecisionStatus = (typeof COMMERCIAL_DECISION_STATUSES)[number];
export type NegotiationPosture = (typeof NEGOTIATION_POSTURES)[number];
export type CommercialRiskLevel = (typeof COMMERCIAL_RISK_LEVELS)[number];
export type CommercialApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type EvidenceConfidence = "missing" | "weak" | "medium" | "strong";
export type ReadinessStatus = "blocked" | "evidence_pending" | "ready_for_review";
export type TrustedReminderReadinessStatus =
  | "not_configured"
  | "configured_ready"
  | "configured_blocked_by_review"
  | "configured_blocked_by_owner"
  | "configured_blocked_by_dates"
  | "not_applicable";

export type CommercialDecisionBlockerCode =
  | "missing_owner"
  | "missing_renewal_date"
  | "missing_quote_comparison"
  | "trusted_reminder_blocked"
  | "approval_required"
  | "expired_notice_deadline";

export type CommercialDecisionWarningCode =
  | "weak_contract_evidence"
  | "critical_quote_finding"
  | "high_savings_opportunity"
  | "quote_not_reviewed"
  | "notice_deadline_near"
  | "missing_notice_deadline"
  | "trusted_reminder_not_configured";

export type CommercialDecisionEvidenceType =
  | "contract_metadata"
  | "contract_extraction_field"
  | "renewal_quote_comparison"
  | "renewal_quote_finding"
  | "savings_opportunity"
  | "trusted_reminder_gate"
  | "renewal_decision"
  | "enterprise_audit_event";

export type CommercialDecision = {
  id: string;
  organization_id: string;
  contract_id: string;
  created_by_user_id: string | null;
  recommended_action: CommercialRecommendedAction;
  decision_status: CommercialDecisionStatus;
  negotiation_posture: NegotiationPosture;
  commercial_risk_level: CommercialRiskLevel;
  evidence_confidence: number;
  estimated_savings_amount: number | null;
  currency: string | null;
  commercial_impact: Json;
  renewal_deadline: string | null;
  notice_deadline: string | null;
  owner_user_id: string | null;
  approver_user_id: string | null;
  decision_summary: string | null;
  blocker_codes: string[];
  warning_codes: string[];
  finalized_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialDecisionEvidenceLink = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  evidence_type: CommercialDecisionEvidenceType;
  evidence_id: string | null;
  evidence_label: string;
  confidence: number | null;
  risk_level: CommercialRiskLevel | null;
  metadata: Json;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialDecisionApprovalStep = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  step_order: number;
  status: CommercialApprovalStatus;
  approver_user_id: string | null;
  acted_by_user_id: string | null;
  reviewer_note: string | null;
  reason_code: string | null;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialDecisionSnapshot = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  created_by_user_id: string | null;
  snapshot_type: string;
  recommended_action: CommercialRecommendedAction;
  decision_status: CommercialDecisionStatus;
  negotiation_posture: NegotiationPosture;
  commercial_risk_level: CommercialRiskLevel;
  evidence_confidence: number;
  estimated_savings_amount: number | null;
  currency: string | null;
  blocker_codes: string[];
  warning_codes: string[];
  evidence_summary: Json;
  audit_snapshot: Json;
  created_at: string;
  updated_at: string;
};

export type CommercialDecisionScoreInput = {
  contract: {
    id: string;
    owner_user_id?: string | null;
    cycle_status?: string | null;
    renewal_decision_status?: string | null;
    contract_metadata?: {
      renewal_date?: string | null;
      notice_deadline_date?: string | null;
      contract_value_amount?: number | null;
      contract_value_currency?: string | null;
      has_weak_evidence?: boolean | null;
      needs_review?: boolean | null;
    } | null;
  };
  acceptedExtractedFields?: Array<{ confidence: number; field_key: string }>;
  quoteComparison?: {
    id: string;
    status: string;
    overall_risk_level: CommercialRiskLevel;
    price_delta_percent: number | null;
    price_delta_amount: number | null;
    currency: string | null;
  } | null;
  quoteFindings?: Array<{
    id: string;
    finding_type: string;
    severity: CommercialRiskLevel;
    confidence: number;
    status: string;
  }>;
  savingsOpportunities?: Array<{
    id: string;
    opportunity_type: string;
    estimated_savings_amount: number | null;
    currency: string | null;
    confidence: number;
    status: string;
  }>;
  trustedReminderGate?: {
    status?: TrustedReminderReadinessStatus | string | null;
    blocked?: boolean;
    blockerCodes?: string[];
    warningCodes?: string[];
  } | null;
  now?: string | Date;
};

export type CommercialDecisionScore = {
  commercialRiskLevel: CommercialRiskLevel;
  recommendedAction: CommercialRecommendedAction;
  negotiationPosture: NegotiationPosture;
  evidenceConfidence: number;
  evidenceConfidenceLabel: EvidenceConfidence;
  estimatedSavingsAmount: number | null;
  currency: string | null;
  renewalDeadline: string | null;
  noticeDeadline: string | null;
  ownerUserId: string | null;
  trustedReminderReadinessStatus: TrustedReminderReadinessStatus;
  blockerCodes: CommercialDecisionBlockerCode[];
  warningCodes: CommercialDecisionWarningCode[];
  readinessStatus: ReadinessStatus;
  decisionStatus: CommercialDecisionStatus;
  decisionSummary: string;
  commercialImpact: Record<string, Json | undefined>;
};
