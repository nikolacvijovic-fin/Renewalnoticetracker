export type AuditIntegritySection = {
  title: string;
  summary: string;
  items: string[];
};

export const alwaysAudited: AuditIntegritySection = {
  title: "What must always be audited",
  summary: "Audit the actions that change trust, money, visibility, or externally visible workflow behavior.",
  items: [
    "Contract lifecycle actions: create, upload, import, archive, delete, and materially significant metadata changes.",
    "Review actions: review completed, manual correction applied, trust state changed, evidence regenerated or replaced.",
    "Reminder actions: reminder created, reminder rule applied, reminder rerun, notification resend, reminder cancelled, escalation suppressed.",
    "Digest actions: monthly digest sent manually or by cron, digest denied by plan, digest recipient set changed.",
    "Billing actions: checkout started, portal opened, plan changed, subscription state changed, entitlement state changed.",
    "Webhook sync actions: verified webhook accepted, duplicate webhook ignored, webhook state transition rejected, webhook sync failure.",
    "Import/export actions: import initiated, import completed, import failed, export attempted, export completed, export denied.",
    "Admin and internal actions: admin page accessed, rescue action triggered, internal health accessed, privileged denial encountered.",
    "Commercial denial actions: feature denied by plan, inactive subscription denial, contract-cap denial, invalid plan request denial.",
    "Processing and integrity events: extraction failure, processing error recorded, duplicate suppression event, retry scheduled, terminal failure reached."
  ]
};

export const requiredAuditDetails: AuditIntegritySection = {
  title: "What details must be included",
  summary: "An audit row should make the action explainable without becoming a data leak.",
  items: [
    "actor_user_id when a human initiated the action, or a system/machine actor identifier for automated flows.",
    "organization_id on every tenant-bound audit event.",
    "entity_type and entity_id for the primary object affected.",
    "action name and result status such as success, denied, failed, ignored_duplicate, or cancelled.",
    "correlation or trace id for joining related webhook, cron, extraction, reminder, or notification events.",
    "high-level reason code or context such as feature name, denial class, route source, or failure class.",
    "before/after metadata only where needed, and only in minimal redacted form."
  ]
};

export const tamperResistance: AuditIntegritySection = {
  title: "Tamper-resistance expectations",
  summary: "Audit logs are only useful if operators and customers can trust that they were not quietly rewritten.",
  items: [
    "Audit logs should be append-only from the application point of view.",
    "Normal product users should never be able to edit or delete audit rows directly.",
    "Privileged maintenance access should be narrow, exceptional, and separately monitored.",
    "If stronger integrity controls are added later, prefer immutable storage or integrity-check snapshots over cosmetic 'audit mode' claims."
  ]
};

export const privacySafeAuditDesign: AuditIntegritySection = {
  title: "Privacy-safe audit design",
  summary: "Audit rows should preserve accountability without turning into a second copy of customer content.",
  items: [
    "Do not store raw contract text, full evidence snippets, webhook secrets, tokens, or full provider payloads in audit rows.",
    "Prefer reason codes, entity references, redacted field names, and counts over raw content.",
    "Store recipient counts or channel types rather than broad copies of recipient lists when full identity is not needed.",
    "Keep personally identifiable details minimal and proportional to the operational need."
  ]
};

export const traceabilityExpectations: AuditIntegritySection = {
  title: "Traceability expectations",
  summary: "High-trust workflows should be reconstructable end-to-end across user action, automation, and provider outcome.",
  items: [
    "A reminder resend should be traceable from admin action to notification log to provider outcome.",
    "A review correction should be traceable from extracted suggestion to corrected value to reminder regeneration.",
    "A billing transition should be traceable from provider webhook to normalized subscription state to entitlement result.",
    "An import problem should be traceable from job start to row-level failure summary to final imported count.",
    "A denied action should be traceable to actor, org, permission/entitlement rule, and denial reason."
  ]
};

export const auditVisibilityRules: AuditIntegritySection = {
  title: "Who should be allowed to view which audit data",
  summary: "Audit visibility should follow least privilege, not curiosity.",
  items: [
    "Members may view only narrow contract-level history if the product explicitly needs that for workflow transparency.",
    "Owners and admins may view org-scoped operational audit history relevant to their own workspace.",
    "Sensitive internal-only audit events, deeper debug traces, or machine-authenticated route details should stay out of customer-visible views.",
    "Cross-org audit access should never be part of customer RBAC.",
    "Internal operators, if they exist, need a separate access model from customer admins."
  ]
};

export const auditRetentionExpectations: AuditIntegritySection = {
  title: "Retention expectations",
  summary: "Audit retention should outlast ordinary operational logs but still be intentional and bounded.",
  items: [
    "Keep security-sensitive and billing-sensitive audit rows longer than notification or processing logs.",
    "Retain enough history to investigate disputes, reminder incidents, and offboarding questions.",
    "Document the retention window clearly instead of keeping audit data forever by inertia.",
    "If deletion obligations require minimizing data later, preserve minimal event metadata rather than broad content."
  ]
};

export const auditRedactionRules: AuditIntegritySection = {
  title: "Redaction rules",
  summary: "Audit data should be useful while still aggressively avoiding secrets and unnecessary content.",
  items: [
    "Redact webhook URLs, API tokens, provider signatures, auth tokens, and shared secrets completely.",
    "Avoid full recipient lists where counts or a single redacted sample is enough.",
    "Do not embed raw provider payloads or full parser exception dumps in audit rows.",
    "Reference contract ids and field names instead of copying full contract values unless absolutely necessary for trust.",
    "Use stable denial/failure codes instead of long raw exception strings where possible."
  ]
};

export const bestAuditIntegrityApproach: AuditIntegritySection = {
  title: "Best implementation approach",
  summary: "Audit aggressively on trust-sensitive actions, keep rows append-only and minimal, and separate customer-visible history from deeper internal traces.",
  items: [
    "Define a canonical audit event taxonomy for contract, review, reminder, billing, import/export, admin, and denial actions.",
    "Add correlation ids to webhook, cron, reminder, extraction, and import flows so audit rows can be joined safely.",
    "Keep customer-visible audit history scoped to the org and stripped of secrets or verbose machine detail.",
    "Retain audit data longer than ordinary ops logs, but with a documented retention window and redaction discipline.",
    "Treat missing audit coverage on high-trust actions as a product integrity bug, not a reporting gap."
  ]
};
