export type DataGovernanceCapabilityStatus = "shipped" | "deferred" | "future" | "excluded";
export type DataGovernanceRuntimeSurface =
  | "customer_runtime"
  | "internal_operations"
  | "background_job"
  | "none";
export type DataGovernancePlanGate =
  | "none"
  | "starter"
  | "growth"
  | "portfolio"
  | "enterprise_future"
  | "internal_only";
export type DataGovernancePrivacyRisk = "low" | "moderate" | "high" | "critical";

export type DataGovernanceCapabilityId =
  | "contract_document_retention"
  | "ocr_extracted_text_retention"
  | "export_artifact_expiry"
  | "audit_log_retention"
  | "notification_reminder_log_retention"
  | "billing_record_retention"
  | "workspace_deletion_window"
  | "legal_hold"
  | "data_residency"
  | "customer_data_export"
  | "backup_restore_evidence"
  | "support_access_evidence";

export type DataGovernanceCapability = {
  id: DataGovernanceCapabilityId;
  label: string;
  status: DataGovernanceCapabilityStatus;
  allowedRuntimeSurfaceToday: DataGovernanceRuntimeSurface;
  requiredPlanOrGate: DataGovernancePlanGate;
  currentBehavior: string;
  futureEnterpriseBehavior: string;
  retentionDeletionExpectation: string;
  auditExpectation: string;
  privacyRiskLevel: DataGovernancePrivacyRisk;
  requiredTestsOrReleaseGates: readonly string[];
  forbiddenBehavior: readonly string[];
};

export type GovernedDataClassId =
  | "uploaded_contract_file"
  | "contract_metadata"
  | "extracted_ocr_text"
  | "generated_intelligence"
  | "contract_notes"
  | "export_artifact"
  | "audit_event"
  | "analytics_event"
  | "reminder_notification"
  | "billing_record"
  | "internal_support_log"
  | "backup_snapshot";

export type DataClassSensitivity =
  | "internal"
  | "customer_sensitive"
  | "highly_sensitive"
  | "restricted";
export type DataClassRetentionPosture =
  | "retained_until_workspace_deletion"
  | "bounded_operational_retention"
  | "expires_by_policy"
  | "future_policy_required";
export type DataClassDeletionBehavior =
  | "deleted_with_workspace"
  | "redacted_or_minimized_with_workspace"
  | "expired_automatically"
  | "future_policy_required";
export type DataClassExportability =
  | "customer_exportable"
  | "preset_gated_exportable"
  | "admin_only_or_deferred"
  | "not_customer_exportable";

export type GovernedDataClass = {
  id: GovernedDataClassId;
  label: string;
  sensitivity: DataClassSensitivity;
  defaultRetentionPosture: DataClassRetentionPosture;
  deletionBehavior: DataClassDeletionBehavior;
  exportability: DataClassExportability;
  legalHoldMayApply: boolean;
  customerSupportMayAccess: boolean;
  rawContentAllowedInLogsOrAlerts: boolean;
  notes: string;
};

export type GovernanceLifecycleStatus = "shipped" | "future";

export type GovernanceLifecycleContract = {
  id: string;
  status: GovernanceLifecycleStatus;
  description: string;
  safeMetadata: readonly string[];
  forbiddenMetadata: readonly string[];
};

export type GovernanceAuditEventContract = {
  eventName: string;
  status: GovernanceLifecycleStatus;
  safeMetadata: readonly string[];
  forbiddenMetadata: readonly string[];
};

const commonFutureGate = [
  "tests/data-governance-boundary.test.ts",
  "future enterprise data governance release gate required before activation"
] as const;

const sensitiveMetadataForbidden = [
  "raw_contract_text",
  "ocr_output",
  "full_note_text",
  "storage_path",
  "provider_payload",
  "token",
  "secret",
  "backup_contents"
] as const;

export const DATA_GOVERNANCE_CAPABILITIES: Record<
  DataGovernanceCapabilityId,
  DataGovernanceCapability
> = {
  contract_document_retention: {
    id: "contract_document_retention",
    label: "Contract document retention",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Uploaded contract files are treated as customer-sensitive records and removed through workspace deletion rather than customer-configurable retention settings.",
    futureEnterpriseBehavior: "Enterprise retention policies may define document retention windows after legal, export, backup, and customer communication controls are implemented.",
    retentionDeletionExpectation: "Documents must be organization-scoped, deleted through verified workspace deletion, and never retained by accident after an approved destructive operation.",
    auditExpectation: "Retention policy changes and deletion actions must audit object class, organization, actor, policy ID, and safe counts only.",
    privacyRiskLevel: "critical",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Customer-configurable document retention UI in current runtime.", "Raw contract text in logs, alerts, audit metadata, or support diagnostics."]
  },
  ocr_extracted_text_retention: {
    id: "ocr_extracted_text_retention",
    label: "OCR/extracted text retention",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "OCR and extraction outputs are trust inputs for review and must not appear in logs or errors.",
    futureEnterpriseBehavior: "Enterprise retention may separately expire or minimize raw OCR/extraction text after reviewed metadata is accepted.",
    retentionDeletionExpectation: "Raw extraction payloads must be minimized where possible and deleted with workspace deletion.",
    auditExpectation: "Extraction retention changes must audit policy metadata only, never raw OCR text or provider payloads.",
    privacyRiskLevel: "critical",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Logging OCR output.", "Using unreviewed extracted text as permanent high-confidence truth."]
  },
  export_artifact_expiry: {
    id: "export_artifact_expiry",
    label: "Export artifact expiry",
    status: "shipped",
    allowedRuntimeSurfaceToday: "background_job",
    requiredPlanOrGate: "growth",
    currentBehavior: "Background export artifacts are represented with expiry metadata and safe artifact-size limits.",
    futureEnterpriseBehavior: "Enterprise export retention may support configurable expiry windows, destination controls, and evidence trails.",
    retentionDeletionExpectation: "Export artifacts must expire and must not expose storage paths or unbounded sensitive content.",
    auditExpectation: "Export lifecycle audit must record preset, format, row count, sensitivity, and expiry metadata only.",
    privacyRiskLevel: "high",
    requiredTestsOrReleaseGates: ["test:background-exports", "tests/export.test.ts", "tests/data-governance-boundary.test.ts"],
    forbiddenBehavior: ["Indefinite export artifacts.", "Storage paths in customer UI, logs, audit metadata, or support diagnostics."]
  },
  audit_log_retention: {
    id: "audit_log_retention",
    label: "Audit log retention",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Audit logs exist for accountability and are customer-safe summaries rather than raw debug dumps.",
    futureEnterpriseBehavior: "Enterprise retention may define audit retention windows and legal preservation rules.",
    retentionDeletionExpectation: "Audit events may need minimization rather than immediate hard deletion, with clear customer communication.",
    auditExpectation: "Audit retention changes must be audited without embedding raw event details or customer content.",
    privacyRiskLevel: "high",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Raw JSON audit dumps in customer UI.", "Instant deletion promises for accountability records without policy review."]
  },
  notification_reminder_log_retention: {
    id: "notification_reminder_log_retention",
    label: "Notification/reminder log retention",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Reminder and notification lifecycle records support reliability, retries, and support diagnostics.",
    futureEnterpriseBehavior: "Enterprise retention may bound delivery logs while preserving enough evidence for support and audit.",
    retentionDeletionExpectation: "Delivery evidence should be code-first, bounded, and free of raw message bodies.",
    auditExpectation: "Retention changes must audit policy and safe count metadata only.",
    privacyRiskLevel: "moderate",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Full email bodies or customer notes in logs.", "Deleting retry evidence before operational truth is preserved."]
  },
  billing_record_retention: {
    id: "billing_record_retention",
    label: "Billing record retention",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Billing state is normalized into canonical snapshot fields; raw provider payloads must not be logged.",
    futureEnterpriseBehavior: "Enterprise governance may document retention for billing ledgers and provider evidence.",
    retentionDeletionExpectation: "Billing records require legal/accounting-aware retention and provider payload minimization.",
    auditExpectation: "Billing retention changes must audit plan/status/provider labels only, not raw provider payloads.",
    privacyRiskLevel: "high",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Raw billing provider payloads in logs, alerts, audit details, or exports."]
  },
  workspace_deletion_window: {
    id: "workspace_deletion_window",
    label: "Workspace deletion window",
    status: "shipped",
    allowedRuntimeSurfaceToday: "customer_runtime",
    requiredPlanOrGate: "none",
    currentBehavior: "Owners can request workspace deletion; execution is internal/destructive-auth controlled and records failed/completed state evidence.",
    futureEnterpriseBehavior: "Enterprise deletion windows may add scheduled deletion, cancellation windows, legal-hold blocking, and customer communications.",
    retentionDeletionExpectation: "Current destructive execution must fail closed, preserve safe failure evidence, and never mark partial deletion completed.",
    auditExpectation: "Deletion requested, execution attempted, completed, and failed states must audit safe IDs, statuses, stages, and counts only.",
    privacyRiskLevel: "critical",
    requiredTestsOrReleaseGates: ["test:deletion-control-plane", "tests/workspace-deletion.test.ts", "tests/data-governance-boundary.test.ts"],
    forbiddenBehavior: ["Silent founder deletion outside audited rescue.", "Completed status after partial failure.", "Leaking cross-tenant entity existence."]
  },
  legal_hold: {
    id: "legal_hold",
    label: "Legal hold",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "No live legal-hold runtime behavior exists today.",
    futureEnterpriseBehavior: "Legal hold may block deletion/expiry for scoped object classes after Enterprise policy, notification, and audit semantics are implemented.",
    retentionDeletionExpectation: "Legal hold must block applicable deletion while keeping hold scope explicit and auditable.",
    auditExpectation: "Hold created, released, and deletion-blocked events must be audited with hold IDs and object classes only.",
    privacyRiskLevel: "critical",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Fake legal-hold UI.", "Unscoped holds.", "Legal hold claims before runtime enforcement exists."]
  },
  data_residency: {
    id: "data_residency",
    label: "Data residency",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "No customer-selectable data residency behavior exists today.",
    futureEnterpriseBehavior: "Residency requires infrastructure, subprocessors, storage, backups, monitoring, and support processes to align by region.",
    retentionDeletionExpectation: "Residency policy must include storage, backup, logs, monitoring, and provider locations.",
    auditExpectation: "Residency changes must audit region policy metadata and actor only.",
    privacyRiskLevel: "high",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Customer-facing residency claims without infrastructure proof."]
  },
  customer_data_export: {
    id: "customer_data_export",
    label: "Customer data export",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Contract exports are preset-gated reporting artifacts, not a full customer data export/DSAR system.",
    futureEnterpriseBehavior: "Enterprise data export may package scoped customer data with redaction, artifact expiry, audit, and support controls.",
    retentionDeletionExpectation: "Export packages must be bounded, expire by policy, and exclude forbidden raw payloads unless explicitly governed.",
    auditExpectation: "Data export requested/completed events must audit object classes, counts, artifact expiry, and actor only.",
    privacyRiskLevel: "critical",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Treating basic CSV/XLSX export as full data portability.", "Raw OCR, full notes, backup contents, or secrets in customer export packages."]
  },
  backup_restore_evidence: {
    id: "backup_restore_evidence",
    label: "Backup/restore evidence",
    status: "shipped",
    allowedRuntimeSurfaceToday: "internal_operations",
    requiredPlanOrGate: "internal_only",
    currentBehavior: "Internal backup readiness and restore drill evidence can be recorded through operations routes.",
    futureEnterpriseBehavior: "Enterprise governance may expose customer-safe backup/restore attestations without revealing backup contents or storage internals.",
    retentionDeletionExpectation: "Evidence should retain status, timestamps, recovery metrics, and safe summaries, not backup contents.",
    auditExpectation: "Backup evidence review should audit environment, status, timestamp, and reviewer context only.",
    privacyRiskLevel: "moderate",
    requiredTestsOrReleaseGates: ["test:privacy-ops", "tests/backup-readiness-route.test.ts", "tests/restore-drill-route.test.ts", "tests/data-governance-boundary.test.ts"],
    forbiddenBehavior: ["Backup contents, storage paths, secrets, or raw customer data in evidence fields."]
  },
  support_access_evidence: {
    id: "support_access_evidence",
    label: "Support access evidence",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanOrGate: "enterprise_future",
    currentBehavior: "Internal support surfaces are role-gated and should show code-first diagnostics rather than raw customer content.",
    futureEnterpriseBehavior: "Enterprise support access review may expose evidence of support access, approvals, and purpose limitation.",
    retentionDeletionExpectation: "Support access evidence must be retained long enough for accountability and minimized to safe metadata.",
    auditExpectation: "Support access reviewed events must audit actor, role, organization, purpose code, and object class only.",
    privacyRiskLevel: "high",
    requiredTestsOrReleaseGates: commonFutureGate,
    forbiddenBehavior: ["Raw customer notes, contract text, OCR output, storage paths, or secrets in support access logs."]
  }
} as const;

export const DATA_GOVERNANCE_CAPABILITY_IDS = Object.keys(
  DATA_GOVERNANCE_CAPABILITIES
) as DataGovernanceCapabilityId[];

export const GOVERNED_DATA_CLASSES: Record<GovernedDataClassId, GovernedDataClass> = {
  uploaded_contract_file: {
    id: "uploaded_contract_file",
    label: "Uploaded contract file",
    sensitivity: "highly_sensitive",
    defaultRetentionPosture: "retained_until_workspace_deletion",
    deletionBehavior: "deleted_with_workspace",
    exportability: "admin_only_or_deferred",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Original files are contract truth artifacts and require strict storage-path and content redaction."
  },
  contract_metadata: {
    id: "contract_metadata",
    label: "Contract metadata",
    sensitivity: "customer_sensitive",
    defaultRetentionPosture: "retained_until_workspace_deletion",
    deletionBehavior: "deleted_with_workspace",
    exportability: "customer_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Reviewed metadata can appear in gated UI and exports but not in logs as raw free text."
  },
  extracted_ocr_text: {
    id: "extracted_ocr_text",
    label: "Extracted OCR text",
    sensitivity: "highly_sensitive",
    defaultRetentionPosture: "future_policy_required",
    deletionBehavior: "deleted_with_workspace",
    exportability: "not_customer_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: false,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Raw OCR and extraction payloads are not customer-export defaults and must never be logged."
  },
  generated_intelligence: {
    id: "generated_intelligence",
    label: "Generated intelligence",
    sensitivity: "customer_sensitive",
    defaultRetentionPosture: "retained_until_workspace_deletion",
    deletionBehavior: "deleted_with_workspace",
    exportability: "preset_gated_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Outputs require trust/confidence metadata and must not expose raw evidence by default."
  },
  contract_notes: {
    id: "contract_notes",
    label: "Contract notes",
    sensitivity: "highly_sensitive",
    defaultRetentionPosture: "retained_until_workspace_deletion",
    deletionBehavior: "deleted_with_workspace",
    exportability: "preset_gated_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: false,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Full notes are excluded from basic exports and logs; previews must be sanitized and bounded."
  },
  export_artifact: {
    id: "export_artifact",
    label: "Export artifact",
    sensitivity: "customer_sensitive",
    defaultRetentionPosture: "expires_by_policy",
    deletionBehavior: "expired_automatically",
    exportability: "preset_gated_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Artifacts expire and storage paths are forbidden in customer/support surfaces."
  },
  audit_event: {
    id: "audit_event",
    label: "Audit event",
    sensitivity: "restricted",
    defaultRetentionPosture: "future_policy_required",
    deletionBehavior: "redacted_or_minimized_with_workspace",
    exportability: "admin_only_or_deferred",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Audit event metadata must stay useful and redacted, not a raw JSON debug dump."
  },
  analytics_event: {
    id: "analytics_event",
    label: "Analytics event",
    sensitivity: "internal",
    defaultRetentionPosture: "bounded_operational_retention",
    deletionBehavior: "redacted_or_minimized_with_workspace",
    exportability: "not_customer_exportable",
    legalHoldMayApply: false,
    customerSupportMayAccess: false,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Analytics are product measurement, not customer accountability records."
  },
  reminder_notification: {
    id: "reminder_notification",
    label: "Reminder/notification record",
    sensitivity: "customer_sensitive",
    defaultRetentionPosture: "bounded_operational_retention",
    deletionBehavior: "deleted_with_workspace",
    exportability: "admin_only_or_deferred",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Delivery diagnostics should use status/code metadata instead of full message bodies."
  },
  billing_record: {
    id: "billing_record",
    label: "Billing record",
    sensitivity: "restricted",
    defaultRetentionPosture: "future_policy_required",
    deletionBehavior: "redacted_or_minimized_with_workspace",
    exportability: "admin_only_or_deferred",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Provider payloads and secrets are forbidden in logs, audit, monitoring, and customer exports."
  },
  internal_support_log: {
    id: "internal_support_log",
    label: "Internal support log",
    sensitivity: "restricted",
    defaultRetentionPosture: "bounded_operational_retention",
    deletionBehavior: "redacted_or_minimized_with_workspace",
    exportability: "not_customer_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: true,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Support logs should contain codes, IDs, and safe metadata only."
  },
  backup_snapshot: {
    id: "backup_snapshot",
    label: "Backup snapshot",
    sensitivity: "restricted",
    defaultRetentionPosture: "future_policy_required",
    deletionBehavior: "future_policy_required",
    exportability: "not_customer_exportable",
    legalHoldMayApply: true,
    customerSupportMayAccess: false,
    rawContentAllowedInLogsOrAlerts: false,
    notes: "Backup contents are never customer-visible support evidence; only safe readiness metadata may be shown."
  }
} as const;

export const GOVERNED_DATA_CLASS_IDS = Object.keys(
  GOVERNED_DATA_CLASSES
) as GovernedDataClassId[];

export const LEGAL_HOLD_AND_DELETION_CONTRACTS = [
  {
    id: "legal_hold_activation",
    status: "future",
    description: "Future legal hold activation blocks deletion/expiry for explicitly scoped data classes.",
    safeMetadata: ["organization_id", "actor_user_id", "hold_id", "object_class", "scope", "reason_code"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "legal_hold_release",
    status: "future",
    description: "Future legal hold release restores normal retention/deletion eligibility.",
    safeMetadata: ["organization_id", "actor_user_id", "hold_id", "object_class", "released_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "deletion_request_received",
    status: "shipped",
    description: "Current owner-requested workspace deletion intake.",
    safeMetadata: ["organization_id", "actor_user_id", "deletion_request_id", "requested_at", "status"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "deletion_scheduled",
    status: "future",
    description: "Future scheduled deletion window with cancellation/customer communication semantics.",
    safeMetadata: ["organization_id", "actor_user_id", "deletion_request_id", "scheduled_for", "window_policy"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "deletion_executed",
    status: "shipped",
    description: "Current internal destructive execution can mark requests completed only after critical steps succeed.",
    safeMetadata: ["organization_id", "deletion_request_id", "completed_at", "deleted_counts", "stage"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "deletion_blocked_by_legal_hold",
    status: "future",
    description: "Future deletion block when a legal hold applies to requested object classes.",
    safeMetadata: ["organization_id", "deletion_request_id", "hold_id", "object_class", "status"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "deletion_failed",
    status: "shipped",
    description: "Current deletion failures persist failed status and stage evidence when possible.",
    safeMetadata: ["organization_id", "deletion_request_id", "failed_stage", "failure_code", "failure_category", "status"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    id: "backup_restore_evidence_reviewed",
    status: "shipped",
    description: "Current internal backup/restore evidence records safe readiness details.",
    safeMetadata: ["environment", "status", "checked_at", "restore_tested_at", "recovery_time_minutes"],
    forbiddenMetadata: sensitiveMetadataForbidden
  }
] as const satisfies readonly GovernanceLifecycleContract[];

export const DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS = [
  {
    eventName: "governance.retention_policy_changed",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "policy_id", "object_class", "retention_window"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "governance.legal_hold_created",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "hold_id", "object_class", "reason_code"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "governance.legal_hold_released",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "hold_id", "object_class", "released_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "privacy.workspace_deletion_requested",
    status: "shipped",
    safeMetadata: ["organization_id", "actor_user_id", "deletion_request_id", "requested_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "privacy.workspace_deletion_scheduled",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "deletion_request_id", "scheduled_for"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "privacy.workspace_deletion_executed",
    status: "shipped",
    safeMetadata: ["organization_id", "deletion_request_id", "completed_at", "deleted_counts"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "privacy.workspace_deletion_failed",
    status: "shipped",
    safeMetadata: ["organization_id", "deletion_request_id", "failed_stage", "failure_code", "failure_category"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "exports.artifact_expired",
    status: "future",
    safeMetadata: ["organization_id", "export_request_id", "preset", "format", "expired_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "exports.artifact_deleted",
    status: "future",
    safeMetadata: ["organization_id", "export_request_id", "preset", "format", "deleted_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "governance.customer_data_export_requested",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "export_request_id", "object_classes", "requested_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "governance.customer_data_export_completed",
    status: "future",
    safeMetadata: ["organization_id", "export_request_id", "object_classes", "artifact_expiry", "completed_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  },
  {
    eventName: "governance.support_access_reviewed",
    status: "future",
    safeMetadata: ["organization_id", "actor_user_id", "support_actor_id", "purpose_code", "object_class", "reviewed_at"],
    forbiddenMetadata: sensitiveMetadataForbidden
  }
] as const satisfies readonly GovernanceAuditEventContract[];

export const DATA_GOVERNANCE_FORBIDDEN_METADATA = sensitiveMetadataForbidden;
