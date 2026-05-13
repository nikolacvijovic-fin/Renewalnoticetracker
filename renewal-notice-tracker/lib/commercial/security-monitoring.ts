export type SecurityMonitoringSection = {
  title: string;
  summary: string;
  items: string[];
};

export const suspiciousAuthLogging: SecurityMonitoringSection = {
  title: "Suspicious auth event logging",
  summary: "Auth logs should help detect abuse, enumeration, and context confusion without becoming a privacy leak.",
  items: [
    "Log magic-link requested, magic-link redeemed, auth callback failed, password reset requested, password updated, sign-out, and redirect sanitization fallback.",
    "Log repeated auth requests by IP or email hash when throttles or abuse controls trigger.",
    "Log first-login bootstrap events and failures where organization context is created or selected.",
    "Record result, actor identifier, request fingerprint, and active organization context when available."
  ]
};

export const adminActionLogging: SecurityMonitoringSection = {
  title: "Admin action logging",
  summary: "Admin and rescue tooling needs deeper logging than ordinary user workflow because the blast radius is higher.",
  items: [
    "Log admin page access, resend notification, rerun reminder, manual digest trigger, settings mutations, integration endpoint changes, and privileged denials.",
    "Include actor_user_id, organization_id, target entity ids, action, result, and reason code.",
    "Attach correlation ids so admin actions can be joined to downstream reminder, notification, webhook, or extraction effects."
  ]
};

export const billingAnomalyLogging: SecurityMonitoringSection = {
  title: "Billing anomaly logging",
  summary: "Billing logs should highlight drift, misuse, and unusual commercial state changes quickly.",
  items: [
    "Log checkout started, checkout denied, billing portal opened, invalid plan requested, webhook synced, duplicate webhook ignored, and impossible subscription transition rejected.",
    "Log plan downgrade, plan upgrade, past_due transition, cancelled transition, and entitlement mismatch detection.",
    "Include provider, organization_id, plan_tier, previous state, next state, and event correlation id."
  ]
};

export const exportAnomalyLogging: SecurityMonitoringSection = {
  title: "Export anomaly logging",
  summary: "Exports are high-trust exfiltration surfaces and need explicit anomaly visibility.",
  items: [
    "Log export attempted, export completed, export denied, export row count, and export format.",
    "Log repeated denied exports, high-volume export bursts, and export attempts from recently downgraded accounts.",
    "Record actor, organization_id, format, filters used, and result."
  ]
};

export const reminderAnomalyLogging: SecurityMonitoringSection = {
  title: "Reminder anomaly logging",
  summary: "Reminder monitoring should catch wrong behavior, duplicates, retries, and rescue-pattern abuse early.",
  items: [
    "Log reminder processing started, reminder sent, retry scheduled, terminal failure, duplicate suppression, rerun requested, resend requested, and empty-recipient/invalid-recipient failures.",
    "Track send volume, failure volume, duplicate suppression volume, and rescue-action volume per org.",
    "Use correlation ids linking cron trigger, reminder run, notification log, and provider result."
  ]
};

export const webhookFailureLogging: SecurityMonitoringSection = {
  title: "Webhook failure logging",
  summary: "Webhook observability needs enough detail to detect fraud, drift, and integration failure without leaking secrets.",
  items: [
    "Log signature validation failure, mapping failure, duplicate event ignored, transition rejected, sync success, and sync failure.",
    "Store provider, event id, correlation id, organization mapping status, and high-level failure class.",
    "Do not store full payload bodies, raw signatures, or tokens in the log stream."
  ]
};

export const unauthorizedAccessLogging: SecurityMonitoringSection = {
  title: "Repeated unauthorized access logging",
  summary: "Repeated denials are often the earliest signal of abuse, stale sessions, or broken permission assumptions.",
  items: [
    "Log unauthorized access attempts to billing, admin, export, settings, internal health, rescue actions, and tenant-bound objects.",
    "Track repeated denials by actor, IP/request fingerprint, endpoint, and organization context.",
    "Separate ordinary stale-session denials from suspicious repeated or cross-org denial patterns."
  ]
};

export const breachDetectionIdeas: SecurityMonitoringSection = {
  title: "Tenant-boundary breach detection ideas",
  summary: "You want early signals that org scoping is broken or being attacked, even before a customer reports it.",
  items: [
    "Alert on any denied cross-org object access attempt involving contracts, reminders, notification logs, exports, settings, or admin tools.",
    "Flag any server-side event where object organization_id does not match active organization context.",
    "Track impossible combinations like actor in org A successfully operating on entity later resolved to org B.",
    "Add review tasks for repeated cross-org denial attempts even when blocked correctly."
  ]
};

export const internalToolAbuseIdeas: SecurityMonitoringSection = {
  title: "Internal-tool abuse detection ideas",
  summary: "Internal and admin surfaces should be monitored like privileged control planes.",
  items: [
    "Alert on repeated admin rescue actions in a short window, especially resend and rerun spikes.",
    "Alert on internal health secret failures, unusual secret-based access frequency, and off-pattern access times if available.",
    "Flag customer-admin sessions repeatedly touching debug-heavy surfaces without normal operational context.",
    "Track when admin surfaces are used mostly for rescue and failure review rather than normal workflow, because that may signal deeper reliability issues or misuse."
  ]
};

export const alertThresholds: SecurityMonitoringSection = {
  title: "Alert thresholds",
  summary: "Thresholds should be tied to real business and trust risk, not generic noisy counters.",
  items: [
    "Immediate alert: any confirmed or highly probable cross-tenant success event.",
    "Immediate alert: webhook signature failures spiking above baseline in a short window.",
    "Immediate alert: reminder send failures or duplicate suppression spikes that threaten reminder trust.",
    "Immediate alert: repeated failed access to internal health or secret-protected routes.",
    "Daily review: repeated denied exports, repeated denied billing access, repeated admin-route denials, or repeated invalid plan requests.",
    "Weekly review: orgs with abnormal rescue volume, abnormal digest volume, or recurring processing failures that point to structural risk."
  ]
};

export const whatToLog: SecurityMonitoringSection = {
  title: "What to log",
  summary: "Log enough structured data to investigate security and trust events without logging the sensitive content itself.",
  items: [
    "Actor id or machine actor, organization_id, endpoint/action, entity ids, result, denial/failure code, and correlation id.",
    "Provider name and provider event id for billing webhooks.",
    "Request fingerprint or coarse source metadata for auth abuse and secret-protected endpoints.",
    "Counts, states, and result classes rather than raw payload copies."
  ]
};

export const whatNotToLog: SecurityMonitoringSection = {
  title: "What not to log",
  summary: "Security logs should never become a second secret store or content archive.",
  items: [
    "Do not log secrets, shared tokens, webhook signatures, raw auth tokens, or provider credentials.",
    "Do not log full contract text, full evidence snippets, or broad customer content unless there is a deliberate secure forensic store.",
    "Do not log raw provider payloads in routine application logs.",
    "Do not log more personal data than needed to identify the event and investigate it."
  ]
};

export const immediateAlerts: SecurityMonitoringSection = {
  title: "What should alert immediately",
  summary: "Immediate alerts are for likely security incidents or trust failures with live customer impact.",
  items: [
    "Cross-tenant success or near-success indicators.",
    "Webhook signature failure spikes or billing transition anomalies.",
    "Secret-protected endpoint abuse or unusual internal health access patterns.",
    "Reminder duplicate/failure anomalies that threaten external trust.",
    "Unexpected surge in privileged rescue actions."
  ]
};

export const reviewTasks: SecurityMonitoringSection = {
  title: "What should create daily or weekly review tasks",
  summary: "Not every anomaly deserves a pager, but repeated weak signals should drive operational review.",
  items: [
    "Daily: repeated denied billing, admin, export, or settings access attempts.",
    "Daily: invalid plan requests, repeated auth throttles, and repeated digest denials.",
    "Weekly: top orgs by rescue actions, notification failures, processing errors, and denied sensitive actions.",
    "Weekly: trend review for suspicious auth, tenant-boundary denials, and admin/debug heavy usage."
  ]
};

export const securityDashboards: SecurityMonitoringSection = {
  title: "What dashboards and security views should exist",
  summary: "Security views should support real investigation and triage, not vanity compliance screenshots.",
  items: [
    "Auth anomaly dashboard: magic-link abuse, callback failures, rate-limit triggers, suspicious login patterns.",
    "Tenant-boundary dashboard: cross-org denial attempts, object-scope mismatches, blocked export/billing/admin access.",
    "Billing/webhook dashboard: signature failures, duplicate webhook ids, transition rejects, entitlement mismatches.",
    "Reminder integrity dashboard: send failures, duplicate suppression spikes, rescue volume, invalid recipient patterns.",
    "Admin/internal tooling dashboard: admin access volume, rescue actions, internal-health access, secret failures."
  ]
};

export const bestSecurityMonitoringApproach: SecurityMonitoringSection = {
  title: "Best implementation approach",
  summary: "Use structured security events, correlation ids, immediate alerts for real incidents, and review queues for slow-burn risk.",
  items: [
    "Centralize security-relevant event names and required properties.",
    "Route sensitive denials, admin actions, webhook events, and auth anomalies into a dedicated security event stream or view.",
    "Use alerting only for high-confidence risk and push lower-confidence patterns into daily/weekly review queues.",
    "Keep dashboards operator-focused: auth, tenant boundary, billing/webhooks, reminder integrity, and internal tooling.",
    "Make sure logging design stays privacy-safe and does not duplicate sensitive contract content."
  ]
};
