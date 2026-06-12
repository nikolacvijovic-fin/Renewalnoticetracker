import type { CommercialFeature } from "@/lib/billing/entitlements";
import type { IntelligencePermission } from "@/lib/intelligence/access";
import {
  SHIPPED_RUNTIME_ACTION_MATRIX,
  type ShippedRuntimeAction
} from "@/lib/product/action-matrix";
import {
  CUSTOMER_ROLES,
  INTERNAL_ROLES,
  type CustomerRole,
  type InternalRole
} from "@/lib/product/shipping-profile";

export const FUTURE_ENTERPRISE_ROLES = [
  "viewer",
  "security_admin",
  "billing_admin",
  "compliance_admin",
  "integration_admin",
  "report_admin",
  "support_admin_delegate",
  "finance_viewer",
  "legal_validator"
] as const;

export type FutureEnterpriseRole = (typeof FUTURE_ENTERPRISE_ROLES)[number];
export type LegacyEnterpriseRoleAlias = "member";
export type EnterpriseRoleId =
  | CustomerRole
  | InternalRole
  | FutureEnterpriseRole
  | LegacyEnterpriseRoleAlias;

export type EnterpriseRoleStatus = "shipped" | "legacy_alias" | "future" | "deferred";
export type EnterpriseRuntimeSurface =
  | "customer_runtime"
  | "internal_runtime"
  | "future_enterprise_runtime"
  | "none";
export type EnterprisePlanGate =
  | "none"
  | "starter"
  | "growth"
  | "portfolio"
  | "enterprise"
  | "internal_only"
  | "preset_specific"
  | "legacy_alias_only";
export type EnterprisePermissionBoundary =
  | "active_organization"
  | "owner_scope"
  | "commercial_feature"
  | "export_preset_policy"
  | "intelligence_permission"
  | "internal_role"
  | "internal_secret"
  | "destructive_signed_request"
  | "future_enterprise_gate";

export const ENTERPRISE_SENSITIVE_ACTION_IDS = [
  "contract_upload_import",
  "contract_review_trust_change",
  "contract_p0_edit",
  "owner_assignment",
  "extraction_preview",
  "reminder_preview",
  "reminder_creation_control",
  "reminder_dispatch_internal",
  "reminder_acknowledgment",
  "renewal_decision",
  "cycle_close_reopen",
  "export_basic",
  "export_sensitive_rich_presets",
  "export_ics",
  "intelligence_risk_explanation_access",
  "financial_intelligence_access",
  "procurement_analytics_access",
  "billing_settings_manage_checkout",
  "org_settings_manage",
  "internal_operations",
  "workspace_deletion",
  "future_sso_settings",
  "future_scim_provisioning",
  "future_permission_groups",
  "future_retention_settings",
  "future_integration_settings",
  "future_admin_delegation"
] as const;

export type EnterpriseSensitiveActionId = (typeof ENTERPRISE_SENSITIVE_ACTION_IDS)[number];

const CURRENT_CUSTOMER_SENSITIVE_ACTIONS = [
  "contract_upload_import",
  "contract_review_trust_change",
  "contract_p0_edit",
  "owner_assignment",
  "extraction_preview",
  "reminder_preview",
  "reminder_creation_control",
  "reminder_acknowledgment",
  "renewal_decision",
  "cycle_close_reopen",
  "export_basic",
  "export_sensitive_rich_presets",
  "export_ics",
  "intelligence_risk_explanation_access",
  "financial_intelligence_access",
  "procurement_analytics_access",
  "billing_settings_manage_checkout",
  "org_settings_manage",
  "workspace_deletion"
] as const satisfies readonly EnterpriseSensitiveActionId[];

const FUTURE_ENTERPRISE_SENSITIVE_ACTIONS = [
  "future_sso_settings",
  "future_scim_provisioning",
  "future_permission_groups",
  "future_retention_settings",
  "future_integration_settings",
  "future_admin_delegation"
] as const satisfies readonly EnterpriseSensitiveActionId[];

export type EnterpriseRoleDefinition = {
  id: EnterpriseRoleId;
  label: string;
  status: EnterpriseRoleStatus;
  allowedRuntimeSurface: EnterpriseRuntimeSurface;
  requiredPlanOrGate: EnterprisePlanGate;
  sensitiveActionsAllowed: readonly EnterpriseSensitiveActionId[];
  explicitlyForbiddenActions: readonly EnterpriseSensitiveActionId[];
  requiredTestsOrReleaseGates: readonly string[];
  mapsToCurrentRole?: CustomerRole | InternalRole;
  notes: string;
};

export type SensitiveActionPermissionRule = {
  id: EnterpriseSensitiveActionId;
  label: string;
  status: "shipped" | "deferred" | "future";
  allowedRuntimeSurface: EnterpriseRuntimeSurface;
  currentShippedRuntimeAction?: ShippedRuntimeAction;
  inheritsShippedActionRoles: boolean;
  allowedCustomerRoles: readonly CustomerRole[];
  allowedInternalRoles: readonly InternalRole[];
  futureOnlyRoles: readonly FutureEnterpriseRole[];
  explicitlyForbiddenRoles: readonly EnterpriseRoleId[];
  requiredBoundaries: readonly EnterprisePermissionBoundary[];
  minimumPlanOrGate: EnterprisePlanGate;
  commercialFeature?: CommercialFeature;
  intelligencePermission?: IntelligencePermission;
  ownerSurfaces: readonly string[];
  requiredTestsOrReleaseGates: readonly string[];
  notes: string;
};

const shippedActionRoles = (action: ShippedRuntimeAction) => SHIPPED_RUNTIME_ACTION_MATRIX[action];

function shippedRule(input: {
  id: EnterpriseSensitiveActionId;
  label: string;
  action: ShippedRuntimeAction;
  minimumPlanOrGate: EnterprisePlanGate;
  commercialFeature?: CommercialFeature;
  intelligencePermission?: IntelligencePermission;
  ownerSurfaces: readonly string[];
  requiredTestsOrReleaseGates: readonly string[];
  boundaries?: readonly EnterprisePermissionBoundary[];
  notes: string;
}): SensitiveActionPermissionRule {
  const roles = shippedActionRoles(input.action);
  return {
    id: input.id,
    label: input.label,
    status: "shipped",
    allowedRuntimeSurface:
      roles.customerRoles.length > 0 ? "customer_runtime" : "internal_runtime",
    currentShippedRuntimeAction: input.action,
    inheritsShippedActionRoles: true,
    allowedCustomerRoles: roles.customerRoles,
    allowedInternalRoles: roles.internalRoles,
    futureOnlyRoles: [],
    explicitlyForbiddenRoles: FUTURE_ENTERPRISE_ROLES,
    requiredBoundaries: input.boundaries ?? ["active_organization"],
    minimumPlanOrGate: input.minimumPlanOrGate,
    commercialFeature: input.commercialFeature,
    intelligencePermission: input.intelligencePermission,
    ownerSurfaces: input.ownerSurfaces,
    requiredTestsOrReleaseGates: input.requiredTestsOrReleaseGates,
    notes: input.notes
  };
}

export const ENTERPRISE_SENSITIVE_ACTION_RULES: Record<
  EnterpriseSensitiveActionId,
  SensitiveActionPermissionRule
> = {
  contract_upload_import: shippedRule({
    id: "contract_upload_import",
    label: "Contract upload/import",
    action: "upload_import",
    minimumPlanOrGate: "starter",
    commercialFeature: "manual_contracts",
    ownerSurfaces: ["/dashboard/contracts/new", "lib/actions/contracts.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:intake-review", "tests/import-action.test.ts"],
    notes: "Manual intake remains active-org scoped and belongs to admins/operators."
  }),
  contract_review_trust_change: shippedRule({
    id: "contract_review_trust_change",
    label: "Contract review and trust changes",
    action: "review_p0",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "lib/contracts/phase1-pilot.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:intake-review", "tests/review-validation.test.ts"],
    notes: "P0 review is the shipped trust gate before reminder activation."
  }),
  contract_p0_edit: shippedRule({
    id: "contract_p0_edit",
    label: "P0 field edit",
    action: "edit_p0",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "components/contracts/review-form.tsx"],
    requiredTestsOrReleaseGates: ["test:release-critical:intake-review", "tests/review-form.test.tsx"],
    notes: "Reminder-driving truth changes use the same review-capable lane."
  }),
  owner_assignment: shippedRule({
    id: "owner_assignment",
    label: "Owner assignment",
    action: "assign_owner",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "lib/actions/contracts.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/phase1-workflow-actions.test.ts"],
    notes: "Owner assignment prepares contracts for accountable workflow."
  }),
  extraction_preview: shippedRule({
    id: "extraction_preview",
    label: "Extraction preview",
    action: "preview_extraction",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/api/extract", "lib/ocr"],
    requiredTestsOrReleaseGates: ["test:ocr-trust", "tests/ocr-jobs.test.ts"],
    notes: "Extraction preview remains review tooling, not customer-visible raw truth."
  }),
  reminder_preview: shippedRule({
    id: "reminder_preview",
    label: "Reminder preview",
    action: "preview_reminders",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/api/reminders", "lib/notifications/reminders.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/reminder-policy.test.ts"],
    notes: "Reminder previews stay with review/workflow-capable users."
  }),
  reminder_creation_control: shippedRule({
    id: "reminder_creation_control",
    label: "Reminder creation/control",
    action: "manage_reminders",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/api/reminders", "lib/notifications/reminders.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/reminder-control-plane.test.ts"],
    notes: "Customer reminder schedule control is distinct from internal dispatch execution."
  }),
  reminder_dispatch_internal: shippedRule({
    id: "reminder_dispatch_internal",
    label: "Internal reminder dispatch",
    action: "internal_rescue_actions",
    minimumPlanOrGate: "internal_only",
    ownerSurfaces: ["/api/cron/send-reminders", "lib/notifications/reminders.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/send-reminders-route.test.ts"],
    boundaries: ["internal_role", "internal_secret"],
    notes: "Dispatch is internal/control-plane execution and must not become a customer RBAC grant."
  }),
  reminder_acknowledgment: shippedRule({
    id: "reminder_acknowledgment",
    label: "Reminder acknowledgment",
    action: "acknowledge_reminder",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "lib/actions/contracts.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/phase1-workflow-actions.test.ts"],
    notes: "Acknowledgment is part of the accountable owner loop."
  }),
  renewal_decision: shippedRule({
    id: "renewal_decision",
    label: "Renewal decision",
    action: "record_decision",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "components/contracts/renewal-decision-form.tsx"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/renewal-decision-form.test.tsx"],
    notes: "Business decisions belong to admins, operators, and accountable owners."
  }),
  cycle_close_reopen: shippedRule({
    id: "cycle_close_reopen",
    label: "Cycle close/reopen",
    action: "close_reopen_cycle",
    minimumPlanOrGate: "starter",
    ownerSurfaces: ["/dashboard/contracts/[id]", "lib/actions/contracts.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:workflow", "tests/contract-lifecycle.test.ts"],
    notes: "Cycle state follows the same accountability lane as decisions."
  }),
  export_basic: shippedRule({
    id: "export_basic",
    label: "Basic export",
    action: "export_csv_xlsx",
    minimumPlanOrGate: "starter",
    commercialFeature: "exports",
    ownerSurfaces: ["/dashboard/contracts/export/csv", "/dashboard/contracts/export/xlsx", "lib/contracts/export.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:exports", "tests/export-routes.test.ts"],
    notes: "Basic contract register export stays paid, scoped, and free of notes/intelligence/audit payloads."
  }),
  export_sensitive_rich_presets: {
    id: "export_sensitive_rich_presets",
    label: "Sensitive/rich export presets",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: ["admin", "operator", "reviewer"],
    allowedInternalRoles: [],
    futureOnlyRoles: [],
    explicitlyForbiddenRoles: ["owner", ...FUTURE_ENTERPRISE_ROLES],
    requiredBoundaries: ["active_organization", "commercial_feature", "export_preset_policy"],
    minimumPlanOrGate: "preset_specific",
    commercialFeature: "exports",
    ownerSurfaces: ["lib/contracts/export.ts", "lib/contracts/export-route.ts"],
    requiredTestsOrReleaseGates: ["test:release-critical:exports", "test:background-exports", "tests/export.test.ts"],
    notes: "Notes, decisions, and intelligence fields are preset-gated and must never leak into the basic export."
  },
  export_ics: shippedRule({
    id: "export_ics",
    label: "ICS export",
    action: "export_ics",
    minimumPlanOrGate: "none",
    ownerSurfaces: ["/dashboard/contracts/[id]", "/api/contracts/[id]/ics"],
    requiredTestsOrReleaseGates: ["test:release-critical:exports", "tests/ics-route.test.ts"],
    notes: "Per-contract ICS export is baseline but still active-org scoped."
  }),
  intelligence_risk_explanation_access: {
    id: "intelligence_risk_explanation_access",
    label: "Risk badge/explanation access",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: ["admin", "operator", "reviewer", "owner"],
    allowedInternalRoles: [],
    futureOnlyRoles: ["legal_validator"],
    explicitlyForbiddenRoles: ["viewer", "security_admin", "billing_admin", "compliance_admin", "integration_admin", "report_admin", "support_admin_delegate", "finance_viewer"],
    requiredBoundaries: ["active_organization", "commercial_feature", "intelligence_permission", "owner_scope"],
    minimumPlanOrGate: "growth",
    commercialFeature: "risk_scores",
    intelligencePermission: "view_risk_scores",
    ownerSurfaces: ["/dashboard/contracts", "/dashboard/contracts/[id]", "/dashboard/risk-queue", "lib/intelligence/access.ts"],
    requiredTestsOrReleaseGates: ["test:intelligence-release-gate", "tests/intelligence-surface-entitlement-consistency.test.tsx"],
    notes: "Owners are owner-scoped for explanations/badges; future legal validator is documented but not active."
  },
  financial_intelligence_access: {
    id: "financial_intelligence_access",
    label: "Financial intelligence access",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: ["admin"],
    allowedInternalRoles: [],
    futureOnlyRoles: ["finance_viewer"],
    explicitlyForbiddenRoles: ["operator", "reviewer", "owner", "viewer", "security_admin", "billing_admin", "compliance_admin", "integration_admin", "report_admin", "support_admin_delegate", "legal_validator"],
    requiredBoundaries: ["active_organization", "commercial_feature", "intelligence_permission"],
    minimumPlanOrGate: "growth",
    commercialFeature: "financial_intelligence",
    intelligencePermission: "view_financial_intelligence",
    ownerSurfaces: ["/dashboard/financial-intelligence", "lib/intelligence/financial", "lib/intelligence/access.ts"],
    requiredTestsOrReleaseGates: ["test:intelligence-release-gate", "tests/financial-intelligence-page.test.tsx"],
    notes: "Financial exposure is sensitive commercial data and remains admin-only until a read-only finance role ships."
  },
  procurement_analytics_access: {
    id: "procurement_analytics_access",
    label: "Procurement analytics access",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: ["admin", "operator"],
    allowedInternalRoles: [],
    futureOnlyRoles: [],
    explicitlyForbiddenRoles: ["reviewer", "owner", ...FUTURE_ENTERPRISE_ROLES],
    requiredBoundaries: ["active_organization", "commercial_feature", "intelligence_permission"],
    minimumPlanOrGate: "growth",
    commercialFeature: "procurement_analytics",
    intelligencePermission: "view_procurement_analytics",
    ownerSurfaces: ["/dashboard/procurement-analytics", "lib/intelligence/procurement", "lib/intelligence/access.ts"],
    requiredTestsOrReleaseGates: ["test:intelligence-release-gate", "tests/procurement-analytics-page.test.tsx"],
    notes: "Procurement analytics stays operational and action-oriented for admins/operators."
  },
  billing_settings_manage_checkout: shippedRule({
    id: "billing_settings_manage_checkout",
    label: "Billing settings and checkout management",
    action: "manage_billing",
    minimumPlanOrGate: "none",
    ownerSurfaces: ["/dashboard/settings", "/api/billing/checkout", "/api/billing/manage"],
    requiredTestsOrReleaseGates: ["test:release-critical:billing", "tests/billing-routes.test.ts"],
    notes: "Billing authority remains with organization admins and owners until a future billing admin role ships."
  }),
  org_settings_manage: shippedRule({
    id: "org_settings_manage",
    label: "Organization settings management",
    action: "manage_org_settings",
    minimumPlanOrGate: "none",
    ownerSurfaces: ["/dashboard/settings", "lib/actions/settings.ts"],
    requiredTestsOrReleaseGates: ["test:permission-boundaries", "tests/settings-actions-authz.test.ts"],
    notes: "Org-level settings require administrative authority."
  }),
  internal_operations: shippedRule({
    id: "internal_operations",
    label: "Internal operations",
    action: "internal_rescue_actions",
    minimumPlanOrGate: "internal_only",
    ownerSurfaces: ["/internal/ops", "/api/internal/*", "lib/internal"],
    requiredTestsOrReleaseGates: ["test:ops-readiness", "tests/internal-route-auth.test.ts"],
    boundaries: ["internal_role", "internal_secret"],
    notes: "Internal operations require internal roles plus separated route secrets where applicable."
  }),
  workspace_deletion: shippedRule({
    id: "workspace_deletion",
    label: "Workspace deletion",
    action: "request_deletion",
    minimumPlanOrGate: "none",
    ownerSurfaces: ["/dashboard/settings", "/api/internal/workspace-deletion", "lib/organization/workspace-deletion.ts"],
    requiredTestsOrReleaseGates: ["test:deletion-control-plane", "tests/workspace-deletion-route.test.ts"],
    boundaries: ["active_organization", "destructive_signed_request"],
    notes: "Customer request remains owner-only; execution remains destructive/internal and signed."
  }),
  future_sso_settings: {
    id: "future_sso_settings",
    label: "Future SSO settings",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["security_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future enterprise identity release gate required before activation"],
    notes: "No shipped SAML/OIDC enterprise SSO runtime exists in this pass."
  },
  future_scim_provisioning: {
    id: "future_scim_provisioning",
    label: "Future SCIM provisioning",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["security_admin", "integration_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future enterprise identity release gate required before activation"],
    notes: "SCIM provisioning remains future-only until lifecycle, audit, and support gates are proven."
  },
  future_permission_groups: {
    id: "future_permission_groups",
    label: "Future permission groups",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["security_admin", "compliance_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future granular RBAC release gate required before activation"],
    notes: "Permission groups must not bypass the shipped action matrix while deferred."
  },
  future_retention_settings: {
    id: "future_retention_settings",
    label: "Future retention settings",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["compliance_admin", "security_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future retention/privacy release gate required before activation"],
    notes: "Retention settings are deferred until deletion, legal hold, audit, and customer communication semantics are mature."
  },
  future_integration_settings: {
    id: "future_integration_settings",
    label: "Future integration settings",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["integration_admin", "security_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future integration release gate required before activation"],
    notes: "Integration administration stays future-only until provider scopes, replay, and monitoring are implemented."
  },
  future_admin_delegation: {
    id: "future_admin_delegation",
    label: "Future support/admin delegation",
    status: "deferred",
    allowedRuntimeSurface: "future_enterprise_runtime",
    inheritsShippedActionRoles: false,
    allowedCustomerRoles: [],
    allowedInternalRoles: [],
    futureOnlyRoles: ["support_admin_delegate", "security_admin"],
    explicitlyForbiddenRoles: [...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member"],
    requiredBoundaries: ["future_enterprise_gate"],
    minimumPlanOrGate: "enterprise",
    ownerSurfaces: [],
    requiredTestsOrReleaseGates: ["future admin delegation release gate required before activation"],
    notes: "Delegated support/admin access is not a shipped customer role and cannot grant internal rescue authority."
  }
} as const;

export const ENTERPRISE_ROLE_REGISTRY: Record<EnterpriseRoleId, EnterpriseRoleDefinition> = {
  admin: {
    id: "admin",
    label: "Admin",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    requiredPlanOrGate: "none",
    sensitiveActionsAllowed: [
      "contract_upload_import",
      "contract_review_trust_change",
      "contract_p0_edit",
      "owner_assignment",
      "extraction_preview",
      "reminder_preview",
      "reminder_creation_control",
      "reminder_acknowledgment",
      "renewal_decision",
      "cycle_close_reopen",
      "export_basic",
      "export_sensitive_rich_presets",
      "export_ics",
      "intelligence_risk_explanation_access",
      "financial_intelligence_access",
      "procurement_analytics_access",
      "billing_settings_manage_checkout",
      "org_settings_manage"
    ],
    explicitlyForbiddenActions: [
      "workspace_deletion",
      "internal_operations",
      "reminder_dispatch_internal",
      ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS
    ],
    requiredTestsOrReleaseGates: ["test:permission-boundaries", "test:release-critical"],
    notes: "General workspace administration without owner-only deletion or internal rescue authority."
  },
  operator: {
    id: "operator",
    label: "Operator",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    requiredPlanOrGate: "none",
    sensitiveActionsAllowed: [
      "contract_upload_import",
      "contract_review_trust_change",
      "contract_p0_edit",
      "owner_assignment",
      "extraction_preview",
      "reminder_preview",
      "reminder_creation_control",
      "reminder_acknowledgment",
      "renewal_decision",
      "cycle_close_reopen",
      "export_basic",
      "export_sensitive_rich_presets",
      "export_ics",
      "intelligence_risk_explanation_access",
      "procurement_analytics_access"
    ],
    explicitlyForbiddenActions: [
      "financial_intelligence_access",
      "billing_settings_manage_checkout",
      "org_settings_manage",
      "workspace_deletion",
      "internal_operations",
      "reminder_dispatch_internal",
      ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS
    ],
    requiredTestsOrReleaseGates: ["test:permission-boundaries", "test:release-critical"],
    notes: "Operational workflow role for intake, review, reminders, decisions, and operational reporting."
  },
  reviewer: {
    id: "reviewer",
    label: "Reviewer",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    requiredPlanOrGate: "none",
    sensitiveActionsAllowed: [
      "contract_review_trust_change",
      "contract_p0_edit",
      "owner_assignment",
      "extraction_preview",
      "reminder_preview",
      "reminder_creation_control",
      "export_basic",
      "export_sensitive_rich_presets",
      "export_ics",
      "intelligence_risk_explanation_access"
    ],
    explicitlyForbiddenActions: [
      "contract_upload_import",
      "reminder_acknowledgment",
      "renewal_decision",
      "cycle_close_reopen",
      "financial_intelligence_access",
      "procurement_analytics_access",
      "billing_settings_manage_checkout",
      "org_settings_manage",
      "workspace_deletion",
      "internal_operations",
      "reminder_dispatch_internal",
      ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS
    ],
    requiredTestsOrReleaseGates: ["test:permission-boundaries", "test:release-critical"],
    notes: "Review/trust lane role; reviewers do not make business decisions or manage billing."
  },
  owner: {
    id: "owner",
    label: "Owner",
    status: "shipped",
    allowedRuntimeSurface: "customer_runtime",
    requiredPlanOrGate: "none",
    sensitiveActionsAllowed: [
      "reminder_acknowledgment",
      "renewal_decision",
      "cycle_close_reopen",
      "export_basic",
      "export_ics",
      "intelligence_risk_explanation_access",
      "billing_settings_manage_checkout",
      "org_settings_manage",
      "workspace_deletion"
    ],
    explicitlyForbiddenActions: [
      "contract_upload_import",
      "contract_review_trust_change",
      "contract_p0_edit",
      "owner_assignment",
      "extraction_preview",
      "reminder_preview",
      "reminder_creation_control",
      "export_sensitive_rich_presets",
      "financial_intelligence_access",
      "procurement_analytics_access",
      "internal_operations",
      "reminder_dispatch_internal",
      ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS
    ],
    requiredTestsOrReleaseGates: ["test:permission-boundaries", "test:release-critical"],
    notes: "Accountable business owner with owner-scoped risk access, billing authority, and owner-only deletion request."
  },
  internal_support: {
    id: "internal_support",
    label: "Internal Support",
    status: "shipped",
    allowedRuntimeSurface: "internal_runtime",
    requiredPlanOrGate: "internal_only",
    sensitiveActionsAllowed: ["internal_operations", "reminder_dispatch_internal"],
    explicitlyForbiddenActions: [...CURRENT_CUSTOMER_SENSITIVE_ACTIONS, ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS],
    requiredTestsOrReleaseGates: ["test:ops-readiness", "tests/internal-route-auth.test.ts"],
    notes: "Internal support can operate bounded rescue flows but is not a customer role."
  },
  internal_admin: {
    id: "internal_admin",
    label: "Internal Admin",
    status: "shipped",
    allowedRuntimeSurface: "internal_runtime",
    requiredPlanOrGate: "internal_only",
    sensitiveActionsAllowed: ["internal_operations", "reminder_dispatch_internal"],
    explicitlyForbiddenActions: [...CURRENT_CUSTOMER_SENSITIVE_ACTIONS, ...FUTURE_ENTERPRISE_SENSITIVE_ACTIONS],
    requiredTestsOrReleaseGates: ["test:ops-readiness", "test:deletion-control-plane"],
    notes: "Internal admin is for audited internal operations, not customer runtime permissions."
  },
  member: {
    id: "member",
    label: "Member legacy alias",
    status: "legacy_alias",
    allowedRuntimeSurface: "none",
    requiredPlanOrGate: "legacy_alias_only",
    mapsToCurrentRole: "operator",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["tests/permissions.test.ts"],
    notes: "Legacy member data normalizes to operator; it must not appear as a new runtime role."
  },
  viewer: {
    id: "viewer",
    label: "Future Viewer",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future enterprise identity release gate required before activation"],
    notes: "Viewer is reserved for a future read-only enterprise role and grants no shipped access today."
  },
  security_admin: {
    id: "security_admin",
    label: "Future Security Admin",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future enterprise identity release gate required before activation"],
    notes: "Future security controls owner; does not grant current product access while deferred."
  },
  billing_admin: {
    id: "billing_admin",
    label: "Future Billing Admin",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future enterprise billing-role release gate required before activation"],
    notes: "Dedicated billing administration is deferred; current billing remains admin/owner."
  },
  compliance_admin: {
    id: "compliance_admin",
    label: "Future Compliance Admin",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future compliance/retention release gate required before activation"],
    notes: "Compliance administration is future-only until retention/legal-hold semantics exist."
  },
  integration_admin: {
    id: "integration_admin",
    label: "Future Integration Admin",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future integration release gate required before activation"],
    notes: "Integration administration is future-only; no Slack/Teams/API setup is shipped here."
  },
  report_admin: {
    id: "report_admin",
    label: "Future Report Admin",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future reporting governance release gate required before activation"],
    notes: "Report administration is reserved for future reporting governance and does not broaden current exports."
  },
  support_admin_delegate: {
    id: "support_admin_delegate",
    label: "Future Support/Admin Delegate",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future admin delegation release gate required before activation"],
    notes: "Customer delegation to support/admin workflows is future-only and cannot grant internal route access."
  },
  finance_viewer: {
    id: "finance_viewer",
    label: "Future Finance Viewer",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future financial-intelligence role release gate required before activation"],
    notes: "Documented as a future read-only financial role; current runtime financial access remains admin-only."
  },
  legal_validator: {
    id: "legal_validator",
    label: "Future Legal/Validator",
    status: "future",
    allowedRuntimeSurface: "future_enterprise_runtime",
    requiredPlanOrGate: "enterprise",
    sensitiveActionsAllowed: [],
    explicitlyForbiddenActions: ENTERPRISE_SENSITIVE_ACTION_IDS,
    requiredTestsOrReleaseGates: ["future legal/evidence role release gate required before activation"],
    notes: "Documented as future read-only risk/evidence role; not active in shipped authorization."
  }
} as const;

export const ENTERPRISE_ROLE_IDS = Object.keys(ENTERPRISE_ROLE_REGISTRY) as EnterpriseRoleId[];

export function getSensitiveActionRule(action: EnterpriseSensitiveActionId) {
  return ENTERPRISE_SENSITIVE_ACTION_RULES[action];
}

export function getEnterpriseRoleDefinition(role: EnterpriseRoleId) {
  return ENTERPRISE_ROLE_REGISTRY[role];
}

export function isFutureEnterpriseRole(role: EnterpriseRoleId) {
  return ENTERPRISE_ROLE_REGISTRY[role].status === "future";
}

