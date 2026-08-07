export type DomainEventCategory =
  | "renewal"
  | "saas"
  | "trust"
  | "ai"
  | "rules"
  | "decision"
  | "action"
  | "intelligence";

export type DomainEventName =
  | "renewal.contract_created"
  | "renewal.metadata_extracted"
  | "renewal.metadata_reviewed"
  | "renewal.notice_deadline_changed"
  | "renewal.reminder_created"
  | "renewal.command_center_viewed"
  | "saas.import_batch_created"
  | "saas.import_row_corrected"
  | "saas.import_row_activated"
  | "saas.import_row_dismissed"
  | "saas.metadata_conflict_detected"
  | "saas.metadata_conflict_resolved"
  | "saas.metadata_conflict_reopened"
  | "trust.manual_override_recorded"
  | "trust.weak_evidence_accepted"
  | "trust.overlay_applied"
  | "trust.overlay_reopened"
  | "ai.extraction_completed"
  | "ai.extraction_needs_review"
  | "ai.fact_proposed"
  | "ai.fact_review_required"
  | "rules.evaluation_completed"
  | "rules.action_recommended"
  | "rules.action_blocked"
  | "rules.batch_evaluated"
  | "rules.decision_candidate_created"
  | "decision.opened"
  | "decision.acknowledged"
  | "decision.resolved"
  | "decision.dismissed"
  | "decision.risk_accepted"
  | "decision.reopened"
  | "decision.superseded"
  | "action.proposed"
  | "action.blocked"
  | "action.ready"
  | "action.approved"
  | "action.completed_manually"
  | "action.dismissed"
  | "action.risk_accepted"
  | "action.superseded"
  | "action.reopened"
  | "action.no_send_boundary_checked"
  | "action.no_send_boundary_blocked"
  | "intelligence.summary_generated";

export type DomainEventEntityType =
  | "contract"
  | "contract_metadata"
  | "reminder"
  | "saas_software"
  | "saas_contract_term"
  | "saas_opt_out_window"
  | "saas_import_batch"
  | "saas_import_row"
  | "saas_metadata_conflict_resolution"
  | "ai_extraction"
  | "ai_fact"
  | "rule_evaluation"
  | "decision_record"
  | "governed_action"
  | "organization";

export type SafeDomainEventMetadataValue =
  | string
  | number
  | boolean
  | null
  | SafeDomainEventMetadataValue[]
  | { [key: string]: SafeDomainEventMetadataValue };

export type SafeDomainEventMetadata = Record<string, SafeDomainEventMetadataValue>;

export type DomainEventInput = {
  name: DomainEventName;
  organizationId: string;
  actorUserId?: string | null;
  entityType: DomainEventEntityType;
  entityId?: string | null;
  occurredAt?: string;
  correlationKey?: string | null;
  idempotencyKey?: string | null;
  decisionId?: string | null;
  ruleId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DomainEvent = {
  name: DomainEventName;
  category: DomainEventCategory;
  organizationId: string;
  actorUserId: string | null;
  entityType: DomainEventEntityType;
  entityId: string | null;
  occurredAt: string;
  correlationKey: string | null;
  idempotencyKey: string;
  decisionId: string | null;
  ruleId: string | null;
  source: string | null;
  metadata: SafeDomainEventMetadata;
};
