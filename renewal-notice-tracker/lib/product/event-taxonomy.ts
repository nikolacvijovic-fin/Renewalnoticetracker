import type { PlatformModuleId } from "@/lib/product/platform-modules";
import type { SupportSuccessForbiddenRawCustomerData } from "@/lib/product/support-success";

export type ProductEventType =
  | "audit"
  | "analytics"
  | "monitoring"
  | "operational"
  | "billing"
  | "support";

export type ProductEventPrivacySensitivity = "low" | "medium" | "high" | "restricted";

export type ProductEventTaxonomyEntry = {
  name: string;
  type: ProductEventType;
  emittedToday: boolean;
  source: string;
  privacySensitivity: ProductEventPrivacySensitivity;
  safeMetadataFields: readonly string[];
  forbiddenMetadataFields: readonly SupportSuccessForbiddenRawCustomerData[];
  owningProductModule: PlatformModuleId;
  relatedOnboardingMilestones?: readonly string[];
  relatedSupportSignals?: readonly string[];
};

export const PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS = [
  "raw_contract_text",
  "full_notes",
  "note_text",
  "ocr_output",
  "raw_extracted_evidence",
  "provider_payload",
  "payment_provider_payload",
  "storage_path",
  "tokens",
  "secrets",
  "internal_route_secret",
  "full_billing_payload",
  "raw_customer_file",
  "uploaded_document_contents",
  "email_body",
  "debug_trace"
] as const satisfies readonly SupportSuccessForbiddenRawCustomerData[];

const commonSafeMetadata = [
  "organization_id",
  "actor_user_id",
  "request_id",
  "entity_type",
  "entity_id",
  "contract_id",
  "status",
  "failure_code",
  "failure_category",
  "count",
  "created_at",
  "updated_at"
] as const;

const exportSafeMetadata = [
  ...commonSafeMetadata,
  "export_request_id",
  "preset",
  "format",
  "row_count",
  "artifact_size_bytes",
  "included_sections",
  "sensitive_sections_included",
  "preflight_reason"
] as const;

const intelligenceSafeMetadata = [
  ...commonSafeMetadata,
  "surface",
  "layer",
  "scope",
  "risk_band",
  "risk_bands_viewed",
  "contract_count",
  "low_confidence_count",
  "warning_count",
  "calculation_version",
  "input_data_version"
] as const;

const billingSafeMetadata = [
  ...commonSafeMetadata,
  "billing_provider",
  "billing_provider_status",
  "plan_tier",
  "subscription_status",
  "event_type",
  "provider_event_id"
] as const;

const commercialDecisionSafeMetadata = [
  ...commonSafeMetadata,
  "decision_id",
  "contract_id",
  "previous_status",
  "new_status",
  "recommended_action",
  "previous_recommended_action",
  "negotiation_posture",
  "previous_negotiation_posture",
  "commercial_risk_level",
  "evidence_confidence",
  "blocker_codes",
  "warning_codes",
  "estimated_savings_amount",
  "currency",
  "evidence_link_id",
  "evidence_type",
  "snapshot_id",
  "snapshot_type",
  "reviewer_note_recorded",
  "assigned_approver_user_id",
  "acting_approver_user_id",
  "previous_approver_user_id",
  "new_approver_user_id",
  "approval_authority_mode",
  "reason_code",
  "resolution",
  "refreshed_evidence_count",
  "refreshed_evidence_types"
] as const;

const negotiationWorkflowSafeMetadata = [
  ...commonSafeMetadata,
  "brief_id",
  "briefId",
  "draft_id",
  "draftId",
  "commercial_decision_id",
  "commercialDecisionId",
  "contract_id",
  "contractId",
  "strategy",
  "previous_status",
  "previousStatus",
  "new_status",
  "newStatus",
  "confidence_score",
  "confidenceScore",
  "blocker_codes",
  "blockerCodes",
  "warning_codes",
  "warningCodes",
  "approval_actor",
  "approvalActor",
  "reviewer_note_recorded",
  "reviewerNoteRecorded",
  "channel",
  "tone",
  "evidence_count",
  "evidenceCount",
  "playbook_item_id",
  "playbookItemId"
] as const;

const internalOutreachSafeMetadata = [
  ...commonSafeMetadata,
  "opportunity_id",
  "opportunityId",
  "draft_id",
  "draftId",
  "suppression_id",
  "suppressionId",
  "playbook_item_id",
  "playbookItemId",
  "contract_id",
  "contractId",
  "commercial_decision_id",
  "commercialDecisionId",
  "negotiation_brief_id",
  "negotiationBriefId",
  "opportunity_type",
  "opportunityType",
  "audience",
  "channel",
  "priority",
  "previous_status",
  "previousStatus",
  "new_status",
  "newStatus",
  "evidence_confidence",
  "evidenceConfidence",
  "evidence_count",
  "evidenceCount",
  "safety_status",
  "safetyStatus",
  "safety_reasons",
  "safetyReasons",
  "blocker_codes",
  "blockerCodes",
  "warning_codes",
  "warningCodes",
  "reason_code",
  "reasonCode",
  "reviewer_note_recorded",
  "reviewerNoteRecorded",
  "notes_recorded",
  "notesRecorded",
  "approval_actor",
  "approvalActor",
  "draft_status",
  "draftStatus",
  "draft_safety_status",
  "draftSafetyStatus",
  "draft_safety_reasons",
  "draftSafetyReasons",
  "priority_score",
  "priorityScore",
  "priority_band",
  "priorityBand",
  "confidence_score",
  "confidenceScore",
  "audience_role",
  "audienceRole",
  "resolution_confidence",
  "resolutionConfidence",
  "sequence_step_count",
  "sequenceStepCount",
  "sync_status",
  "syncStatus",
  "blocked_phrase_count",
  "blockedPhraseCount",
  "unsupported_claim_count",
  "unsupportedClaimCount",
  "duplicate_of_opportunity_id",
  "duplicateOfOpportunityId",
  "expires_at",
  "expiresAt"
] as const;

function taxonomyEvent(input: Omit<ProductEventTaxonomyEntry, "forbiddenMetadataFields">) {
  return {
    ...input,
    forbiddenMetadataFields: PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS
  } as const;
}

export const PRODUCT_EVENT_TAXONOMY = {
  auth_signup_completed: taxonomyEvent({
    name: "auth_signup_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/settings.ts",
    privacySensitivity: "low",
    safeMetadataFields: ["organization_id", "actor_user_id", "source", "created_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["workspace_created"]
  }),
  "trial.started": taxonomyEvent({
    name: "trial.started",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/settings.ts",
    privacySensitivity: "low",
    safeMetadataFields: ["organization_id", "actor_user_id", "trial_ends_at"],
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["workspace_created", "billing_configured"]
  }),
  "organization.created": taxonomyEvent({
    name: "organization.created",
    type: "audit",
    emittedToday: false,
    source: "future organization lifecycle instrumentation",
    privacySensitivity: "low",
    safeMetadataFields: ["organization_id", "actor_user_id", "created_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["workspace_created"]
  }),
  "organization.member_created": taxonomyEvent({
    name: "organization.member_created",
    type: "audit",
    emittedToday: false,
    source: "future membership lifecycle instrumentation",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "member_user_id", "role"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["workspace_created"]
  }),
  "contract.created": taxonomyEvent({
    name: "contract.created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "source", "contract_type"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contract.manual_created": taxonomyEvent({
    name: "contract.manual_created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "source", "contract_type"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contracts.import_started": taxonomyEvent({
    name: "contracts.import_started",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "import_id", "row_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contracts.imported": taxonomyEvent({
    name: "contracts.imported",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "import_id", "row_count", "failed_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  contract_upload_completed: taxonomyEvent({
    name: "contract_upload_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "source", "processing_status"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_started: taxonomyEvent({
    name: "import_started",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "import_id", "row_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_completed: taxonomyEvent({
    name: "import_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "import_id", "row_count", "created_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_failed: taxonomyEvent({
    name: "import_failed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "import_id", "failure_code"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"],
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  extraction_completed: taxonomyEvent({
    name: "extraction_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "processing_status"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  extraction_failed: taxonomyEvent({
    name: "extraction_failed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "failure_code"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  "contract.review_updated": taxonomyEvent({
    name: "contract.review_updated",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "review_status", "reviewed_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_reviewed"]
  }),
  contract_review_completed: taxonomyEvent({
    name: "contract_review_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "review_status"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_reviewed"]
  }),
  contract_owner_assigned: taxonomyEvent({
    name: "contract_owner_assigned",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "owner_user_id"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_owner_assigned"],
    relatedSupportSignals: ["contracts_without_owner"]
  }),
  "reminder.created": taxonomyEvent({
    name: "reminder.created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "reminder_date"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  "reminder.blocked": taxonomyEvent({
    name: "reminder.blocked",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "blocking_reason_code"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_scheduled: taxonomyEvent({
    name: "reminder_scheduled",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "reminder_id"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  "reminder.trusted": taxonomyEvent({
    name: "reminder.trusted",
    type: "audit",
    emittedToday: false,
    source: "future explicit trusted-reminder activation audit; current evidence is reminder.created plus trusted reminder state",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "trusted_at"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"],
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  "reminder.activated": taxonomyEvent({
    name: "reminder.activated",
    type: "audit",
    emittedToday: false,
    source: "future explicit reminder activation audit; current evidence is reminder.created plus reminder status queries",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "activated_at"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"],
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_claimed: taxonomyEvent({
    name: "reminder_claimed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "lease_started_at"],
    owningProductModule: "reminder_workflow_automation"
  }),
  reminder_sent: taxonomyEvent({
    name: "reminder_sent",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts and lib/actions/contracts/legacy.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "delivery_provider", "recipient_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  reminder_failed: taxonomyEvent({
    name: "reminder_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "attempt_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_retry_scheduled: taxonomyEvent({
    name: "reminder_retry_scheduled",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "next_attempt_at", "attempt_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_terminal_failed: taxonomyEvent({
    name: "reminder_terminal_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "attempt_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_stale_rescued: taxonomyEvent({
    name: "reminder_stale_rescued",
    type: "monitoring",
    emittedToday: true,
    source: "lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "stale_age_minutes"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_dispatch_failed: taxonomyEvent({
    name: "reminder_dispatch_failed",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/cron/send-reminders/route.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "route"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  "trusted_reminder_delivery.enqueued": taxonomyEvent({
    name: "trusted_reminder_delivery.enqueued",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "reminder_id", "idempotency_key"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  "trusted_reminder_delivery.claimed": taxonomyEvent({
    name: "trusted_reminder_delivery.claimed",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "worker_id", "attempt_count"],
    owningProductModule: "reminder_workflow_automation"
  }),
  "trusted_reminder_delivery.sent": taxonomyEvent({
    name: "trusted_reminder_delivery.sent",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "reminder_id", "delivery_count", "duplicate_suppressed_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  "trusted_reminder_delivery.retry_scheduled": taxonomyEvent({
    name: "trusted_reminder_delivery.retry_scheduled",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "attempt_count", "next_retry_at"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  "trusted_reminder_delivery.dead_lettered": taxonomyEvent({
    name: "trusted_reminder_delivery.dead_lettered",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "attempt_count"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  "trusted_reminder_delivery.cancelled": taxonomyEvent({
    name: "trusted_reminder_delivery.cancelled",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "reason_code"],
    owningProductModule: "reminder_workflow_automation"
  }),
  "trusted_reminder_delivery.blocked_by_gate": taxonomyEvent({
    name: "trusted_reminder_delivery.blocked_by_gate",
    type: "audit",
    emittedToday: true,
    source: "lib/background-jobs/job-queue.ts and lib/notifications/reminders.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "job_type", "reminder_id", "blocker_code"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  "contract_extraction.requested": taxonomyEvent({
    name: "contract_extraction.requested",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/extraction-runs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "run_id", "contract_file_id", "provider", "extraction_mode"],
    owningProductModule: "ocr_import_intelligence"
  }),
  "contract_extraction.completed": taxonomyEvent({
    name: "contract_extraction.completed",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/extraction-runs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [
      ...commonSafeMetadata,
      "run_id",
      "provider",
      "extraction_mode",
      "field_keys",
      "confidence_values",
      "overall_confidence",
      "warning_codes"
    ],
    owningProductModule: "ocr_import_intelligence"
  }),
  "contract_extraction.failed": taxonomyEvent({
    name: "contract_extraction.failed",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/extraction-runs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "run_id", "failure_code", "safe_error_message"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["import_or_extraction_failures"]
  }),
  "contract_extracted_field.accepted": taxonomyEvent({
    name: "contract_extracted_field.accepted",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/extraction-runs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "run_id", "field_id", "field_key", "confidence", "warning_codes", "reviewer_id"],
    owningProductModule: "ocr_import_intelligence"
  }),
  "contract_extracted_field.rejected": taxonomyEvent({
    name: "contract_extracted_field.rejected",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/extraction-runs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "run_id", "field_id", "field_key", "confidence", "warning_codes", "reviewer_id"],
    owningProductModule: "ocr_import_intelligence"
  }),
  "contract_extracted_fields.applied_to_metadata": taxonomyEvent({
    name: "contract_extracted_fields.applied_to_metadata",
    type: "audit",
    emittedToday: true,
    source: "lib/contract-intelligence/apply-extracted-fields.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "field_ids", "field_keys", "confidence_values", "weak_evidence", "needs_review", "reviewer_id"],
    owningProductModule: "ocr_import_intelligence"
  }),
  "renewal_quote_comparison.created": taxonomyEvent({
    name: "renewal_quote_comparison.created",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "comparison_id", "quote_file_id", "source"],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "renewal_quote_comparison.completed": taxonomyEvent({
    name: "renewal_quote_comparison.completed",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [
      ...commonSafeMetadata,
      "comparison_id",
      "finding_ids",
      "risk_level",
      "price_delta_percent",
      "warning_codes"
    ],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "renewal_quote_comparison.failed": taxonomyEvent({
    name: "renewal_quote_comparison.failed",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "comparison_id", "failure_code", "warning_codes"],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "renewal_quote_finding.reviewed": taxonomyEvent({
    name: "renewal_quote_finding.reviewed",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [
      ...commonSafeMetadata,
      "finding_id",
      "comparison_id",
      "finding_type",
      "decision",
      "confidence"
    ],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "savings_opportunity.created": taxonomyEvent({
    name: "savings_opportunity.created",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [
      ...commonSafeMetadata,
      "opportunity_id",
      "finding_id",
      "comparison_id",
      "estimated_savings_amount",
      "confidence"
    ],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "savings_opportunity.dismissed": taxonomyEvent({
    name: "savings_opportunity.dismissed",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "opportunity_id", "comparison_id", "estimated_savings_amount", "confidence"],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "savings_opportunity.realized": taxonomyEvent({
    name: "savings_opportunity.realized",
    type: "audit",
    emittedToday: true,
    source: "lib/quote-comparison/quote-comparison.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "opportunity_id", "comparison_id", "estimated_savings_amount", "confidence"],
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.created": taxonomyEvent({
    name: "commercial_decision.created",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.recomputed": taxonomyEvent({
    name: "commercial_decision.recomputed",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.submitted_for_review": taxonomyEvent({
    name: "commercial_decision.submitted_for_review",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.approved": taxonomyEvent({
    name: "commercial_decision.approved",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.rejected": taxonomyEvent({
    name: "commercial_decision.rejected",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.finalized": taxonomyEvent({
    name: "commercial_decision.finalized",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.archived": taxonomyEvent({
    name: "commercial_decision.archived",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.recommended_action_changed": taxonomyEvent({
    name: "commercial_decision.recommended_action_changed",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.negotiation_posture_changed": taxonomyEvent({
    name: "commercial_decision.negotiation_posture_changed",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.evidence_attached": taxonomyEvent({
    name: "commercial_decision.evidence_attached",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.evidence_refreshed": taxonomyEvent({
    name: "commercial_decision.evidence_refreshed",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.snapshot_created": taxonomyEvent({
    name: "commercial_decision.snapshot_created",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.approver_reassigned": taxonomyEvent({
    name: "commercial_decision.approver_reassigned",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.approval_blocked": taxonomyEvent({
    name: "commercial_decision.approval_blocked",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "commercial_decision.duplicate_create_resolved": taxonomyEvent({
    name: "commercial_decision.duplicate_create_resolved",
    type: "audit",
    emittedToday: true,
    source: "lib/commercial-decision-workbench/commercial-decision-workbench.ts",
    privacySensitivity: "high",
    safeMetadataFields: commercialDecisionSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.created": taxonomyEvent({
    name: "negotiation_brief.created",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.recomputed": taxonomyEvent({
    name: "negotiation_brief.recomputed",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.submitted_for_review": taxonomyEvent({
    name: "negotiation_brief.submitted_for_review",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.approved": taxonomyEvent({
    name: "negotiation_brief.approved",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.rejected": taxonomyEvent({
    name: "negotiation_brief.rejected",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.archived": taxonomyEvent({
    name: "negotiation_brief.archived",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_brief.evidence_attached": taxonomyEvent({
    name: "negotiation_brief.evidence_attached",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.created": taxonomyEvent({
    name: "vendor_communication_draft.created",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.regenerated": taxonomyEvent({
    name: "vendor_communication_draft.regenerated",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.submitted_for_approval": taxonomyEvent({
    name: "vendor_communication_draft.submitted_for_approval",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.approved_for_copy": taxonomyEvent({
    name: "vendor_communication_draft.approved_for_copy",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.rejected": taxonomyEvent({
    name: "vendor_communication_draft.rejected",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "vendor_communication_draft.archived": taxonomyEvent({
    name: "vendor_communication_draft.archived",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "negotiation_playbook_item.created": taxonomyEvent({
    name: "negotiation_playbook_item.created",
    type: "audit",
    emittedToday: true,
    source: "lib/negotiation-workflow/negotiation-workflow.ts",
    privacySensitivity: "high",
    safeMetadataFields: negotiationWorkflowSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_opportunity.detected": taxonomyEvent({
    name: "internal_outreach_opportunity.detected",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_opportunity.created": taxonomyEvent({
    name: "internal_outreach_opportunity.created",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_opportunity.recomputed": taxonomyEvent({
    name: "internal_outreach_opportunity.recomputed",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_opportunity.dismissed": taxonomyEvent({
    name: "internal_outreach_opportunity.dismissed",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_opportunity.archived": taxonomyEvent({
    name: "internal_outreach_opportunity.archived",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.evidence_attached": taxonomyEvent({
    name: "internal_outreach.evidence_attached",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.created": taxonomyEvent({
    name: "internal_outreach_draft.created",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.regenerated": taxonomyEvent({
    name: "internal_outreach_draft.regenerated",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.submitted_for_approval": taxonomyEvent({
    name: "internal_outreach_draft.submitted_for_approval",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.approved_for_copy": taxonomyEvent({
    name: "internal_outreach_draft.approved_for_copy",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.rejected": taxonomyEvent({
    name: "internal_outreach_draft.rejected",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_draft.archived": taxonomyEvent({
    name: "internal_outreach_draft.archived",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_suppression.created": taxonomyEvent({
    name: "internal_outreach_suppression.created",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach_playbook_item.created": taxonomyEvent({
    name: "internal_outreach_playbook_item.created",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.safety_blocked": taxonomyEvent({
    name: "internal_outreach.safety_blocked",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.priority_scored": taxonomyEvent({
    name: "internal_outreach.priority_scored",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.audience_resolved": taxonomyEvent({
    name: "internal_outreach.audience_resolved",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.sequence_planned": taxonomyEvent({
    name: "internal_outreach.sequence_planned",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.crm_note_generated": taxonomyEvent({
    name: "internal_outreach.crm_note_generated",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.safety_reviewed": taxonomyEvent({
    name: "internal_outreach.safety_reviewed",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "internal_outreach.duplicate_dismissed": taxonomyEvent({
    name: "internal_outreach.duplicate_dismissed",
    type: "audit",
    emittedToday: true,
    source: "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
    privacySensitivity: "high",
    safeMetadataFields: internalOutreachSafeMetadata,
    owningProductModule: "financial_exposure_intelligence"
  }),
  "renewal_decision.created": taxonomyEvent({
    name: "renewal_decision.created",
    type: "audit",
    emittedToday: false,
    source: "future explicit renewal decision audit; current shipped evidence is renewal_decision_recorded",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "decision_status", "decision_date"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_decision_recorded", "renewal_loop_completed"]
  }),
  renewal_decision_recorded: taxonomyEvent({
    name: "renewal_decision_recorded",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/decisions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "decision_status"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_decision_recorded", "renewal_loop_completed"],
    relatedSupportSignals: ["decisions_missing"]
  }),
  "contract.acknowledged": taxonomyEvent({
    name: "contract.acknowledged",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/decisions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "acknowledged_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  "contract.acknowledged_from_email": taxonomyEvent({
    name: "contract.acknowledged_from_email",
    type: "audit",
    emittedToday: true,
    source: "lib/email/actions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "acknowledged_at", "email_action"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  acknowledgment_recorded: taxonomyEvent({
    name: "acknowledgment_recorded",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts/decisions.ts and lib/email/actions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "source"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  "renewal_cycle.updated": taxonomyEvent({
    name: "renewal_cycle.updated",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/decisions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "cycle_status", "previous_cycle_status"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  "cycle.closed": taxonomyEvent({
    name: "cycle.closed",
    type: "audit",
    emittedToday: false,
    source: "future explicit cycle-close instrumentation; current audit action is renewal_cycle.updated",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "cycle_status", "closed_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  "note.created": taxonomyEvent({
    name: "note.created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts/notes.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "note_id", "note_count"],
    owningProductModule: "core_renewal_control_kernel"
  }),
  "contracts.export_denied": taxonomyEvent({
    name: "contracts.export_denied",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/export-route.ts and app/api/exports/contracts/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...exportSafeMetadata, "denied_action", "reason_code"],
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  "contracts.export_attempted": taxonomyEvent({
    name: "contracts.export_attempted",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  "contracts.exported": taxonomyEvent({
    name: "contracts.exported",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  export_requested: taxonomyEvent({
    name: "export_requested",
    type: "analytics",
    emittedToday: true,
    source: "lib/contracts/export-route.ts and app/dashboard/contracts/[id]/ics/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "preset", "format", "row_count"],
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  export_sync_attempted: taxonomyEvent({
    name: "export_sync_attempted",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_sync_completed: taxonomyEvent({
    name: "export_sync_completed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  export_sync_failed: taxonomyEvent({
    name: "export_sync_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  export_sync_rejected: taxonomyEvent({
    name: "export_sync_rejected",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_preflight_rejected: taxonomyEvent({
    name: "export_preflight_rejected",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_too_large: taxonomyEvent({
    name: "export_too_large",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  export_failed: taxonomyEvent({
    name: "export_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/export-route.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  "contracts.export_background_requested": taxonomyEvent({
    name: "contracts.export_background_requested",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  "contracts.export_background_completed": taxonomyEvent({
    name: "contracts.export_background_completed",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  "contracts.export_background_failed": taxonomyEvent({
    name: "contracts.export_background_failed",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  "contracts.export_background_downloaded": taxonomyEvent({
    name: "contracts.export_background_downloaded",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  "contracts.export_background_expired": taxonomyEvent({
    name: "contracts.export_background_expired",
    type: "audit",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_background_requested: taxonomyEvent({
    name: "export_background_requested",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_background_claimed: taxonomyEvent({
    name: "export_background_claimed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...exportSafeMetadata, "job_id"],
    owningProductModule: "export_reporting_intelligence"
  }),
  export_background_completed: taxonomyEvent({
    name: "export_background_completed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedOnboardingMilestones: ["first_export_completed"]
  }),
  export_background_failed: taxonomyEvent({
    name: "export_background_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  export_background_downloaded: taxonomyEvent({
    name: "export_background_downloaded",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_background_download_failed: taxonomyEvent({
    name: "export_background_download_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "high",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  export_background_expired: taxonomyEvent({
    name: "export_background_expired",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence"
  }),
  export_background_cleanup_failed: taxonomyEvent({
    name: "export_background_cleanup_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/contracts/background-exports.ts",
    privacySensitivity: "medium",
    safeMetadataFields: exportSafeMetadata,
    owningProductModule: "export_reporting_intelligence",
    relatedSupportSignals: ["export_failed_repeatedly"]
  }),
  ocr_job_claimed: taxonomyEvent({
    name: "ocr_job_claimed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "lease_started_at"],
    owningProductModule: "ocr_import_intelligence"
  }),
  ocr_job_stale_rescued: taxonomyEvent({
    name: "ocr_job_stale_rescued",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "stale_age_minutes"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  ocr_job_completed: taxonomyEvent({
    name: "ocr_job_completed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "duration_ms"],
    owningProductModule: "ocr_import_intelligence"
  }),
  ocr_job_failed: taxonomyEvent({
    name: "ocr_job_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "attempt_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  ocr_job_retry_scheduled: taxonomyEvent({
    name: "ocr_job_retry_scheduled",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "next_attempt_at"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  ocr_job_terminal_failed: taxonomyEvent({
    name: "ocr_job_terminal_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/ocr/jobs.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "job_id", "contract_id", "attempt_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  "billing.checkout_started": taxonomyEvent({
    name: "billing.checkout_started",
    type: "audit",
    emittedToday: true,
    source: "lib/billing/service.ts",
    privacySensitivity: "medium",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"]
  }),
  billing_checkout_started: taxonomyEvent({
    name: "billing_checkout_started",
    type: "analytics",
    emittedToday: true,
    source: "app/api/billing/checkout/route.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "plan_tier", "billing_provider"],
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"]
  }),
  checkout_completed: taxonomyEvent({
    name: "checkout_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/billing/service.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "plan_tier", "billing_provider", "subscription_status"],
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"]
  }),
  "billing.webhook_synced": taxonomyEvent({
    name: "billing.webhook_synced",
    type: "audit",
    emittedToday: true,
    source: "lib/billing/service.ts",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"],
    relatedSupportSignals: ["billing_exception_needs_followup"]
  }),
  billing_webhook_received: taxonomyEvent({
    name: "billing_webhook_received",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/webhooks/billing/paddle/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control"
  }),
  billing_webhook_succeeded: taxonomyEvent({
    name: "billing_webhook_succeeded",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/webhooks/billing/paddle/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"]
  }),
  billing_webhook_replayed: taxonomyEvent({
    name: "billing_webhook_replayed",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/webhooks/billing/paddle/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control"
  }),
  billing_webhook_failed: taxonomyEvent({
    name: "billing_webhook_failed",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/webhooks/billing/paddle/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control",
    relatedSupportSignals: ["billing_exception_needs_followup"]
  }),
  "billing.provider_exception_configured": taxonomyEvent({
    name: "billing.provider_exception_configured",
    type: "audit",
    emittedToday: false,
    source: "future support-led billing exception instrumentation",
    privacySensitivity: "high",
    safeMetadataFields: billingSafeMetadata,
    owningProductModule: "billing_entitlement_control",
    relatedOnboardingMilestones: ["billing_configured"],
    relatedSupportSignals: ["billing_exception_needs_followup"]
  }),
  "intelligence.financial_viewed": taxonomyEvent({
    name: "intelligence.financial_viewed",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "financial_exposure_intelligence",
    relatedOnboardingMilestones: ["first_intelligence_viewed"]
  }),
  "intelligence.procurement_viewed": taxonomyEvent({
    name: "intelligence.procurement_viewed",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "procurement_vendor_analytics",
    relatedOnboardingMilestones: ["first_intelligence_viewed"]
  }),
  "intelligence.risk_queue_viewed": taxonomyEvent({
    name: "intelligence.risk_queue_viewed",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "contract_intelligence_risk_explanation",
    relatedOnboardingMilestones: ["first_intelligence_viewed"]
  }),
  "intelligence.risk_badge_viewed": taxonomyEvent({
    name: "intelligence.risk_badge_viewed",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "contract_intelligence_risk_explanation",
    relatedOnboardingMilestones: ["first_intelligence_viewed"]
  }),
  "intelligence.risk_explanation_viewed": taxonomyEvent({
    name: "intelligence.risk_explanation_viewed",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "contract_intelligence_risk_explanation",
    relatedOnboardingMilestones: ["first_intelligence_viewed"]
  }),
  "intelligence.risk_score_recalculated": taxonomyEvent({
    name: "intelligence.risk_score_recalculated",
    type: "audit",
    emittedToday: false,
    source: "future explicit risk-score recalculation workflow; helper contract is defined in lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: intelligenceSafeMetadata,
    owningProductModule: "contract_intelligence_risk_explanation"
  }),
  "intelligence.export_requested": taxonomyEvent({
    name: "intelligence.export_requested",
    type: "audit",
    emittedToday: false,
    source: "future explicit intelligence export workflow; helper contract is defined in lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "export_type", "contract_count"],
    owningProductModule: "export_reporting_intelligence"
  }),
  "intelligence.settings_changed": taxonomyEvent({
    name: "intelligence.settings_changed",
    type: "audit",
    emittedToday: false,
    source: "future intelligence settings workflow; helper contract is defined in lib/intelligence/audit.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "changed_key_count", "changed_keys"],
    owningProductModule: "contract_intelligence_risk_explanation"
  }),
  "intelligence.access_denied": taxonomyEvent({
    name: "intelligence.access_denied",
    type: "audit",
    emittedToday: true,
    source: "lib/intelligence/access.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...intelligenceSafeMetadata, "reason_code"],
    owningProductModule: "contract_intelligence_risk_explanation"
  }),
  intelligence_access_denied: taxonomyEvent({
    name: "intelligence_access_denied",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/intelligence/risk/contracts/[id]/explanation-view/route.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...intelligenceSafeMetadata, "reason_code"],
    owningProductModule: "contract_intelligence_risk_explanation"
  }),
  internal_route_auth_failed: taxonomyEvent({
    name: "internal_route_auth_failed",
    type: "monitoring",
    emittedToday: true,
    source: "lib/http/route-handler.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: ["route", "request_id", "reason_code"],
    owningProductModule: "admin_support_operations"
  }),
  workspace_deletion_route_failed: taxonomyEvent({
    name: "workspace_deletion_route_failed",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/internal/workspace-deletion/route.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: [...commonSafeMetadata, "deletion_request_id", "stage"],
    owningProductModule: "admin_support_operations"
  }),
  export_jobs_route_failed: taxonomyEvent({
    name: "export_jobs_route_failed",
    type: "monitoring",
    emittedToday: true,
    source: "app/api/internal/export-jobs/route.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: [...exportSafeMetadata, "route"],
    owningProductModule: "admin_support_operations"
  }),
  "privacy.workspace_deletion_requested": taxonomyEvent({
    name: "privacy.workspace_deletion_requested",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/settings.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "deletion_request_id", "status", "created_at"],
    owningProductModule: "admin_support_operations"
  }),
  "privacy.workspace_deletion_scheduled": taxonomyEvent({
    name: "privacy.workspace_deletion_scheduled",
    type: "audit",
    emittedToday: false,
    source: "future explicit workspace deletion scheduling audit; current runtime has no scheduled deletion window",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "deletion_request_id", "scheduled_for"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "privacy.workspace_deletion_executed": taxonomyEvent({
    name: "privacy.workspace_deletion_executed",
    type: "audit",
    emittedToday: false,
    source: "future explicit workspace deletion completion audit; current runtime records completed request state",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "deletion_request_id", "completed_at", "deleted_counts"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "privacy.workspace_deletion_failed": taxonomyEvent({
    name: "privacy.workspace_deletion_failed",
    type: "audit",
    emittedToday: false,
    source: "future explicit workspace deletion failure audit; current runtime records failed request state",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "deletion_request_id", "failure_code", "failure_category", "stage"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.sso_config_changed": taxonomyEvent({
    name: "identity.sso_config_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future provider-backed enterprise SSO configuration workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "previous_state", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.sso_callback_prepared": taxonomyEvent({
    name: "identity.sso_callback_prepared",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts SSO callback decision helper; future provider-backed enterprise SSO callback emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "external_id_hash", "email_hash", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.scim_directory_configured": taxonomyEvent({
    name: "identity.scim_directory_configured",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future SCIM directory configuration workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "provider", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.scim_user_provisioned": taxonomyEvent({
    name: "identity.scim_user_provisioned",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future provider-backed SCIM provision workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "scim_user_id", "provider", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.scim_user_updated": taxonomyEvent({
    name: "identity.scim_user_updated",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future provider-backed SCIM update workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "scim_user_id", "provider", "previous_state", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.scim_user_deprovisioned": taxonomyEvent({
    name: "identity.scim_user_deprovisioned",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future provider-backed SCIM deprovision workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "scim_user_id", "provider", "previous_state", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.member_locked": taxonomyEvent({
    name: "identity.member_locked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future enterprise identity lockout workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "provider", "previous_state", "new_state", "lockout_reason", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.member_unlocked": taxonomyEvent({
    name: "identity.member_unlocked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future enterprise identity recovery workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "previous_state", "new_state", "recovery_method", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.group_role_mapping_changed": taxonomyEvent({
    name: "identity.group_role_mapping_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future group role mapping workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "mapping_id", "provider", "group_id_hash", "role", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "identity.break_glass_policy_checked": taxonomyEvent({
    name: "identity.break_glass_policy_checked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future privileged identity mutation workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "outcome", "active_admin_owner_count", "blocked_reason", "recovery_method", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.identity_provider_configured": taxonomyEvent({
    name: "enterprise.identity_provider_configured",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future enterprise identity provider configuration workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "new_state", "metadata_fingerprint", "certificate_fingerprint", "certificate_expires_at", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.sso_config_changed": taxonomyEvent({
    name: "enterprise.sso_config_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future enterprise SSO configuration workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "previous_state", "new_state", "metadata_fingerprint", "certificate_fingerprint", "certificate_expires_at", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.sso_configured": taxonomyEvent({
    name: "enterprise.sso_configured",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future SSO configuration workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.sso_enabled": taxonomyEvent({
    name: "enterprise.sso_enabled",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future SSO enablement workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "previous_state", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.sso_disabled": taxonomyEvent({
    name: "enterprise.sso_disabled",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future SSO disablement workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "previous_state", "new_state", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.idp_metadata_changed": taxonomyEvent({
    name: "enterprise.idp_metadata_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future IdP metadata rotation workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "sso_configuration_id", "provider", "metadata_fingerprint", "certificate_fingerprint", "certificate_expires_at", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.domain_verification_started": taxonomyEvent({
    name: "enterprise.domain_verification_started",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future domain verification workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "provider", "domain", "domain_verification_status", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.domain_verification_completed": taxonomyEvent({
    name: "enterprise.domain_verification_completed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future domain verification workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "provider", "domain", "domain_verification_status", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.domain_verification_failed": taxonomyEvent({
    name: "enterprise.domain_verification_failed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future domain verification workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "provider", "domain", "domain_verification_status", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.scim_user_provisioned": taxonomyEvent({
    name: "enterprise.scim_user_provisioned",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future SCIM provision workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "provider", "previous_state", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.scim_user_updated": taxonomyEvent({
    name: "enterprise.scim_user_updated",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future SCIM update workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "provider", "previous_state", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.scim_user_deprovisioned": taxonomyEvent({
    name: "enterprise.scim_user_deprovisioned",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future SCIM deprovision workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "provider", "previous_state", "new_state", "role", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.identity_member_locked": taxonomyEvent({
    name: "enterprise.identity_member_locked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future SCIM lockout workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "target_user_id", "provider", "previous_state", "new_state", "lockout_reason", "reason_code", "initiated_by"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.identity_member_unlocked": taxonomyEvent({
    name: "enterprise.identity_member_unlocked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future enterprise identity recovery workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "previous_state", "new_state", "recovery_method", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.role_group_mapping_changed": taxonomyEvent({
    name: "enterprise.role_group_mapping_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future group role mapping workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "mapping_id", "provider", "group_id_hash", "role", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.admin_recovery_used": taxonomyEvent({
    name: "enterprise.admin_recovery_used",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future admin recovery workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "recovery_method", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.break_glass_admin_preserved": taxonomyEvent({
    name: "enterprise.break_glass_admin_preserved",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future privileged identity mutation workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "outcome", "active_admin_owner_count", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.break_glass_admin_blocked": taxonomyEvent({
    name: "enterprise.break_glass_admin_blocked",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity-runtime.ts audit builder; future privileged identity mutation workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "outcome", "active_admin_owner_count", "blocked_reason", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.user_lockout": taxonomyEvent({
    name: "enterprise.user_lockout",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future user lockout workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "previous_state", "new_state", "lockout_reason", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "enterprise.user_recovery": taxonomyEvent({
    name: "enterprise.user_recovery",
    type: "audit",
    emittedToday: false,
    source: "lib/product/enterprise-identity.ts audit contract; future user recovery workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "target_user_id", "provider", "previous_state", "new_state", "recovery_method", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.retention_policy_changed": taxonomyEvent({
    name: "governance.retention_policy_changed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/data-governance-runtime.ts audit builder; future enterprise retention policy workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: [
      "organization_id",
      "actor_user_id",
      "policy_id",
      "object_class",
      "retention_window",
      "status",
      "reason_code"
    ],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.legal_hold_created": taxonomyEvent({
    name: "governance.legal_hold_created",
    type: "audit",
    emittedToday: false,
    source: "future enterprise legal hold workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "hold_id", "object_class", "reason_code"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.legal_hold_released": taxonomyEvent({
    name: "governance.legal_hold_released",
    type: "audit",
    emittedToday: false,
    source: "future enterprise legal hold workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "hold_id", "object_class", "released_at"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "exports.artifact_expired": taxonomyEvent({
    name: "exports.artifact_expired",
    type: "audit",
    emittedToday: false,
    source: "future enterprise governance artifact-expiry audit; current shipped audit is contracts.export_background_expired",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "export_request_id", "preset", "format", "expired_at"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "exports.artifact_deleted": taxonomyEvent({
    name: "exports.artifact_deleted",
    type: "audit",
    emittedToday: false,
    source: "future enterprise governance artifact-deletion audit; current shipped cleanup uses background export expiry events",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "export_request_id", "preset", "format", "deleted_at"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.customer_data_export_requested": taxonomyEvent({
    name: "governance.customer_data_export_requested",
    type: "audit",
    emittedToday: false,
    source: "future enterprise customer data export workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "export_request_id", "object_classes", "requested_at"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.customer_data_export_completed": taxonomyEvent({
    name: "governance.customer_data_export_completed",
    type: "audit",
    emittedToday: false,
    source: "future enterprise customer data export workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "export_request_id", "object_classes", "artifact_expiry", "completed_at"],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  "governance.support_access_reviewed": taxonomyEvent({
    name: "governance.support_access_reviewed",
    type: "audit",
    emittedToday: false,
    source: "lib/product/data-governance-runtime.ts audit builder; future enterprise support access review workflow emitter",
    privacySensitivity: "restricted",
    safeMetadataFields: [
      "organization_id",
      "actor_user_id",
      "support_actor_id",
      "review_id",
      "purpose_code",
      "object_class",
      "object_id",
      "status",
      "reviewed_at",
      "reviewer_user_id",
      "policy_evidence_id",
      "expires_at"
    ],
    owningProductModule: "enterprise_identity_rbac_retention"
  }),
  internal_rescue_action_recorded: taxonomyEvent({
    name: "internal_rescue_action_recorded",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/admin.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "actor_user_id", "action", "contract_id"],
    owningProductModule: "admin_support_operations"
  }),
  "admin.notification_resent": taxonomyEvent({
    name: "admin.notification_resent",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/admin.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: [...commonSafeMetadata, "notification_id"],
    owningProductModule: "admin_support_operations"
  }),
  "admin.reminder_rerun": taxonomyEvent({
    name: "admin.reminder_rerun",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/admin.ts",
    privacySensitivity: "restricted",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id"],
    owningProductModule: "admin_support_operations"
  }),
  "support.escalation_opened": taxonomyEvent({
    name: "support.escalation_opened",
    type: "support",
    emittedToday: false,
    source: "future support escalation workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "escalation_id", "severity", "status", "opened_at"],
    owningProductModule: "admin_support_operations",
    relatedSupportSignals: ["support_escalation_open"]
  }),
  "support.enterprise_security_review_requested": taxonomyEvent({
    name: "support.enterprise_security_review_requested",
    type: "support",
    emittedToday: false,
    source: "future enterprise security review workflow",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "review_id", "status", "requested_at", "owner_role"],
    owningProductModule: "admin_support_operations",
    relatedSupportSignals: ["enterprise_security_review_pending"]
  })
} as const satisfies Record<string, ProductEventTaxonomyEntry>;

export type ProductEventName = keyof typeof PRODUCT_EVENT_TAXONOMY;

export const PRODUCT_EVENT_NAMES = Object.keys(PRODUCT_EVENT_TAXONOMY) as ProductEventName[];

export const EMITTED_PRODUCT_EVENT_NAMES = PRODUCT_EVENT_NAMES.filter(
  (eventName) => PRODUCT_EVENT_TAXONOMY[eventName].emittedToday
);

export const FUTURE_PRODUCT_EVENT_NAMES = PRODUCT_EVENT_NAMES.filter(
  (eventName) => !PRODUCT_EVENT_TAXONOMY[eventName].emittedToday
);

export function getProductEventTaxonomyEntry(eventName: string) {
  return PRODUCT_EVENT_TAXONOMY[eventName as ProductEventName];
}
