import type { DecisionActorRole, DecisionEvidenceRef, DecisionSource, DecisionTrustStatus } from "@/lib/decision-intelligence/decision-types";
import type { SafeDomainEventMetadata } from "@/lib/events/domain-event-types";
import type { RuleSeverity } from "@/lib/rules/rule-types";

export type GovernedActionType =
  | "review_notice_deadline"
  | "resolve_metadata_conflict"
  | "review_ai_fact"
  | "accept_weak_evidence"
  | "correct_import_row"
  | "activate_import_row"
  | "assign_owner"
  | "record_manual_opt_out_decision"
  | "mark_notice_sent_manually"
  | "record_vendor_reply"
  | "book_renewal_review"
  | "dismiss_duplicate_import"
  | "accept_renewal_risk"
  | "resolve_risk_finding"
  | "update_next_action";

export type GovernedActionStatus =
  | "proposed"
  | "blocked"
  | "ready"
  | "approved"
  | "completed_manually"
  | "dismissed"
  | "accepted_risk"
  | "superseded";

export type GovernedActionSource = DecisionSource | "decision" | "manual";
export type GovernedActionRequiredRole = "reviewer" | "operator" | "admin" | "owner";

export type GovernedActionTransition =
  | "block"
  | "mark_ready"
  | "approve"
  | "complete_manually"
  | "dismiss"
  | "accept_risk"
  | "supersede"
  | "reopen";

export type GovernedActionEvidenceRequirement = {
  code: string;
  label: string;
  required: boolean;
};

export type GovernedActionRecord = {
  id: string;
  organizationId: string;
  decisionId: string | null;
  entityType: string;
  entityId: string | null;
  actionType: GovernedActionType;
  title: string;
  summary: string;
  status: GovernedActionStatus;
  source: GovernedActionSource;
  severity: RuleSeverity;
  trustStatus: DecisionTrustStatus;
  requiredRole: GovernedActionRequiredRole;
  ownerUserId: string | null;
  approverUserId: string | null;
  approvedAt: string | null;
  completedByUserId: string | null;
  completedAt: string | null;
  dueAt: string | null;
  blockedReason: string | null;
  requiredEvidence: GovernedActionEvidenceRequirement[];
  evidenceRefs: DecisionEvidenceRef[];
  allowedTransitions: GovernedActionTransition[];
  supersededByActionId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: SafeDomainEventMetadata;
};

export type GovernedActionCandidate = Omit<
  GovernedActionRecord,
  | "id"
  | "status"
  | "approverUserId"
  | "approvedAt"
  | "completedByUserId"
  | "completedAt"
  | "supersededByActionId"
  | "createdAt"
  | "updatedAt"
  | "metadata"
> & {
  status?: GovernedActionStatus;
  metadata?: Record<string, unknown> | null;
  sourceFingerprint?: string | null;
};

export type GovernedActionPolicyContext = {
  actorRole: DecisionActorRole;
  actorUserId: string;
  linkedOwnerUserId?: string | null;
  importRowStatus?: "ready" | "corrected" | "needs_review" | "rejected" | "activated" | "dismissed" | string | null;
  aiFactReviewedByUserId?: string | null;
  aiFactSource?: "ai" | "human" | "system" | string | null;
  explicitManualOutsideNoticeControlConfirmation?: boolean;
  evidenceCodes?: string[];
  reason?: string | null;
};

export type GovernedActionPolicyResult = {
  allowed: boolean;
  status: "ready" | "blocked" | "requires_approval";
  reasonCodes: string[];
  customerSafeMessage: string;
};

export type GovernedActionLifecycleInput = {
  transition: GovernedActionTransition;
  actorUserId: string;
  actorRole: DecisionActorRole;
  reason?: string | null;
  now?: string;
  linkedOwnerUserId?: string | null;
  importRowStatus?: GovernedActionPolicyContext["importRowStatus"];
  aiFactReviewedByUserId?: string | null;
  explicitManualOutsideNoticeControlConfirmation?: boolean;
  evidenceCodes?: string[];
  supersededByActionId?: string | null;
};
