export const FUTURE_ANALYTICS_EVENT_NAMES = [
  "digest_sent",
  "escalation_rule_created",
  "playbook_applied",
  "account_inactivity_flagged",
  "health_score_snapshot",
  "profitability_snapshot",
  "customer_success_intervention",
  "slack_delivery_attempted",
  "slack_delivery_succeeded",
  "slack_delivery_failed",
  "teams_delivery_attempted",
  "teams_delivery_succeeded",
  "teams_delivery_failed",
  "calendar_sync_started",
  "calendar_sync_completed",
  "calendar_sync_failed"
] as const;

export type FutureAnalyticsEventName = (typeof FUTURE_ANALYTICS_EVENT_NAMES)[number];
