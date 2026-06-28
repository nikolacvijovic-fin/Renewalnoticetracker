export type SupportSuccessCapabilityStatus = "shipped" | "deferred" | "future";
export type SupportSuccessRuntimeSurfaceToday = "internal_ops" | "customer_services_copy" | "none";
export type SupportSuccessRoleBoundary =
  | "internal_support_or_admin"
  | "customer_admin_or_owner"
  | "future_enterprise_support_gate";
export type SupportSuccessPrivacySensitivity = "low" | "medium" | "high" | "restricted";
export type CustomerHealthSignalSeverity = "P1" | "P2" | "P3";
export type CustomerHealthSignalComputability = "computable_today" | "future_only";

export type SupportSuccessCapabilityId =
  | "account_health_snapshot"
  | "onboarding_checklist"
  | "support_diagnostic_bundle"
  | "safe_account_notes"
  | "escalation_workflow"
  | "incident_customer_communication"
  | "support_access_review"
  | "assisted_troubleshooting"
  | "enterprise_renewal_review"
  | "billing_exception_support"
  | "data_export_deletion_support";

export type CustomerHealthSignalId =
  | "no_contract_uploaded_after_signup"
  | "contracts_uploaded_but_unreviewed"
  | "contracts_without_owner"
  | "reminders_not_trusted"
  | "decisions_missing"
  | "export_failed_repeatedly"
  | "billing_exception_needs_followup"
  | "ocr_queue_delayed"
  | "support_escalation_open"
  | "enterprise_security_review_pending";

export const SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA = [
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
] as const;

export type SupportSuccessForbiddenRawCustomerData =
  (typeof SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA)[number];

export type SupportSuccessCapability = {
  id: SupportSuccessCapabilityId;
  label: string;
  status: SupportSuccessCapabilityStatus;
  allowedRuntimeSurfaceToday: SupportSuccessRuntimeSurfaceToday;
  requiredRoleOrAuthBoundary: SupportSuccessRoleBoundary;
  allowedMetadata: readonly string[];
  forbiddenRawCustomerData: readonly SupportSuccessForbiddenRawCustomerData[];
  auditExpectation: string;
  monitoringExpectation: string;
  customerCommunicationExpectation: string;
  requiredTestsOrReleaseGates: readonly string[];
};

export type CustomerHealthSignal = {
  id: CustomerHealthSignalId;
  status: "future";
  computability: CustomerHealthSignalComputability;
  safeMetadata: readonly string[];
  forbiddenMetadata: readonly SupportSuccessForbiddenRawCustomerData[];
  severity: CustomerHealthSignalSeverity;
  triggerSource: string;
  eventEvidence: readonly string[];
  stateOrQuerySources: readonly string[];
  futureEventEvidence: readonly string[];
  recommendedSupportAction: string;
  customerFacing: false;
  requiredTestsOrReleaseGates: readonly string[];
};

export type SupportDiagnosticBundleContract = {
  status: "shipped";
  allowedFields: readonly string[];
  forbiddenFields: readonly SupportSuccessForbiddenRawCustomerData[];
  allowedPurpose: string;
  auditExpectation: string;
  monitoringExpectation: string;
  requiredTestsOrReleaseGates: readonly string[];
};

const commonSupportReleaseProof = [
  "tests/customer-onboarding-support-boundary.test.ts",
  "tests/event-taxonomy-onboarding-support.test.ts",
  "future support/success operations release gate required before expansion"
] as const;

const commonAllowedSupportMetadata = [
  "organization_id",
  "actor_user_id",
  "request_id",
  "plan_tier",
  "subscription_status",
  "counts",
  "status",
  "failure_code",
  "failure_category",
  "job_id",
  "contract_id",
  "export_request_id",
  "created_at",
  "updated_at"
] as const;

function capability(input: Omit<SupportSuccessCapability, "forbiddenRawCustomerData" | "requiredTestsOrReleaseGates">): SupportSuccessCapability {
  return {
    ...input,
    forbiddenRawCustomerData: SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA,
    requiredTestsOrReleaseGates: commonSupportReleaseProof
  };
}

export const SUPPORT_SUCCESS_CAPABILITIES: Record<
  SupportSuccessCapabilityId,
  SupportSuccessCapability
> = {
  account_health_snapshot: capability({
    id: "account_health_snapshot",
    label: "Account health snapshot",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: [
      ...commonAllowedSupportMetadata,
      "onboarding_milestone_counts",
      "workflow_blocker_counts",
      "active_contract_count",
      "trusted_reminder_count"
    ],
    auditExpectation: "Future health snapshot access must be audited as support/accountability evidence.",
    monitoringExpectation: "Repeated high-severity health signals should emit safe operational monitoring events.",
    customerCommunicationExpectation: "Do not expose health scores to customers until formula, copy, support, and appeal paths are proven."
  }),
  onboarding_checklist: capability({
    id: "onboarding_checklist",
    label: "Onboarding checklist",
    status: "shipped",
    allowedRuntimeSurfaceToday: "customer_services_copy",
    requiredRoleOrAuthBoundary: "customer_admin_or_owner",
    allowedMetadata: ["milestone_id", "status", "completed_at", "contract_count", "owner_count"],
    auditExpectation: "Checklist display does not create audit truth; underlying workflow actions do.",
    monitoringExpectation: "No alerting unless onboarding blockers become operational failures.",
    customerCommunicationExpectation: "Guide operators to first upload, review, owner assignment, trusted reminder, decision, and export."
  }),
  support_diagnostic_bundle: capability({
    id: "support_diagnostic_bundle",
    label: "Support diagnostic bundle",
    status: "shipped",
    allowedRuntimeSurfaceToday: "internal_ops",
    requiredRoleOrAuthBoundary: "internal_support_or_admin",
    allowedMetadata: [...commonAllowedSupportMetadata, "queue_status", "workflow_state_summary", "timestamp"],
    auditExpectation: "Diagnostic access must be purpose-limited and reviewed through internal/support audit evidence where applicable.",
    monitoringExpectation: "Suspicious diagnostic access or failed diagnostic generation should emit safe monitoring events.",
    customerCommunicationExpectation: "Use diagnostics to explain status/failure codes, not to quote customer content."
  }),
  safe_account_notes: capability({
    id: "safe_account_notes",
    label: "Safe account notes",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: ["organization_id", "actor_user_id", "note_category", "purpose_code", "created_at"],
    auditExpectation: "Future account notes require purpose, retention, and support-access review.",
    monitoringExpectation: "Monitor attempts to store raw customer content in account notes.",
    customerCommunicationExpectation: "Account notes must summarize operational status only and must not become hidden customer truth."
  }),
  escalation_workflow: capability({
    id: "escalation_workflow",
    label: "Escalation workflow",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: ["organization_id", "escalation_id", "severity", "status", "owner_role", "opened_at", "closed_at"],
    auditExpectation: "Escalations must audit severity changes, ownership, customer communication, and resolution codes.",
    monitoringExpectation: "P1/P2 escalations should emit monitoring events with safe metadata.",
    customerCommunicationExpectation: "Customer communication should use stable incident/escalation language and avoid raw evidence."
  }),
  incident_customer_communication: capability({
    id: "incident_customer_communication",
    label: "Incident customer communication",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: ["organization_id", "incident_id", "severity", "customer_communication_status", "sent_at"],
    auditExpectation: "Incident communication requires audit evidence of what was sent and who approved it.",
    monitoringExpectation: "P0/P1 incident communication delays should alert.",
    customerCommunicationExpectation: "Use clear incident status, impact, remediation, and next-update time without exposing another tenant or internals."
  }),
  support_access_review: capability({
    id: "support_access_review",
    label: "Support access review",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: [
      "organization_id",
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
    auditExpectation: "Support access review must link to data-governance support-access evidence with purpose, expiration, and safe metadata only.",
    monitoringExpectation: "Unreviewed support access should emit safe operational events.",
    customerCommunicationExpectation: "Enterprise customers should receive review evidence when this future capability ships."
  }),
  assisted_troubleshooting: capability({
    id: "assisted_troubleshooting",
    label: "Assisted troubleshooting",
    status: "shipped",
    allowedRuntimeSurfaceToday: "internal_ops",
    requiredRoleOrAuthBoundary: "internal_support_or_admin",
    allowedMetadata: [
      ...commonAllowedSupportMetadata,
      "diagnostic_code",
      "diagnostic_category",
      "recent_failure_count"
    ],
    auditExpectation: "Troubleshooting should use existing audit/monitoring evidence and must not mutate customer workflow outside shipped actions.",
    monitoringExpectation: "Repeated operational failures should emit existing monitoring events.",
    customerCommunicationExpectation: "Support can explain codes, next retry, and customer-owned next actions."
  }),
  enterprise_renewal_review: capability({
    id: "enterprise_renewal_review",
    label: "Enterprise renewal review",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredRoleOrAuthBoundary: "future_enterprise_support_gate",
    allowedMetadata: ["organization_id", "renewal_review_id", "contract_count", "coverage_summary", "status"],
    auditExpectation: "Future renewal reviews must avoid legal advice and preserve customer decision ownership.",
    monitoringExpectation: "No alerting unless tied to operational failure or committed customer process.",
    customerCommunicationExpectation: "Frame as operational adoption/coverage review, not CLM or legal review."
  }),
  billing_exception_support: capability({
    id: "billing_exception_support",
    label: "Billing exception support",
    status: "shipped",
    allowedRuntimeSurfaceToday: "internal_ops",
    requiredRoleOrAuthBoundary: "internal_support_or_admin",
    allowedMetadata: ["organization_id", "billing_provider", "billing_provider_status", "plan_tier", "subscription_status", "reason_code"],
    auditExpectation: "Billing exception changes must be audited without raw provider payloads.",
    monitoringExpectation: "Past-due or exception billing failures should emit billing monitoring events.",
    customerCommunicationExpectation: "Explain Paddle self-serve versus PayPal/manual invoice support-led exception paths."
  }),
  data_export_deletion_support: capability({
    id: "data_export_deletion_support",
    label: "Data export and deletion support",
    status: "deferred",
    allowedRuntimeSurfaceToday: "internal_ops",
    requiredRoleOrAuthBoundary: "internal_support_or_admin",
    allowedMetadata: ["organization_id", "export_request_id", "deletion_request_id", "status", "failure_code", "completed_at"],
    auditExpectation: "Deletion/export support must link to workspace deletion and governance audit evidence.",
    monitoringExpectation: "Failed or stuck deletion/export support paths should alert by severity.",
    customerCommunicationExpectation: "Communicate status, scope, and timing without exposing storage paths or raw files."
  })
} as const;

export const SUPPORT_SUCCESS_CAPABILITY_IDS = Object.keys(
  SUPPORT_SUCCESS_CAPABILITIES
) as SupportSuccessCapabilityId[];

function healthSignal(input: Omit<CustomerHealthSignal, "status" | "customerFacing" | "forbiddenMetadata" | "requiredTestsOrReleaseGates">): CustomerHealthSignal {
  return {
    ...input,
    status: "future",
    customerFacing: false,
    forbiddenMetadata: SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA,
    requiredTestsOrReleaseGates: commonSupportReleaseProof
  };
}

export const CUSTOMER_HEALTH_SIGNALS: Record<CustomerHealthSignalId, CustomerHealthSignal> = {
  no_contract_uploaded_after_signup: healthSignal({
    id: "no_contract_uploaded_after_signup",
    computability: "computable_today",
    safeMetadata: ["organization_id", "signup_age_days", "contract_count", "plan_tier"],
    severity: "P3",
    triggerSource: "onboarding milestone aggregation",
    eventEvidence: ["auth_signup_completed"],
    stateOrQuerySources: ["organization_created_at_query", "organization_scoped_contract_count"],
    futureEventEvidence: [],
    recommendedSupportAction: "Send setup guidance or offer import cleanup help."
  }),
  contracts_uploaded_but_unreviewed: healthSignal({
    id: "contracts_uploaded_but_unreviewed",
    computability: "computable_today",
    safeMetadata: ["organization_id", "uploaded_count", "unreviewed_count", "oldest_unreviewed_age_days"],
    severity: "P2",
    triggerSource: "contract review queue summary",
    eventEvidence: ["contract_upload_completed", "import_completed"],
    stateOrQuerySources: ["contract_metadata_needs_review_query", "unreviewed_contract_count"],
    futureEventEvidence: [],
    recommendedSupportAction: "Point the operator to P0 review and explain that reminders need reviewed fields."
  }),
  contracts_without_owner: healthSignal({
    id: "contracts_without_owner",
    computability: "computable_today",
    safeMetadata: ["organization_id", "contract_count", "missing_owner_count", "department"],
    severity: "P2",
    triggerSource: "owner coverage summary",
    eventEvidence: ["contract_owner_assigned"],
    stateOrQuerySources: ["owner_assignment_coverage_query", "contracts_missing_owner_query"],
    futureEventEvidence: [],
    recommendedSupportAction: "Recommend owner assignment cleanup without assigning owners silently."
  }),
  reminders_not_trusted: healthSignal({
    id: "reminders_not_trusted",
    computability: "computable_today",
    safeMetadata: ["organization_id", "blocked_reminder_count", "trusted_reminder_count", "blocking_reason_code"],
    severity: "P2",
    triggerSource: "reminder readiness summary",
    eventEvidence: ["reminder.blocked", "reminder_scheduled", "reminder_failed", "reminder_retry_scheduled"],
    stateOrQuerySources: ["trusted_reminder_count_query", "reminder_blocking_reason_summary"],
    futureEventEvidence: ["reminder.trusted", "reminder.activated"],
    recommendedSupportAction: "Explain review/owner/trust blockers and route to workflow actions."
  }),
  decisions_missing: healthSignal({
    id: "decisions_missing",
    computability: "computable_today",
    safeMetadata: ["organization_id", "undecided_count", "due_window", "owner_user_id"],
    severity: "P2",
    triggerSource: "renewal decision summary",
    eventEvidence: ["renewal_decision_recorded", "renewal_decision.created"],
    stateOrQuerySources: ["renewal_decision_status_query", "undecided_contract_count_query"],
    futureEventEvidence: [],
    recommendedSupportAction: "Route accountable users to record decisions without recommending legal outcomes."
  }),
  export_failed_repeatedly: healthSignal({
    id: "export_failed_repeatedly",
    computability: "computable_today",
    safeMetadata: ["organization_id", "export_request_id", "failure_code", "failure_category", "attempt_count"],
    severity: "P2",
    triggerSource: "export job monitoring",
    eventEvidence: [
      "contracts.export_background_failed",
      "export_sync_failed",
      "export_background_failed",
      "export_background_download_failed"
    ],
    stateOrQuerySources: ["background_export_request_status_query", "recent_export_failure_count_query"],
    futureEventEvidence: [],
    recommendedSupportAction: "Inspect preset/format/scale failure codes and recommend safe CSV/background path where appropriate."
  }),
  billing_exception_needs_followup: healthSignal({
    id: "billing_exception_needs_followup",
    computability: "computable_today",
    safeMetadata: ["organization_id", "billing_provider", "subscription_status", "plan_tier", "reason_code"],
    severity: "P2",
    triggerSource: "billing snapshot and support-led exception policy",
    eventEvidence: ["billing.webhook_synced", "billing_webhook_failed"],
    stateOrQuerySources: ["canonical_billing_snapshot", "billing_provider_policy_query"],
    futureEventEvidence: ["billing.provider_exception_configured"],
    recommendedSupportAction: "Confirm exception billing state and update customer on support-led path."
  }),
  ocr_queue_delayed: healthSignal({
    id: "ocr_queue_delayed",
    computability: "computable_today",
    safeMetadata: ["organization_id", "job_id", "queue_status", "oldest_job_age_minutes", "failure_code"],
    severity: "P2",
    triggerSource: "OCR job health summary",
    eventEvidence: ["ocr_job_failed", "ocr_job_retry_scheduled", "ocr_job_terminal_failed", "ocr_job_stale_rescued"],
    stateOrQuerySources: ["ocr_job_health_summary_query", "oldest_ocr_job_age_query"],
    futureEventEvidence: [],
    recommendedSupportAction: "Check OCR queue health and communicate retry/failure code without document content."
  }),
  support_escalation_open: healthSignal({
    id: "support_escalation_open",
    computability: "future_only",
    safeMetadata: ["organization_id", "escalation_id", "severity", "status", "opened_at"],
    severity: "P1",
    triggerSource: "future escalation workflow",
    eventEvidence: [],
    stateOrQuerySources: [],
    futureEventEvidence: ["support.escalation_opened"],
    recommendedSupportAction: "Assign an escalation owner and define customer communication timing."
  }),
  enterprise_security_review_pending: healthSignal({
    id: "enterprise_security_review_pending",
    computability: "future_only",
    safeMetadata: ["organization_id", "review_id", "status", "requested_at", "owner_role"],
    severity: "P3",
    triggerSource: "future enterprise security review workflow",
    eventEvidence: [],
    stateOrQuerySources: [],
    futureEventEvidence: ["support.enterprise_security_review_requested"],
    recommendedSupportAction: "Track requested security materials and avoid making unsupported compliance claims."
  })
} as const;

export const CUSTOMER_HEALTH_SIGNAL_IDS = Object.keys(
  CUSTOMER_HEALTH_SIGNALS
) as CustomerHealthSignalId[];

export const SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT: SupportDiagnosticBundleContract = {
  status: "shipped",
  allowedFields: [
    "organization_id",
    "plan_tier",
    "subscription_status",
    "billing_provider",
    "contract_count",
    "reviewed_contract_count",
    "unreviewed_contract_count",
    "missing_owner_count",
    "trusted_reminder_count",
    "blocked_reminder_count",
    "decision_status_counts",
    "workflow_state_summary",
    "failure_code",
    "failure_category",
    "queue_status",
    "export_request_id",
    "reminder_job_id",
    "ocr_job_id",
    "contract_id",
    "request_id",
    "created_at",
    "updated_at",
    "last_success_at",
    "last_failure_at"
  ],
  forbiddenFields: SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA,
  allowedPurpose: "Support diagnostics may explain status, counts, job health, and failure codes without exposing customer content.",
  auditExpectation: "Diagnostic access should be purpose-limited and auditable through internal support controls.",
  monitoringExpectation: "Suspicious or failed diagnostic access emits safe monitoring metadata only.",
  requiredTestsOrReleaseGates: commonSupportReleaseProof
} as const;

export function isSupportDiagnosticBundleFieldAllowed(field: string) {
  return (
    SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT.allowedFields.includes(field) &&
    !SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT.forbiddenFields.includes(
      field as SupportSuccessForbiddenRawCustomerData
    )
  );
}

export function isCustomerHealthSignalMetadataSafe(signalId: CustomerHealthSignalId, field: string) {
  const signal = CUSTOMER_HEALTH_SIGNALS[signalId];
  return (
    signal.safeMetadata.includes(field) &&
    !signal.forbiddenMetadata.includes(field as SupportSuccessForbiddenRawCustomerData)
  );
}
