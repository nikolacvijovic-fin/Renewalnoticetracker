export type SecurityBlueprintSection = {
  title: string;
  summary: string;
  items: string[];
};

export type UnifiedSecurityBlueprint = {
  authModel: SecurityBlueprintSection;
  rolePermissionModel: SecurityBlueprintSection;
  objectAccessRules: SecurityBlueprintSection;
  tenantIsolationRules: SecurityBlueprintSection;
  internalAdminRouteRules: SecurityBlueprintSection;
  webhookCronRules: SecurityBlueprintSection;
  privacyRetentionDeletionRules: SecurityBlueprintSection;
  auditIntegrityRules: SecurityBlueprintSection;
  monitoringAlertingRules: SecurityBlueprintSection;
  topNextActions: SecurityBlueprintSection;
  topReleaseBlockers: SecurityBlueprintSection;
};

export const unifiedSecurityBlueprint: UnifiedSecurityBlueprint = {
  authModel: {
    title: "Auth model",
    summary:
      "Use a pragmatic passwordless model with server-side session enforcement, safe redirects, abuse logging, and no fake enterprise claims.",
    items: [
      "Default auth flow: email-link sign-in with protected dashboard flows and safe local-only post-auth redirects.",
      "Session posture: secure cookies, server-side session checks on protected routes and actions, and no trust in stale client auth state.",
      "Password reset/update should stay clearly scoped until a full password auth model is intentionally supported.",
      "Auth abuse controls must include rate limiting, suspicious event logging, and replay-aware callback monitoring."
    ]
  },
  rolePermissionModel: {
    title: "Role and permission model",
    summary:
      "Keep roles small and clear: owner, admin, and member. Enforce privileged actions in backend code, not just through hidden UI.",
    items: [
      "Owner: highest-trust org controls including billing, privileged rescue, and security-sensitive org administration.",
      "Admin: day-to-day org administration, settings, exports, operational review, and approved admin/debug surfaces.",
      "Member: normal workflow usage without billing, privileged rescue, or org-wide sensitive mutations.",
      "Default deny: every sensitive route, handler, and server action must explicitly check auth, org membership, and required role."
    ]
  },
  objectAccessRules: {
    title: "Object access rules",
    summary:
      "Route protection is not enough. The real trust boundary is object-level access on contracts, reminders, exports, jobs, billing state, and admin actions.",
    items: [
      "Privileged lookups must require both object id and organization_id, never raw id alone.",
      "Contract, reminder, import/export history, billing, settings, and admin/debug actions must verify org ownership before read or mutation.",
      "Hidden UI is never authorization; direct posts, copied URLs, and stale sessions must still fail closed.",
      "Review, rerun, resend, export, and settings mutations should be audited with actor, org, target object, and result."
    ]
  },
  tenantIsolationRules: {
    title: "Tenant-isolation rules",
    summary:
      "Organization boundaries are the core security property. Any cross-org data access or side effect is a release-blocking failure.",
    items: [
      "Every tenant-bound object is scoped by organization_id in queries, mutations, exports, history views, and admin/debug tooling.",
      "RLS is a strength, but privileged server code must still enforce org scoping explicitly.",
      "Cross-org access attempts, denials, and suspicious object-access patterns should be logged and reviewed.",
      "Multi-org context must be explicit; active org confusion should never silently redirect sensitive writes to the wrong tenant."
    ]
  },
  internalAdminRouteRules: {
    title: "Internal and admin route rules",
    summary:
      "Admin/debug tooling should be treated as a high-risk operational surface, not as a convenience dashboard.",
    items: [
      "/dashboard/admin should stay org-scoped and never become a generic data dump.",
      "Rerun reminder and resend notification actions should default to owner-only or tightly-scoped admin access with auditing.",
      "Internal health endpoints are machine-facing trust boundaries and should use secret-based authentication with minimal safe output.",
      "Raw provider payloads, secrets, tokens, stack traces, webhook URLs, and full sensitive content should never appear in customer-visible admin UI."
    ]
  },
  webhookCronRules: {
    title: "Webhook and cron rules",
    summary:
      "Billing webhooks and cron routes are control-plane APIs. They need machine auth, replay protection, idempotency, safe logging, and fail-closed behavior.",
    items: [
      "Webhook handlers must validate signatures, map payloads to the correct org safely, and process events idempotently.",
      "Cron routes should use secret-protected machine authentication and avoid relying on query params as the long-term posture.",
      "Reminder and digest control-plane routes need replay-aware behavior, safe error responses, and audit trails for side effects.",
      "Any wrong-org billing mutation, duplicate billing transition, or unauthorized cron execution should block release."
    ]
  },
  privacyRetentionDeletionRules: {
    title: "Privacy, retention, and deletion rules",
    summary:
      "Keep privacy practical and honest: minimize data, define retention by category, support export/deletion, and avoid overclaiming compliance maturity.",
    items: [
      "Treat contracts, extracted text, snippets, notes, notification logs, and audit trails as separate data classes with different retention expectations.",
      "Support customer export and deletion through a documented org-level process rather than vague promises.",
      "Some audit records may need bounded retention for integrity and abuse investigation; do not promise instant hard deletion everywhere.",
      "Documentation should include a privacy policy, DPA, subprocessor list, retention/deletion policy, and a realistic backup/recovery summary."
    ]
  },
  auditIntegrityRules: {
    title: "Audit and integrity rules",
    summary:
      "Auditability should explain sensitive actions without becoming a second datastore full of secrets.",
    items: [
      "Always audit contract lifecycle changes, reviews, reminder creation/rerun/resend, digest sends, billing changes, imports/exports, denials, and admin actions.",
      "Audit records should be append-only, org-scoped, traceable, privacy-safe, and role-visible only to the right audience.",
      "Include actor, org, target object, action, result, timestamp, and correlation id, but redact secrets and avoid raw contract text or full provider payloads.",
      "Missing audit coverage on high-trust actions is an integrity bug, not a reporting gap."
    ]
  },
  monitoringAlertingRules: {
    title: "Monitoring and alerting rules",
    summary:
      "Monitor for real breach and abuse conditions, not just uptime. Alert on high-confidence incidents and review slow-burn anomalies regularly.",
    items: [
      "Immediate alerts: auth abuse bursts, tenant-boundary denials, privileged admin misuse, webhook signature failures, billing drift, and reminder-integrity anomalies.",
      "Daily or weekly review: repeated unauthorized access attempts, export anomalies, reminder resend spikes, internal-tool misuse patterns, and downgrade/access mismatches.",
      "Log security-relevant intent and outcome with correlation ids, but never log secrets, tokens, raw payloads, or unnecessary contract content.",
      "Dashboards should cover auth anomalies, tenant-boundary events, billing/webhook incidents, reminder/control-plane integrity, and privileged admin activity."
    ]
  },
  topNextActions: {
    title: "Top 10 next actions",
    summary:
      "These are the highest-ROI steps to convert the current security posture from plausible to earned.",
    items: [
      "Enforce object-level org scoping on every privileged backend lookup and mutation path.",
      "Add negative authorization tests for admin, billing, export, settings, rerun, resend, and history routes.",
      "Implement webhook replay ledgering and deterministic idempotency for billing events.",
      "Tighten cron and internal endpoint authentication with header-first secrets and safer rotation posture.",
      "Reduce customer-visible admin/debug data to redacted, org-scoped operational traces only.",
      "Finalize export/deletion runbooks and align them with actual retention behavior.",
      "Document backup and restore posture for contracts, reminders, settings, and audit-relevant data.",
      "Ship a concise security overview, DPA, privacy policy, and subprocessor list.",
      "Turn security monitoring and anomaly review into a weekly operating routine.",
      "Make any tenant-boundary regression or privileged bypass a named release gate in CI and release checklists."
    ]
  },
  topReleaseBlockers: {
    title: "Top 10 release blockers",
    summary:
      "If any of these are true, real production confidence is not deserved.",
    items: [
      "Cross-org contract, reminder, export, billing, settings, or admin/debug access is possible.",
      "Privileged routes or server actions trust raw ids without explicit org scoping.",
      "Non-admin or wrong-org users can reach checkout, portal, rerun, resend, or admin surfaces.",
      "Webhook processing can mutate the wrong org or apply duplicate state transitions unsafely.",
      "Cron or internal endpoints can be triggered without valid machine authentication.",
      "Customer-visible admin/debug UI renders secrets, raw provider payloads, or overbroad sensitive data.",
      "Audit logs are missing for high-trust actions or expose secrets and raw sensitive payloads.",
      "Deletion/export behavior is undocumented or materially different from what the product claims.",
      "Reminder-control-plane failures or billing-control-plane failures are not monitored and triaged.",
      "Trust-sensitive auth, tenant, billing, and privileged abuse paths are not covered by runtime tests."
    ]
  }
};

