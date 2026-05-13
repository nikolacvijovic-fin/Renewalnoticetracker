import {
  CUSTOMER_ROLES,
  SHIPPED_FIRST_CYCLE_STATUSES,
  SHIPPED_FIRST_DECISION_STATUSES,
  SHIPPED_FIRST_SCOPE
} from "@/lib/product/shipping-profile";

export const APP_NAME = SHIPPED_FIRST_SCOPE.appName;
export const LEGAL_DISCLAIMER =
  "This product is an operational reminder tool and not legal advice. Users must review extracted terms before relying on reminders.";

export const CONTRACT_FILTERS = [
  "all",
  "active",
  "needs_review",
  "expiring_soon",
  "auto_renewal"
] as const;

export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export const CONTRACT_PROCESSING_STATUSES = [
  "uploaded",
  "queued_for_text_extraction",
  "extracting_text",
  "text_extracted",
  "text_extraction_failed",
  "queued_for_field_extraction",
  "extracting_fields",
  "extraction_failed",
  "needs_review",
  "reviewed",
  "reminder_generation_pending",
  "reminders_scheduled",
  "archived"
] as const;

export type ContractProcessingStatus = (typeof CONTRACT_PROCESSING_STATUSES)[number];

export const PLAN_TIERS = ["free", "starter", "growth", "portfolio"] as const;
export const SUBSCRIPTION_STATUSES = [
  "inactive",
  "trialing",
  "active",
  "past_due",
  "cancelled"
] as const;
export const CONTRACT_STATUS_TAGS = [
  "draft",
  "in_review",
  "approved",
  "active",
  "renewal_watch",
  "terminated"
] as const;

export const RENEWAL_DECISION_STATUSES = SHIPPED_FIRST_DECISION_STATUSES;
export const RENEWAL_CYCLE_STATUSES = SHIPPED_FIRST_CYCLE_STATUSES;
export const MEMBERSHIP_ROLES = CUSTOMER_ROLES;

export const REMINDER_RETRY_POLICY = {
  maxAttempts: 4,
  baseDelayMinutes: 15,
  terminalStatuses: ["sent", "failed_terminal", "cancelled"] as const
};

export const NOTIFICATION_CHANNELS = ["email"] as const;
