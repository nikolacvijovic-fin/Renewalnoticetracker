export const INTELLIGENCE_TRUST_LEVELS = [
  "high",
  "medium",
  "low",
  "blocked"
] as const;

export type IntelligenceTrustLevel = (typeof INTELLIGENCE_TRUST_LEVELS)[number];

export const INTELLIGENCE_DATA_QUALITIES = [
  "trusted_workflow_state",
  "review_complete_owner_assigned",
  "review_complete_owner_missing",
  "review_pending",
  "insufficient_p0"
] as const;

export type IntelligenceDataQuality = (typeof INTELLIGENCE_DATA_QUALITIES)[number];

export const INTELLIGENCE_SOURCE_KINDS = [
  "reviewed_p0",
  "contract_metadata",
  "renewal_decision",
  "owner_assignment",
  "reminder_runtime",
  "counterparty_normalization"
] as const;

export type IntelligenceSourceKind = (typeof INTELLIGENCE_SOURCE_KINDS)[number];

export type IntelligenceSource = {
  kind: IntelligenceSourceKind;
  reference: string;
  trusted: boolean;
};

export type IntelligenceCalculationBasis = {
  slug: string;
  description: string;
  usesReviewedTruthOnly: boolean;
  blocksWhenTrustGatesFail: boolean;
};

export type IntelligenceWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type IntelligenceInsight<TOutput extends Record<string, unknown> = Record<string, unknown>> = {
  layer: "financial" | "procurement" | "risk";
  slug: string;
  title: string;
  summary: string;
  trustLevel: IntelligenceTrustLevel;
  confidenceScore: number;
  dataQuality: IntelligenceDataQuality;
  sources: IntelligenceSource[];
  calculationBasis: IntelligenceCalculationBasis;
  warnings: IntelligenceWarning[];
  output: TOutput;
};

export type TrustedWorkflowStateSnapshot = Readonly<{
  organizationId: string;
  contractId: string;
  contractTitle: string;
  counterpartyName: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  terminationWindow: string | null;
  autoRenewal: boolean | null;
  reviewCompleted: boolean;
  ownerAssigned: boolean;
  trustState:
    | "Verified"
    | "Needs Review"
    | "Owner Missing"
    | "Awaiting Acknowledgment"
    | "Decision Needed"
    | "Unverified Risk Accepted"
    | "Conflict Requires Review"
    | "Reminder Delivery Issue"
    | "Overdue Action"
    | "Due Soon"
    | "Superseded by New Version";
  cycleStatus:
    | "open"
    | "awaiting_acknowledgment"
    | "awaiting_decision"
    | "parked"
    | "closed"
    | "reopened"
    | "superseded";
  renewalDecisionStatus:
    | "undecided"
    | "renew"
    | "terminate"
    | "renegotiate"
    | "defer"
    | "no_action_required";
  reminderActivationState:
    | "blocked_by_review"
    | "blocked_by_missing_owner"
    | "blocked_by_missing_p0"
    | "scheduled"
    | "failed"
    | "superseded";
  contractValue: number | null;
  department: string | null;
}>;
