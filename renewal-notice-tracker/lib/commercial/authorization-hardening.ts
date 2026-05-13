export type PermissionMatrixRow = {
  permission: string;
  owner: "allow" | "deny" | "conditional";
  admin: "allow" | "deny" | "conditional";
  member: "allow" | "deny" | "conditional";
  notes: string;
};

export type AuthorizationSection = {
  title: string;
  summary: string;
  items: string[];
};

export const authorizationCritique = {
  currentLikelyModel: [
    "The current model is small and understandable: owner, admin, and member.",
    "Route-level authorization is already present on billing, admin, and some settings/admin actions.",
    "Org-level access is derived from membership, but active-org handling still looks too implicit.",
    "Object-level safety is only as good as the underlying helper path when service-role code is used."
  ],
  whatIsGood: [
    "Small role model is the right starting point for this product.",
    "Owner/admin separation exists for several high-power flows already.",
    "Many contract and export reads are already org-scoped in query helpers."
  ],
  whatIsWeak: [
    "Too much trust is still placed in route-level guards instead of action-level object authorization.",
    "The same owner/admin bucket is being used for both customer-admin workflows and high-power debug/rescue flows.",
    "Member capabilities are not dangerous by intent, but can become dangerous if raw-id writes are not object-scoped."
  ],
  whatNeedsCorrection: [
    "RBAC should be action-based, not page-based.",
    "Every privileged action should verify active org, membership, role, and object ownership.",
    "Internal/debug capability should not automatically equal standard customer-admin capability."
  ]
};

export const roleModel: AuthorizationSection = {
  title: "Role model",
  summary: "Keep the role system small, but make responsibilities explicit.",
  items: [
    "owner: billing owner, org-level configuration owner, member management owner, privileged export and rescue authority.",
    "admin: operational admin inside the org, including workflow configuration and most org-level settings, but not all org-lifecycle or billing-owner actions.",
    "member: contract workflow contributor who can operate on contracts inside the org but cannot change org-wide commercial, integration, or high-power admin state."
  ]
};

export const permissionMatrix: PermissionMatrixRow[] = [
  {
    permission: "view_org_workspace",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Requires active membership in the selected organization."
  },
  {
    permission: "view_contracts_and_contract_detail",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Must always be scoped to active organization plus contract ownership boundary."
  },
  {
    permission: "create_or_edit_contracts",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Allowed inside the active org; all writes must bind organization_id server-side."
  },
  {
    permission: "review_extraction_and_save_corrections",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Review is core workflow and should not be artificially admin-gated."
  },
  {
    permission: "assign_owner_status_and_decision",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Core workflow action, but all referenced users must belong to the same active organization."
  },
  {
    permission: "create_manual_reminders_and_rules",
    owner: "allow",
    admin: "allow",
    member: "allow",
    notes: "Plan gates still apply; authorization is org-scoped, not role-scoped."
  },
  {
    permission: "send_manual_digest_or_manage_digest_defaults",
    owner: "allow",
    admin: "allow",
    member: "deny",
    notes: "Digest behavior is org-level operational communication, not a member-level action."
  },
  {
    permission: "export_contract_data",
    owner: "allow",
    admin: "allow",
    member: "conditional",
    notes: "Recommended default: deny for members unless later introduced as a deliberate reporting role; keep exports high-trust."
  },
  {
    permission: "view_import_export_history",
    owner: "allow",
    admin: "allow",
    member: "deny",
    notes: "Operational history leaks sensitive metadata and should stay admin-scoped."
  },
  {
    permission: "manage_org_settings_and_integrations",
    owner: "allow",
    admin: "allow",
    member: "deny",
    notes: "Includes billing email, notification endpoints, Slack/Teams, and org defaults."
  },
  {
    permission: "access_billing_checkout_portal_and_plan_changes",
    owner: "allow",
    admin: "conditional",
    member: "deny",
    notes: "Best default is owner-only for plan-changing authority; admin may be allowed only if business explicitly wants delegated purchasing."
  },
  {
    permission: "access_admin_debug_tools",
    owner: "allow",
    admin: "conditional",
    member: "deny",
    notes: "Split normal org admin from high-power debug/rescue authority where possible."
  },
  {
    permission: "rerun_reminders_or_resend_notifications",
    owner: "allow",
    admin: "conditional",
    member: "deny",
    notes: "High-power rescue flows should require stricter authority than normal workflow actions."
  },
  {
    permission: "access_internal_health_and_internal_operator_routes",
    owner: "deny",
    admin: "deny",
    member: "deny",
    notes: "Internal health and operator routes should not be customer-RBAC features at all."
  }
];

export const objectLevelAccessRules: AuthorizationSection = {
  title: "Object-level access rules",
  summary: "Every tenant-bound object must be protected by org membership and explicit object ownership verification.",
  items: [
    "Contracts, reminders, notification logs, exports, import jobs, evidence rows, notes, playbook runs, and renewal decisions must always be fetched by organization_id plus object id.",
    "Server actions and route handlers must never trust client-supplied organization_id; derive org context server-side.",
    "Cross-object actions like resend notification and rerun reminder must verify that the child object and all linked parent objects belong to the active organization.",
    "Assignment targets such as owner user ids must be validated against current active-org membership, not just existence."
  ]
};

export const routeVsActionProtectionRules: AuthorizationSection = {
  title: "Route-level vs action-level protection rules",
  summary: "Page protection is necessary for UX, but security lives in actions and data access.",
  items: [
    "Use route-level guards to block obvious navigation and reduce accidental exposure.",
    "Use action-level authorization on every server action, route handler, webhook mutation, export path, and rescue path.",
    "Action-level authorization must survive copied URLs, forged form posts, hidden UI manipulation, stale tabs, and direct HTTP calls.",
    "Any service-role code path must perform authorization and object-scope checks explicitly because RLS no longer protects it."
  ]
};

export const hiddenUiRules: AuthorizationSection = {
  title: "Hidden UI vs actual authorization rules",
  summary: "Hidden controls are convenience only; they are never security.",
  items: [
    "Hide unavailable controls to reduce confusion, but always pair every hidden control with backend denial.",
    "Do not assume disabled buttons, removed menu items, or client-side role checks provide protection.",
    "Audit denied attempts on sensitive actions because hidden-UI bypass attempts are security signals."
  ]
};

export const defaultDenyDesign: AuthorizationSection = {
  title: "Default-deny design",
  summary: "Fail closed whenever org, role, or object scope is missing or ambiguous.",
  items: [
    "No membership means no org access.",
    "No explicit active org means no privileged action.",
    "No verified object ownership means deny, even for owner/admin users.",
    "No explicit permission mapping for a new action means deny until assigned deliberately."
  ]
};

export const privilegedEscalationPath: AuthorizationSection = {
  title: "Escalation path for privileged actions",
  summary: "High-power actions should require stronger authority and traceability than normal workflow steps.",
  items: [
    "Billing plan changes should default to owner-only authority.",
    "Admin rescue actions like rerun reminder or resend notification should be owner-only or owner-plus-designated-admin with explicit audit reason.",
    "Internal health and operator tooling should sit outside normal customer RBAC completely.",
    "Future destructive org-level actions should require stronger confirmation and explicit audit context."
  ]
};

export const auditRequirements: AuthorizationSection = {
  title: "Audit requirements for sensitive actions",
  summary: "Sensitive authorization decisions need visible traceability.",
  items: [
    "Audit org settings changes, integration endpoint changes, billing portal opens, checkout starts, plan changes, member-role changes, rescue actions, and denied privileged attempts.",
    "Audit actor_user_id, organization_id, object ids, action, result, and enough context to investigate without leaking secrets.",
    "Record when authorization falls back to deny due to missing org context, missing membership, or cross-org object mismatch."
  ]
};

export const highestRiskAuthorizationGaps = [
  "Route-level protection being mistaken for complete authorization.",
  "Service-role helper functions acting on reminder, notification, export, or job ids without verifying organization ownership.",
  "Implicit active-org selection through first membership instead of explicit context.",
  "Owner/admin debug and rescue capabilities being broader than necessary.",
  "Members retaining read or action capability through stale links, stale sessions, or copied URLs.",
  "Exports being treated as just another feature instead of a high-trust data exfiltration surface.",
  "Internal health access being mixed with customer-admin concepts.",
  "Assignment and member-target actions not verifying target user membership inside the active org."
];

export const bestImplementationApproach: AuthorizationSection = {
  title: "Best implementation approach",
  summary: "Centralize permission logic, keep the role model small, and make object scoping mandatory in every trusted path.",
  items: [
    "Step 1: introduce explicit active-organization context instead of first-membership inference.",
    "Step 2: build a shared authorization layer with named permissions and object-scope helpers.",
    "Step 3: refactor all service-role server actions and route handlers to require organization-bound object checks.",
    "Step 4: split customer-admin RBAC from true internal-operator capability.",
    "Step 5: add negative authorization tests for every sensitive route and action, especially exports, billing, settings, rescue, and debug flows."
  ]
};
