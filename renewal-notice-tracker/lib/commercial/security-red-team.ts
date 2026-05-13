export const securityRedTeamReview = {
  brutalCritique:
    "The product has a decent security shape on paper, but the most likely failure mode is still false confidence: strong-looking route protection, docs, and admin tooling layered on top of privileged backend paths that can drift from object-level org enforcement. The dangerous gaps are the ones that only show up under stale sessions, raw-id lookups, rescue tooling, webhook replay, and customer-visible debugging.",
  topRisks: [
    "Service-role or privileged backend code can bypass otherwise solid tenant protections if org scoping is not explicit on every sensitive lookup.",
    "Route-level protection is easier to demonstrate than object-level protection, so detail actions, exports, reruns, and settings mutations are more dangerous than the page shell suggests.",
    "Cross-org leakage risk is highest in admin/debug, import/export history, reminder rescue, and billing/support-style helper flows.",
    "Passwordless auth is fine, but auth abuse, replay-style callback behavior, and stale session context can still create weak trust boundaries if not monitored and rate-limited well.",
    "Secret-protected cron and health routes are still a control-plane surface; header/query secret misuse and replay can become a quiet reliability and abuse problem.",
    "Webhook signature validation alone is not enough if idempotency, org mapping, and state-transition correctness are weak.",
    "Audit logs can accidentally become a second sensitive datastore if they capture raw payloads, snippets, errors, or identifiers too verbosely.",
    "Privacy posture looks stronger than it really is if deletion/export mechanics and backup/restore reality are not operationally documented and practiced.",
    "Admin tooling can become an internal multi-tenant breach path if convenience wins over scoped access and redaction discipline.",
    "Release confidence is still weaker than the strategy surface suggests if the highest-risk auth, tenant, billing, and reminder paths are not all exercised as runtime tests."
  ],
  missingControls: [
    "A hard rule that all privileged object lookups must require both object id and organization_id rather than raw id only.",
    "A real privileged-action review list for admin/debug/rescue routes with explicit owner-only or owner-plus-secret requirements.",
    "Webhook replay ledgering and deterministic idempotency enforcement for every billing provider event.",
    "A documented restore test cadence for the data that actually matters: contracts, reminders, settings, and audit-relevant records.",
    "A stricter ban on rendering raw provider payloads, stack traces, tokens, or full contract-derived content in customer-visible admin UI.",
    "Cross-org anomaly detection tied to actual denial events and suspicious object-access patterns, not just generic unauthorized counts.",
    "A production-grade auth abuse and suspicious sign-in monitoring routine rather than only static hardening guidance.",
    "Explicit audit schema requirements for reminder rescue, export attempts, denials, and privileged billing actions.",
    "A customer-facing export/deletion runbook that matches what the backend can really do today.",
    "A release gate that treats any tenant-boundary regression, billing bypass, or reminder-control-plane bypass as non-negotiable blockers."
  ],
  beforeProductionConfidence: [
    "Prove object-level tenant enforcement on every privileged contract, reminder, export, billing, settings, and admin action path.",
    "Lock down admin/debug tooling so it cannot become a scoped-data dump or cross-org operator backdoor.",
    "Add replay-safe, idempotent webhook handling and stronger secret handling on cron and internal endpoints.",
    "Make deletion/export, audit visibility, and retention behavior concrete enough to survive real buyer diligence.",
    "Back the trust story with executed tests and monitored controls, not only architecture notes and UI-level checks."
  ],
  revisedPriorities: [
    "P0: object-level authorization and tenant-isolation proof on privileged backend paths",
    "P0: admin/debug/rescue hardening with redaction and org-scoped access enforcement",
    "P0: webhook and cron replay/idempotency controls plus safe error handling",
    "P0: runtime tests for cross-org, billing, export, and privileged route abuse scenarios",
    "P1: operational privacy controls for deletion/export, retention, and backup/restore readiness",
    "P1: security monitoring and review routine for auth abuse, tenant anomalies, and reminder/billing control-plane incidents",
    "P1: audit schema tightening so logs explain sensitive actions without becoming sensitive data sinks",
    "P2: buyer-facing documentation polish after the underlying controls are truly credible"
  ]
};

export const securityRedTeamWarnings = [
  "If a privileged server path trusts raw ids, the rest of the tenant story is fragile.",
  "If admin tooling shows too much, trust fails through convenience rather than attack sophistication.",
  "If deletion/export answers are vague, compliance confidence is mostly presentation.",
  "If webhook and cron controls are weak, billing and reminder integrity can drift quietly.",
  "If tests do not execute the dangerous paths, the security posture is still mostly narrative."
];

