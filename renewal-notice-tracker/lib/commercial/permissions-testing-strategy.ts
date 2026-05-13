export type PermissionRisk = {
  risk: string;
  attackOrFailureScenario: string;
  automatedTestsNeeded: string[];
  manualQaChecksNeeded: string[];
  releaseBlockingSeverity: "P0" | "P1" | "P2";
};

export const permissionRiskMap: PermissionRisk[] = [
  {
    risk: "org membership boundaries",
    attackOrFailureScenario:
      "A user without active membership in the current organization can still load workspace data, mutate records, or retain stale access after membership changes.",
    automatedTestsNeeded: [
      "integration test: protected routes reject unauthenticated and non-member users",
      "integration test: membership lookup failure blocks server actions",
      "e2e test: removed member loses access after session refresh"
    ],
    manualQaChecksNeeded: [
      "verify a removed member cannot continue browsing previously open contract pages",
      "verify org switchers and direct links do not reveal data for non-member orgs"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "owner/admin/member role behavior",
    attackOrFailureScenario:
      "A lower-privilege member can perform admin-only org actions, or owner/member distinctions are enforced only in UI but not in backend actions.",
    automatedTestsNeeded: [
      "integration test: admin-only settings mutation is blocked for members",
      "integration test: admin/debug routes deny non-admin users",
      "component/integration test: hidden UI is backed by real backend denial"
    ],
    manualQaChecksNeeded: [
      "verify member accounts cannot reach admin actions via copied URLs",
      "verify owner-assignment workflows do not grant broader admin powers implicitly"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to contracts from another org",
    attackOrFailureScenario:
      "A user changes an ID, filter, or route param and can read or mutate another organization's contracts.",
    automatedTestsNeeded: [
      "integration test: contract queries are scoped by organization_id",
      "integration test: contract detail route denies cross-org contract IDs",
      "integration test: update actions reject cross-org contract references"
    ],
    manualQaChecksNeeded: [
      "attempt direct navigation to another org's contract detail URL",
      "attempt mutation via stale bookmarked URLs after changing active org"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to exports from another org",
    attackOrFailureScenario:
      "A user can export another organization's contracts through direct export URLs, manipulated filters, or stale session context.",
    automatedTestsNeeded: [
      "integration test: export routes scope results to current organization only",
      "integration test: cross-org contract filters do not widen export payloads",
      "integration test: blocked users receive denial rather than empty but successful export"
    ],
    manualQaChecksNeeded: [
      "download exports from multiple role/org combinations and inspect contents",
      "verify direct export links do not work after switching to a different org"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to billing routes",
    attackOrFailureScenario:
      "A non-admin or cross-org user can open checkout/manage routes, alter billing state, or view billing portal links they should not control.",
    automatedTestsNeeded: [
      "integration test: checkout route requires admin membership in current org",
      "integration test: billing portal route denies members and non-members",
      "integration test: billing routes use current org context rather than user-global state"
    ],
    manualQaChecksNeeded: [
      "verify members cannot reach billing from copied settings URLs",
      "verify cross-org admins only operate on the currently selected org"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to admin routes",
    attackOrFailureScenario:
      "A member or outside user can open debug pages, inspect failures, or trigger high-power rescue actions.",
    automatedTestsNeeded: [
      "integration test: admin routes deny non-admin users",
      "e2e test: non-admin cannot access admin/debug screens by direct URL",
      "integration test: admin queries are organization-scoped"
    ],
    manualQaChecksNeeded: [
      "verify failed reminder and extraction debug panels are invisible and inaccessible to members",
      "verify admin-only rescue buttons are not actionable via browser devtools"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to reminder reruns/resends",
    attackOrFailureScenario:
      "A lower-privilege user or wrong-org user can rerun reminders or resend notifications, causing duplicate or unauthorized sends.",
    automatedTestsNeeded: [
      "integration test: rerun reminder action checks admin role and org ownership",
      "integration test: resend notification action checks admin role and org ownership",
      "integration test: stale reminder IDs from another org are rejected"
    ],
    manualQaChecksNeeded: [
      "attempt reminder rerun from a non-admin session using forged form submissions",
      "verify rescue actions cannot be executed from a copied admin page after role downgrade"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to settings and org-level integrations",
    attackOrFailureScenario:
      "A member can update digest settings, notification destinations, or org-wide integrations through direct actions or hidden form fields.",
    automatedTestsNeeded: [
      "integration test: settings mutations require admin role",
      "integration test: integration configuration is scoped to org and role",
      "integration test: invalid or unauthorized settings submissions fail safely"
    ],
    manualQaChecksNeeded: [
      "verify non-admin users cannot save settings through edited DOM forms",
      "verify integration config is isolated per organization"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "access to import/export history",
    attackOrFailureScenario:
      "A user can inspect import jobs, job errors, or historical export context for another org or without required privileges.",
    automatedTestsNeeded: [
      "integration test: import job queries are organization-scoped",
      "integration test: admin/debug import history is role-protected",
      "integration test: export history views do not leak another org's metadata"
    ],
    manualQaChecksNeeded: [
      "verify import job and failure history is not visible across orgs",
      "verify history pages remain blocked by direct URL for members"
    ],
    releaseBlockingSeverity: "P1"
  },
  {
    risk: "hidden vs protected UI",
    attackOrFailureScenario:
      "Buttons are hidden in the interface, but backend routes/actions still allow the behavior if a user crafts a request manually.",
    automatedTestsNeeded: [
      "paired component plus integration tests for every sensitive action",
      "integration test: hidden commercial/admin actions still reject unauthorized posts",
      "e2e test: copied or forged requests fail even when UI hides controls"
    ],
    manualQaChecksNeeded: [
      "use browser devtools to unhide or submit disabled forms",
      "attempt direct POSTs to hidden action endpoints"
    ],
    releaseBlockingSeverity: "P0"
  },
  {
    risk: "route-level protection vs action-level protection",
    attackOrFailureScenario:
      "A protected page blocks access, but its underlying server action, route handler, or form endpoint can still be called directly.",
    automatedTestsNeeded: [
      "integration test: every sensitive server action enforces auth, org, and role checks independently",
      "integration test: route handlers and server actions fail closed without session context",
      "audit test matrix mapping each sensitive UI flow to backend protection"
    ],
    manualQaChecksNeeded: [
      "exercise sensitive endpoints directly without loading the page first",
      "verify stale session and cross-tab behavior does not bypass backend protection"
    ],
    releaseBlockingSeverity: "P0"
  }
];

export const topCriticalPermissionTests = [
  "Cross-org contract detail access is denied for reads and writes.",
  "Export routes return only current-org data and deny cross-org access attempts.",
  "Billing checkout/manage routes require admin role in the active organization.",
  "Admin/debug routes and rescue actions deny members and non-members.",
  "Settings and org-level integration mutations require admin role.",
  "Reminder rerun and resend actions reject wrong-org and non-admin submissions.",
  "Sensitive server actions fail closed even when invoked directly without UI.",
  "Role downgrade or membership removal revokes access after refresh and direct-route attempts.",
  "Multi-org users operate only on the explicitly active organization.",
  "Hidden controls are backed by real authorization, not cosmetic UI hiding."
];

export const biggestAuthorizationMistakes = [
  "Relying on hidden UI instead of backend authorization.",
  "Scoping list pages to org correctly but forgetting detail, export, or mutation routes.",
  "Protecting page routes but not the underlying server actions or form posts.",
  "Using user identity checks without verifying current organization membership.",
  "Allowing role checks at page render time but not at mutation time.",
  "Trusting client-supplied org IDs or contract IDs without ownership verification.",
  "Not revoking access cleanly after role downgrade or membership removal.",
  "Letting cross-org admins accidentally operate on the wrong active organization.",
  "Treating import/export history as low-risk metadata when it still exposes customer data.",
  "Forgetting that admin rescue tools are some of the highest-risk authorization surfaces."
];

