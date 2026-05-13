export type TenantIsolationSection = {
  title: string;
  summary: string;
  items: string[];
};

export const tenantBoundaryModel: TenantIsolationSection = {
  title: "Tenant boundary model",
  summary: "The organization is the primary security boundary. Every contract, reminder, notification, export, import job, audit row, and setting must stay inside that boundary.",
  items: [
    "A user may access data only through an explicitly active organization in which they currently hold membership.",
    "Every tenant-bound object must be attributable to exactly one organization_id.",
    "Cross-org access is not a reporting bug or UX bug; it is a security incident.",
    "Customer-admin tools and internal/operator tools must not blur the tenant boundary."
  ]
};

export const orgScopingRules: TenantIsolationSection = {
  title: "Org scoping rules",
  summary: "Org scope must be derived server-side and attached to every privileged read and write.",
  items: [
    "Never trust client-supplied organization_id for authorization.",
    "Derive active organization context from authenticated membership, not from URL parameters alone.",
    "Every route handler, server action, export path, rescue path, and settings mutation must require active organization context before touching tenant-bound data.",
    "Role checks are always in addition to org scoping, never a replacement for it."
  ]
};

export const objectLookupSafetyRules: TenantIsolationSection = {
  title: "Object lookup safety rules",
  summary: "The safe lookup pattern is organization_id plus object id. Raw-id lookup is the default way multi-tenant products leak data.",
  items: [
    "Fetch contracts by organization_id plus contract id.",
    "Fetch reminders by organization_id plus reminder id, and verify linked contract belongs to the same org.",
    "Fetch notification logs by organization_id plus notification id, and verify linked reminder and contract lineage belong to the same org.",
    "Fetch exports, import jobs, playbook runs, evidence rows, settings, and audit rows by organization_id plus object id.",
    "Resend, rerun, regenerate, and export actions must re-check object ownership inside the helper, not only at route entry."
  ]
};

export const dangerousQueryPatterns = [
  "Using the service-role client and selecting by id alone on contracts, reminders, notification logs, import jobs, exports, or audit rows.",
  "Loading all users or all memberships broadly and filtering in application memory.",
  "Reading child objects without validating parent-object org lineage.",
  "Trusting stale session context or first-membership lookup for multi-org users.",
  "Returning success with empty data on unauthorized export attempts instead of explicit denial and audit.",
  "Joining across tenant tables without explicit organization filters on every leg."
];

export const rlsAndBackendEnforcement: TenantIsolationSection = {
  title: "RLS and backend enforcement recommendations",
  summary: "RLS is necessary but insufficient because privileged server code can bypass it.",
  items: [
    "Keep RLS enabled on every tenant-bearing table and add coverage whenever new tables are introduced.",
    "Treat service-role code as privileged bypass code that must manually reproduce tenant-bound authorization.",
    "Prefer org-scoped query helpers so route handlers and actions do not re-implement tenant logic inconsistently.",
    "Where possible, push object ownership checks into shared helper functions that accept active organization id explicitly.",
    "Use service-role access only when necessary for privileged workflows, and then audit aggressively."
  ]
};

export const auditChecksForTenantCrossing: TenantIsolationSection = {
  title: "Audit checks for tenant crossing",
  summary: "Tenant crossing attempts should be visible even when denied.",
  items: [
    "Audit denied access to cross-org contracts, exports, settings, billing routes, admin routes, reminder reruns, and notification resends.",
    "Record actor_user_id, active organization_id, attempted object id, action, and denial reason.",
    "Flag repeated cross-org denial attempts as suspicious behavior for review.",
    "Audit when active-org context is missing or ambiguous on privileged actions.",
    "Audit internal-route and admin-rescue access with org context every time."
  ]
};

export const tenantIsolationTestCases: TenantIsolationSection = {
  title: "Test cases to prove isolation",
  summary: "Tenant isolation must be proved with negative tests, not assumed because RLS exists.",
  items: [
    "Cross-org contract detail read is denied.",
    "Cross-org contract mutation is denied.",
    "Cross-org reminder rerun is denied even for owner/admin in another org.",
    "Cross-org notification resend is denied even for owner/admin in another org.",
    "Cross-org export route returns denial and zero leaked rows.",
    "Cross-org billing checkout and billing portal access are denied.",
    "Cross-org settings and integration mutations are denied.",
    "Cross-org admin/debug views do not expose failure logs, import jobs, or notification history.",
    "Cross-org import/export history views are denied.",
    "Multi-org users operate only on explicitly active organization context."
  ]
};

export const highestRiskTenantIsolationGaps = [
  "Service-role helper functions that can fetch tenant-bound objects by raw id.",
  "Implicit active-org resolution instead of explicit org binding.",
  "Admin rescue actions acting on reminders or notification logs without org lineage checks.",
  "Export flows that scope the UI but not the payload query.",
  "Settings, integrations, and admin/debug views that rely on page access control but not action-level object checks.",
  "Background or rescue workflows that assume object ownership because the caller is already privileged."
];

export const bestTenantIsolationApproach: TenantIsolationSection = {
  title: "Best implementation approach",
  summary: "Make org scope explicit, make raw-id access illegal for tenant objects, and test every privileged cross-org denial path.",
  items: [
    "Introduce explicit active organization context instead of first-membership inference.",
    "Refactor every service-role helper to require organization_id as an input and verify object ownership internally.",
    "Create one org-scoped data-access layer for contracts, reminders, exports, billing, settings, debug data, and history reads.",
    "Add denial auditing and negative integration tests for every high-trust cross-org path.",
    "Treat any missing organization filter on a tenant-bound object as a release blocker."
  ]
};
