export type InternalToolingSection = {
  title: string;
  summary: string;
  items: string[];
};

export const internalToolingRiskMap: InternalToolingSection = {
  title: "Risk map",
  summary: "Admin and internal tooling is useful, but it is also one of the easiest ways to create hidden privilege escalation, tenant leakage, and operational abuse.",
  items: [
    "/dashboard/admin concentrates reminder failures, notification logs, extraction failures, and import job visibility in one place.",
    "Resend notification and rerun reminder are high-power actions because they can create user-visible external effects.",
    "The internal health route mixes secret-based access with owner/admin access, which makes its trust boundary easy to misunderstand.",
    "Debug data often looks harmless until it contains recipient addresses, destination metadata, error details, or tenant history from the wrong org.",
    "Any admin/debug helper using service-role access without explicit org scoping is a tenant-isolation risk."
  ]
};

export const internalPrivilegeRules: InternalToolingSection = {
  title: "Privilege rules",
  summary: "Split customer-admin operational visibility from true internal/operator access.",
  items: [
    "owner/admin only: org-scoped operational admin tools that help the customer operate their own workspace safely.",
    "owner-only by default: rerun reminder, resend notification, and other actions that can trigger external side effects unless the business explicitly delegates them.",
    "secret only: internal machine-facing endpoints that are not customer features, including health checks intended for platform monitoring.",
    "both role and secret: any route that exposes privileged operational detail beyond a normal customer-admin view should require both if it remains customer-reachable at all.",
    "member never: admin/debug views, rescue actions, import/export history, notification failure logs, and integration/security diagnostics."
  ]
};

export const secretManagementRules: InternalToolingSection = {
  title: "Secret management rules",
  summary: "Internal endpoints should behave like privileged machine APIs, not convenience URLs.",
  items: [
    "Use separate secrets for cron, internal health, and any future operator endpoints.",
    "Rotate internal secrets on a defined schedule and immediately after suspected exposure.",
    "Never echo secrets, raw provider tokens, webhook URLs, or signed request material in UI, logs, or error responses.",
    "Rate-limit secret-protected endpoints and audit every hit regardless of success.",
    "Prefer a narrow allowlist of internal endpoint consumers over broadly reusable shared secrets when the platform matures."
  ]
};

export const safeAuditRules: InternalToolingSection = {
  title: "Safe audit rules",
  summary: "High-power internal actions must be attributable without turning audit logs into a secret leak.",
  items: [
    "Audit admin page access, rescue actions, internal health access, and denial events for these surfaces.",
    "Record actor, organization_id when applicable, object ids, action, result, request source, and reason code.",
    "Do not store full provider payloads, raw webhook URLs, auth tokens, or secret material in audit logs.",
    "Use trace ids or correlation ids in audit records so support and engineering can join logs without exposing payload contents."
  ]
};

export const adminUiDataProhibitions: InternalToolingSection = {
  title: "Data that should never appear in admin UI",
  summary: "The admin UI should surface enough to operate, but never enough to become a secret browser or privacy leak.",
  items: [
    "No raw provider payload bodies unless explicitly redacted and temporarily exposed in a protected internal-only tool.",
    "No full webhook URLs, secret keys, auth tokens, signature material, or provider credentials.",
    "No cross-org identifiers or history not belonging to the active organization.",
    "No raw extracted contract text or evidence snippets beyond what the normal contract review workflow already allows.",
    "No unbounded stack traces or internal exception dumps."
  ]
};

export const tenantBreachPreventionRules: InternalToolingSection = {
  title: "Avoiding tenant-isolation breach through internal tools",
  summary: "Internal tooling must be more strictly scoped than the customer product, not less.",
  items: [
    "Every admin/debug query must bind organization_id explicitly when it is a customer-facing org-admin surface.",
    "Rescue helpers must re-check org ownership of the target reminder or notification log internally.",
    "Do not use raw ids alone for reminder rerun, resend notification, import history, export history, or failure log lookups.",
    "Separate internal operator tooling from customer-admin tooling instead of overloading one screen with both concepts.",
    "Treat cross-org admin visibility as an internal-only concern with stronger controls, not a customer admin feature."
  ]
};

export const accessControlBuckets = {
  ownerAdminOnly: [
    "Org-scoped admin dashboard visibility for current-org reminder failures, import job failures, extraction failure counts, and limited notification history.",
    "Org-scoped integration and settings diagnostics that do not reveal secrets."
  ],
  ownerOnly: [
    "Resend notification.",
    "Rerun reminder.",
    "Potentially manual digest send if it is treated as an externally visible operational override.",
    "Any future destructive or side-effecting rescue control."
  ],
  secretOnly: [
    "Internal health route for machine-to-machine health checks.",
    "Future internal operator endpoints that are not customer product features."
  ],
  requireBoth: [
    "Any customer-reachable route that would expose deeper internal health/debug data than the normal org-admin screen.",
    "Any future on-demand diagnostic endpoint that returns sanitized but still sensitive operational metadata."
  ]
};

export const internalMonitoringAndAlerting: InternalToolingSection = {
  title: "Monitoring and alerting rules",
  summary: "Internal tooling should be monitored like a privileged surface, not a convenience page.",
  items: [
    "Alert on repeated rescue actions in a short window, especially resend notification spikes and rerun reminder bursts.",
    "Alert on internal health endpoint access failures, unusual request frequency, and any access from unexpected sources.",
    "Alert on denied admin/debug access attempts, especially repeated attempts by member users or wrong-org contexts.",
    "Alert on provider error spikes joined by trace id rather than dumping raw payloads into the UI."
  ]
};

export const internalReleaseBlockers = [
  "Any admin/debug view exposing another organization's logs, failures, import jobs, or notification history.",
  "Resend notification or rerun reminder working across org boundaries or for non-privileged users.",
  "Internal health route revealing sensitive data to customer roles without intended controls.",
  "Secrets, webhook URLs, or provider payload material appearing in admin UI, logs, or API responses.",
  "No audit trail for rescue actions, internal health access, or privileged debug visibility."
];

export const bestInternalToolingApproach: InternalToolingSection = {
  title: "Best implementation approach",
  summary: "Keep customer-admin tooling narrow, make rescue actions stricter than read-only visibility, and move true internal diagnostics out of customer-reachable surfaces.",
  items: [
    "Turn /dashboard/admin into an org-scoped operational console, not a catch-all internal debug dump.",
    "Make resend/rerun actions owner-only unless there is a deliberate support delegation model.",
    "Reduce the internal health route to machine-health checks only, or require both role and secret for any richer output.",
    "Add trace ids and sanitized provider error summaries instead of raw payload displays.",
    "Back every privileged admin tool with org-scoped negative tests and denial auditing."
  ]
};
