import type { RuleSeverity } from "@/lib/rules/rule-types";
import type { SafeDomainEventMetadata } from "@/lib/events/domain-event-types";

export type DecisionType =
  | "recommendation"
  | "blocker"
  | "finding"
  | "next_action"
  | "trust_gap"
  | "risk_segment";

export type DecisionStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed"
  | "accepted_risk"
  | "superseded";

export type DecisionSource =
  | "rule"
  | "ai"
  | "import_review"
  | "manual_review"
  | "system";

export type DecisionTrustStatus =
  | "trusted"
  | "proposed"
  | "weak"
  | "conflicted"
  | "blocked";

export type DecisionAction =
  | "acknowledge"
  | "resolve"
  | "dismiss"
  | "accept_risk"
  | "reopen"
  | "supersede"
  | "review_evidence"
  | "assign_owner"
  | "open_source_record";

export type DecisionActorRole =
  | "viewer"
  | "member"
  | "owner"
  | "reviewer"
  | "operator"
  | "admin";

export type DecisionEvidenceRef = {
  code: string;
  source:
    | "contract_metadata"
    | "saas_import"
    | "saas_term"
    | "ai_proposed_fact"
    | "manual_review"
    | "system_rule"
    | "reminder";
  entityType?: string | null;
  entityId?: string | null;
  fieldName?: string | null;
  confidence?: number | null;
  value?: string | number | boolean | null;
};

export type DecisionRecord = {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string | null;
  decisionType: DecisionType;
  title: string;
  summary: string;
  severity: RuleSeverity;
  status: DecisionStatus;
  source: DecisionSource;
  ruleId: string | null;
  aiFactId: string | null;
  confidence: number | null;
  trustStatus: DecisionTrustStatus;
  evidenceRefs: DecisionEvidenceRef[];
  allowedActions: DecisionAction[];
  blockedReason: string | null;
  ownerUserId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  supersededByDecisionId: string | null;
  metadata: SafeDomainEventMetadata;
};

export type DecisionCandidate = Omit<
  DecisionRecord,
  | "id"
  | "status"
  | "resolvedAt"
  | "resolvedByUserId"
  | "createdAt"
  | "updatedAt"
  | "supersededByDecisionId"
  | "metadata"
> & {
  metadata?: Record<string, unknown> | null;
  sourceFingerprint?: string | null;
};

export type DecisionLifecycleAction =
  | "acknowledge"
  | "resolve"
  | "dismiss"
  | "accept_risk"
  | "reopen"
  | "supersede";

export type DecisionLifecycleInput = {
  action: DecisionLifecycleAction;
  actorUserId: string;
  actorRole: DecisionActorRole;
  reason?: string | null;
  now?: string;
  linkedOwnerUserId?: string | null;
  supersededByDecisionId?: string | null;
};
