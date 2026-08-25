export const EVIDENCE_REQUIREMENT_STATES = [
  "verified",
  "present_unreviewed",
  "missing",
  "stale",
  "conflicting",
  "insufficient",
  "not_applicable"
] as const;

export const EVIDENCE_READINESS_STATES = [
  "blocked",
  "incomplete",
  "review_required",
  "decision_ready"
] as const;

export const EVIDENCE_DECISION_PROFILES = [
  "renewal_triage",
  "renew_unchanged",
  "reduce_seats",
  "renegotiate",
  "consolidate",
  "terminate",
  "replace_vendor"
] as const;

export const EVIDENCE_CATEGORIES = [
  "contract_identity",
  "renewal_timing",
  "financial",
  "usage_optimization",
  "ownership",
  "renewal_quote",
  "decision_approval"
] as const;

export type EvidenceRequirementState = (typeof EVIDENCE_REQUIREMENT_STATES)[number];
export type EvidenceReadinessState = (typeof EVIDENCE_READINESS_STATES)[number];
export type EvidenceDecisionProfile = (typeof EVIDENCE_DECISION_PROFILES)[number];
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export type EvidenceSourceReference = {
  sourceType:
    | "contract_file"
    | "reviewed_contract_metadata"
    | "contract_citation"
    | "provider_usage_snapshot"
    | "usage_row"
    | "product_contract_match"
    | "subscription_finding"
    | "quote_file"
    | "quote_citation"
    | "customer_confirmation"
    | "approval_record";
  sourceRecordId: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  freshnessDate: string | null;
};

export type EvidenceObservation = {
  state: EvidenceRequirementState;
  source?: EvidenceSourceReference | null;
  explanation?: string;
  recommendedAction?: string;
};

export type EvidenceRequirementDefinition = {
  key: string;
  label: string;
  category: EvidenceCategory;
  weight: number;
  criticalByDefault: boolean;
  defaultAction: string;
  profiles?: Partial<Record<EvidenceDecisionProfile, {
    applicable?: boolean;
    critical?: boolean;
  }>>;
};

export type EvidenceReadinessItem = {
  requirementKey: string;
  label: string;
  category: EvidenceCategory;
  state: EvidenceRequirementState;
  weight: number;
  earnedWeight: number;
  critical: boolean;
  evidenceSource: EvidenceSourceReference["sourceType"] | null;
  sourceRecordId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  freshnessDate: string | null;
  explanation: string;
  recommendedAction: string;
  calculationVersion: string;
};

export type EvidenceCategorySummary = {
  category: EvidenceCategory;
  score: number;
  earnedWeight: number;
  applicableWeight: number;
  blockerCount: number;
};

export type EvidenceReadinessAssessment = {
  organizationId: string;
  contractId: string;
  decisionProfile: EvidenceDecisionProfile;
  score: number;
  readinessState: EvidenceReadinessState;
  items: EvidenceReadinessItem[];
  categories: EvidenceCategorySummary[];
  criticalBlockers: EvidenceReadinessItem[];
  missingEvidence: EvidenceReadinessItem[];
  staleEvidence: EvidenceReadinessItem[];
  conflictingEvidence: EvidenceReadinessItem[];
  verifiedEvidence: EvidenceReadinessItem[];
  nextRecommendedAction: string;
  evidenceHash: string;
  calculatedAt: string;
  calculationVersion: string;
};

export type EvidenceReadinessFacts = Partial<Record<string, EvidenceObservation>>;

