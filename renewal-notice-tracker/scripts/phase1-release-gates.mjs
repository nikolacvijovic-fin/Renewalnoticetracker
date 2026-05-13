export const PHASE1_RELEASE_CRITICAL_PATHS = [
  "sign_up_sign_in_callback_protected_session",
  "upload_one_contract",
  "review_p0",
  "assign_owner",
  "trusted_reminder_scheduling",
  "acknowledgment",
  "decision",
  "cycle_action",
  "export",
  "billing_checkout_manage",
  "internal_rescue_visibility"
];

export const PHASE1_RELEASE_QUALITY_GATES = [
  "org_safety",
  "role_safety",
  "reminder_reliability_visibility",
  "import_partial_success",
  "email_delivery_plumbing_presence",
  "audit_logging_on_trust_sensitive_actions",
  "no_deferred_runtime_feature_leakage"
];

export const PHASE1_EMAIL_RELEASE_REQUIREMENTS = [
  ["RESEND_FROM_EMAIL", "shipped sender address"],
  ["NOTICECONTROL_SENDING_DOMAIN", "sending domain"],
  ["NOTICECONTROL_REPLY_TO_EMAIL", "reply-to inbox"],
  ["RESEND_WEBHOOK_SIGNING_SECRET", "email webhook signing secret"]
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
    ["E2E_SECONDARY_AUTH_COOKIE_VALUE", "P0 secondary auth cookie value"]
  ];

  return required.filter(([key]) => !env[key]).map(([, label]) => label);
}

export function getMissingEmailReleaseInputs(env) {
  return PHASE1_EMAIL_RELEASE_REQUIREMENTS.filter(([key]) => !env[key]).map(([, label]) => label);
}
