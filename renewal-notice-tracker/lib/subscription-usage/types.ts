export const SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS = [
  "vendor",
  "product",
  "category",
  "annual_cost",
  "currency",
  "purchased_seats",
  "assigned_seats",
  "active_users_30d",
  "active_users_90d",
  "last_activity_at",
  "department",
  "owner",
  "contract_reference"
] as const;

export type SubscriptionUsageImportHeader = (typeof SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS)[number];

export type SubscriptionUsageEvidenceState = "complete" | "partial" | "missing" | "stale" | "unmapped" | "conflicting";

export type SubscriptionUsageImportRow = Record<SubscriptionUsageImportHeader, string | number | boolean | Date | null | undefined> & {
  warning_codes?: string[];
  evidence_state?: SubscriptionUsageEvidenceState;
};

export type SubscriptionUsageValidationStatus = "ready" | "needs_review" | "rejected";
export type SubscriptionUsageTrustState = "trusted" | "needs_review" | "weak_evidence" | "rejected" | "sample";

export type SubscriptionUsageIssueCode =
  | "missing_vendor"
  | "missing_product"
  | "invalid_annual_cost"
  | "invalid_currency"
  | "missing_purchased_seats"
  | "invalid_purchased_seats"
  | "invalid_assigned_seats"
  | "invalid_active_users_30d"
  | "invalid_active_users_90d"
  | "active_users_exceed_purchased"
  | "invalid_last_activity_at"
  | "missing_source"
  | "duplicate_import_row"
  | "sample_usage";

export type SubscriptionUsageImportIssue = {
  code: SubscriptionUsageIssueCode;
  field: SubscriptionUsageImportHeader | "row";
  severity: "error" | "warning";
  message: string;
};

export type NormalizedSubscriptionUsageRow = {
  vendor: string;
  normalizedVendor: string;
  product: string;
  normalizedProduct: string;
  category: string | null;
  annualCost: number | null;
  currency: string | null;
  purchasedSeats: number | null;
  assignedSeats: number | null;
  activeUsers30d: number | null;
  activeUsers90d: number | null;
  lastActivityAt: string | null;
  department: string | null;
  owner: string | null;
  contractReference: string | null;
  sourceLabel: string;
  collectedAt: string;
  confidence: number;
  trustState: SubscriptionUsageTrustState;
  isSample: boolean;
  sourceRowHash: string;
  warningCodes: string[];
  evidenceState: SubscriptionUsageEvidenceState;
};

export type SubscriptionUsageImportAssessmentRow = {
  rowNumber: number;
  status: SubscriptionUsageValidationStatus;
  issues: SubscriptionUsageImportIssue[];
  normalized: NormalizedSubscriptionUsageRow;
};

export type SubscriptionUsageImportAssessment = {
  rows: SubscriptionUsageImportAssessmentRow[];
  summary: {
    totalRows: number;
    readyCount: number;
    needsReviewCount: number;
    rejectedCount: number;
    duplicateCount: number;
    sampleCount: number;
    estimatedAnnualCost: number;
    currency: string | null;
    partialSuccess: boolean;
  };
};

export type SubscriptionUsageFindingType =
  | "unused_subscription"
  | "low_utilization"
  | "unused_seats"
  | "seat_reduction_candidate"
  | "duplicate_product_contract"
  | "possible_functional_overlap"
  | "high_cost_low_usage"
  | "stale_usage_data"
  | "renewal_decision_required";

export type SubscriptionUsageFindingReviewStatus = "open" | "accepted" | "rejected" | "deferred" | "action_planned";

export type SubscriptionUsageAcceptedAction =
  | "retain"
  | "reduce_seats"
  | "consolidate"
  | "terminate"
  | "renegotiate"
  | "investigate"
  | "insufficient_evidence";

export type SubscriptionUsageFinding = {
  findingType: SubscriptionUsageFindingType;
  reasonCode: string;
  calculationVersion: string;
  sourceRowIds: string[];
  matchedContractIds: string[];
  utilization: number | null;
  unusedSeats: number | null;
  confidence: number;
  warnings: string[];
  estimatedSavings: number | null;
  currency: string | null;
  recommendedAction: SubscriptionUsageAcceptedAction;
  reviewStatus: SubscriptionUsageFindingReviewStatus;
};

export type SubscriptionUsageFindingReviewInput = {
  findingId: string;
  organizationId: string;
  actorUserId: string;
  nextStatus: Exclude<SubscriptionUsageFindingReviewStatus, "open">;
  acceptedAction?: SubscriptionUsageAcceptedAction | null;
  realizedSavings?: number | null;
  feedbackClassification?: "correct" | "incorrect" | "requires_help" | null;
  feedbackReason?:
    | "separate_departments"
    | "compliance_requirement"
    | "migration_in_progress"
    | "backup_requirement"
    | "incorrect_product_mapping"
    | "insufficient_evidence"
    | "other"
    | null;
};
