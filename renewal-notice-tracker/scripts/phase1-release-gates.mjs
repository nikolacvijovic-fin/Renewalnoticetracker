export const PHASE1_RELEASE_CRITICAL_PATHS = [
  "auth_session_callback_protection",
  "active_organization_selection",
  "upload_import",
  "review_p0",
  "assign_owner",
  "trusted_reminder_activation",
  "acknowledgment",
  "decision",
  "cycle_close_reopen",
  "csv_xlsx_export",
  "ics_export",
  "paddle_checkout_manage",
  "manual_invoice_exception",
  "internal_rescue_authz",
  "cross_tenant_denial"
];

export const PHASE1_RELEASE_QUALITY_GATES = [
  "org_safety",
  "role_safety",
  "reminder_reliability_visibility",
  "import_partial_success",
  "email_delivery_plumbing_presence",
  "audit_logging_on_trust_sensitive_actions",
  "no_deferred_runtime_feature_leakage",
  "two_week_operator_autonomy"
];

export const PHASE1_EMAIL_RELEASE_REQUIREMENTS = [
  ["RESEND_FROM_EMAIL", "shipped sender address"],
  ["NOTICECONTROL_SENDING_DOMAIN", "sending domain"],
  ["NOTICECONTROL_REPLY_TO_EMAIL", "reply-to inbox"],
  ["RESEND_WEBHOOK_SIGNING_SECRET", "email webhook signing secret"]
];

export const PHASE1_AUTONOMY_REQUIRED_CHECKLIST = [
  "upload/import",
  "review p0",
  "assign owner",
  "see trusted reminders",
  "acknowledge",
  "record decision",
  "close/reopen",
  "export if needed",
  "recover from ordinary failure states without founder interpretation"
];

export const PHASE1_HIDDEN_RESCUE_BLOCKERS = [
  "founder manually fixing import silently",
  "founder triggering reminders manually",
  "founder interpreting review states live",
  "founder editing db/admin data outside audited rescue"
];

export function getMissingReleaseMetadata(env) {
  const required = [
    ["RELEASE_SMOKE_OWNER", "smoke-check owner"],
    ["RELEASE_ROLLBACK_OWNER", "rollback owner"],
    ["RELEASE_TARGET_ENV", "target environment"]
  ];

  return required.filter(([key]) => !env[key]).map(([, label]) => label);
}

export function getMissingP0BrowserInputs(env) {
  const required = [
    ["E2E_BASE_URL", "P0 base URL"],
    ["E2E_AUTH_COOKIE_NAME", "P0 auth cookie name"],
    ["E2E_AUTH_COOKIE_VALUE", "P0 auth cookie value"],
    ["E2E_SECONDARY_AUTH_COOKIE_VALUE", "P0 secondary auth cookie value"],
    ["E2E_REVIEW_CONTRACT_PATH", "P0 seeded review contract path"],
    ["E2E_FOREIGN_CONTRACT_PATH", "P0 seeded foreign contract path"]
  ];

  return required.filter(([key]) => !env[key]).map(([, label]) => label);
}

export function getMissingEmailReleaseInputs(env) {
  return PHASE1_EMAIL_RELEASE_REQUIREMENTS.filter(([key]) => !env[key]).map(([, label]) => label);
}

export function getMissingTwoWeekAutonomyChecklist(docContent) {
  const normalized = (docContent ?? "").toLowerCase();
  const missingChecklistItems = PHASE1_AUTONOMY_REQUIRED_CHECKLIST.filter(
    (item) => !normalized.includes(item)
  );
  const missingHiddenRescueBlockers = PHASE1_HIDDEN_RESCUE_BLOCKERS.filter(
    (item) => !normalized.includes(item)
  );

  return [...missingChecklistItems, ...missingHiddenRescueBlockers];
}
