export const PHASE1_ANALYTICS_EVENT_NAMES = [
  "auth_signup_completed",
  "contract_upload_completed",
  "import_started",
  "import_completed",
  "import_failed",
  "extraction_completed",
  "extraction_failed",
  "contract_review_completed",
  "contract_owner_assigned",
  "reminder_scheduled",
  "reminder_sent",
  "reminder_failed",
  "acknowledgment_recorded",
  "renewal_decision_recorded",
  "export_requested",
  "billing_checkout_started",
  "checkout_completed",
  "internal_rescue_action_recorded"
] as const;

export type Phase1AnalyticsEventName = (typeof PHASE1_ANALYTICS_EVENT_NAMES)[number];
