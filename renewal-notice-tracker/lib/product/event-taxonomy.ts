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
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "source", "contract_type"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contract.manual_created": taxonomyEvent({
    name: "contract.manual_created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "source", "contract_type"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contracts.import_started": taxonomyEvent({
    name: "contracts.import_started",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "import_id", "row_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  "contracts.imported": taxonomyEvent({
    name: "contracts.imported",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: [...commonSafeMetadata, "import_id", "row_count", "failed_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  contract_upload_completed: taxonomyEvent({
    name: "contract_upload_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "source", "processing_status"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_started: taxonomyEvent({
    name: "import_started",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "import_id", "row_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_completed: taxonomyEvent({
    name: "import_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "import_id", "row_count", "created_count"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  import_failed: taxonomyEvent({
    name: "import_failed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
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
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "processing_status"],
    owningProductModule: "ocr_import_intelligence",
    relatedOnboardingMilestones: ["first_contract_uploaded"]
  }),
  extraction_failed: taxonomyEvent({
    name: "extraction_failed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "high",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "failure_code"],
    owningProductModule: "ocr_import_intelligence",
    relatedSupportSignals: ["ocr_queue_delayed"]
  }),
  "contract.review_updated": taxonomyEvent({
    name: "contract.review_updated",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "review_status", "reviewed_at"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_reviewed"]
  }),
  contract_review_completed: taxonomyEvent({
    name: "contract_review_completed",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "review_status"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_contract_reviewed"]
  }),
  contract_owner_assigned: taxonomyEvent({
    name: "contract_owner_assigned",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
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
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "reminder_id", "reminder_date"],
    owningProductModule: "reminder_workflow_automation",
    relatedOnboardingMilestones: ["first_reminder_trusted"]
  }),
  "reminder.blocked": taxonomyEvent({
    name: "reminder.blocked",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "blocking_reason_code"],
    owningProductModule: "reminder_workflow_automation",
    relatedSupportSignals: ["reminders_not_trusted"]
  }),
  reminder_scheduled: taxonomyEvent({
    name: "reminder_scheduled",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
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
    source: "lib/notifications/reminders.ts and lib/actions/contracts.ts",
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
  "renewal_decision.created": taxonomyEvent({
    name: "renewal_decision.created",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
    privacySensitivity: "medium",
    safeMetadataFields: [...commonSafeMetadata, "decision_status", "decision_date"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["first_decision_recorded", "renewal_loop_completed"]
  }),
  renewal_decision_recorded: taxonomyEvent({
    name: "renewal_decision_recorded",
    type: "analytics",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
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
    source: "lib/actions/contracts.ts",
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
    source: "lib/actions/contracts.ts and lib/email/actions.ts",
    privacySensitivity: "medium",
    safeMetadataFields: ["organization_id", "actor_user_id", "contract_id", "source"],
    owningProductModule: "core_renewal_control_kernel",
    relatedOnboardingMilestones: ["renewal_loop_completed"]
  }),
  "renewal_cycle.updated": taxonomyEvent({
    name: "renewal_cycle.updated",
    type: "audit",
    emittedToday: true,
    source: "lib/actions/contracts.ts",
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
    source: "lib/actions/contracts.ts",
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
  "privacy.workspace_deletion_failed": taxonomyEvent({
    name: "privacy.workspace_deletion_failed",
    type: "audit",
    emittedToday: false,
    source: "future explicit workspace deletion failure audit; current runtime records failed request state",
    privacySensitivity: "restricted",
    safeMetadataFields: ["organization_id", "deletion_request_id", "failure_code", "failure_category", "stage"],
    owningProductModule: "admin_support_operations"
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
