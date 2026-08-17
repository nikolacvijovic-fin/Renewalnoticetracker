import type { CommercialFeature } from "@/lib/billing/entitlements";

export type PlatformModuleStatus = "shipped" | "deferred" | "experimental" | "excluded";

export type PlatformModuleId =
  | "core_renewal_control_kernel"
  | "contract_intelligence_risk_explanation"
  | "financial_exposure_intelligence"
  | "procurement_vendor_analytics"
  | "subscription_usage_optimization"
  | "export_reporting_intelligence"
  | "ocr_import_intelligence"
  | "reminder_workflow_automation"
  | "billing_entitlement_control"
  | "admin_support_operations"
  | "revenue_intelligence_command_center"
  | "enterprise_identity_rbac_retention"
  | "enterprise_integrations"
  | "advanced_retention_governance_analytics"
  | "full_clm_expansion";

export type PlatformModuleGate = {
  source:
    | "none"
    | "active_org_and_role"
    | "commercial_feature"
    | "export_preset"
    | "internal_role"
    | "future_policy"
    | "excluded";
  minimumPlan: "none" | "starter" | "growth" | "portfolio" | "enterprise" | "preset_specific" | "internal_only";
  commercialFeatures?: readonly CommercialFeature[];
  policy: string;
};

export type PlatformModule = {
  id: PlatformModuleId;
  label: string;
  status: PlatformModuleStatus;
  allowedInCurrentShippedKernel: boolean;
  gate: PlatformModuleGate;
  ownerSurfaces: {
    routes: readonly string[];
    components: readonly string[];
    modules: readonly string[];
    docs: readonly string[];
  };
  requiredTestsOrReleaseGates: readonly string[];
  deferredCapabilitySlugs?: readonly string[];
  promotionCriteria: readonly string[];
  notAllowed: readonly string[];
};

export const PLATFORM_MODULES: Record<PlatformModuleId, PlatformModule> = {
  core_renewal_control_kernel: {
    id: "core_renewal_control_kernel",
    label: "Core renewal-control kernel",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "active_org_and_role",
      minimumPlan: "starter",
      commercialFeatures: ["manual_contracts", "exports"],
      policy: "Active organization, role checks, shipped action matrix, and paid export/manual-contract gates."
    },
    ownerSurfaces: {
      routes: ["/dashboard", "/dashboard/contracts", "/dashboard/contracts/[id]"],
      components: ["ContractsTable", "ContractWorkflowSummary", "ReviewForm", "RenewalDecisionForm"],
      modules: ["lib/contracts", "lib/product/shipped-kernel.ts", "lib/product/action-matrix.ts"],
      docs: ["SHIPPED_KERNEL.md", "PHASE1_RELEASE_CRITICAL.md", "docs/ARCHITECTURE_BOUNDARIES.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:release-critical",
      "tests/shipped-kernel-registry.test.ts",
      "tests/shipped-kernel-boundary.test.ts"
    ],
    promotionCriteria: ["Already shipped; any expansion must preserve the narrow weekly operator loop."],
    notAllowed: ["Generic CLM workflow expansion", "unaudited founder rescue as normal workflow"]
  },
  contract_intelligence_risk_explanation: {
    id: "contract_intelligence_risk_explanation",
    label: "Contract intelligence/risk explanation",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "commercial_feature",
      minimumPlan: "starter",
      commercialFeatures: ["risk_badges", "risk_scores"],
      policy: "Risk badges are Starter-gated; risk queue and explanations require risk-score access and shared intelligence authorization."
    },
    ownerSurfaces: {
      routes: ["/dashboard/risk-queue", "/api/intelligence/risk/contracts/[id]/explanation-view"],
      components: ["RiskBadge", "RiskExplanationDrawer", "RiskQueueTable"],
      modules: ["lib/intelligence/access.ts", "lib/intelligence/risk"],
      docs: ["docs/intelligence/INTELLIGENCE_RELEASE_GATE.md", "docs/intelligence/AI_RISK_SCORING_SCOPE.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:intelligence-release-gate",
      "tests/intelligence-surface-entitlement-consistency.test.tsx",
      "tests/risk-score.test.ts"
    ],
    promotionCriteria: ["Risk output remains explainable, confidence-gated, and tied to review/owner workflow actions."],
    notAllowed: ["Legal advice", "percentage precision", "black-box recommendations to renew or terminate"]
  },
  financial_exposure_intelligence: {
    id: "financial_exposure_intelligence",
    label: "Financial exposure intelligence",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "commercial_feature",
      minimumPlan: "growth",
      commercialFeatures: ["financial_intelligence"],
      policy: "Admin-only financial intelligence surface behind canonical billing snapshot and intelligence access checks."
    },
    ownerSurfaces: {
      routes: ["/dashboard/financial-intelligence"],
      components: ["FinancialExposureCard", "FinancialExposureBreakdown"],
      modules: ["lib/intelligence/financial", "lib/intelligence/access.ts"],
      docs: ["docs/intelligence/FINANCIAL_INTELLIGENCE_SCOPE.md", "docs/intelligence/INTELLIGENCE_RELEASE_GATE.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:intelligence-release-gate",
      "tests/financial-exposure.test.ts",
      "tests/financial-intelligence-page.test.tsx"
    ],
    promotionCriteria: ["Amounts remain deterministic and every output carries trust metadata and calculation basis."],
    notAllowed: ["ERP integration claims", "invoice matching", "cash-flow forecasting", "unsupported savings claims"]
  },
  procurement_vendor_analytics: {
    id: "procurement_vendor_analytics",
    label: "Procurement/vendor analytics",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "commercial_feature",
      minimumPlan: "growth",
      commercialFeatures: ["procurement_analytics"],
      policy: "Admin/operator procurement analytics behind canonical billing snapshot and intelligence access checks."
    },
    ownerSurfaces: {
      routes: ["/dashboard/procurement-analytics"],
      components: ["ProcurementAnalyticsFilters", "ProcurementActionList"],
      modules: ["lib/intelligence/procurement", "lib/intelligence/access.ts"],
      docs: ["docs/intelligence/PROCUREMENT_ANALYTICS_SCOPE.md", "docs/intelligence/INTELLIGENCE_RELEASE_GATE.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:intelligence-release-gate",
      "tests/procurement-query-helpers.test.ts",
      "tests/procurement-analytics-page.test.tsx"
    ],
    promotionCriteria: ["Every metric stays action-oriented and drills down to organization-scoped contracts."],
    notAllowed: ["Supplier performance scoring", "vendor enrichment", "ERP/procurement-suite positioning"]
  },
  subscription_usage_optimization: {
    id: "subscription_usage_optimization",
    label: "Subscription Usage Optimization",
    status: "experimental",
    allowedInCurrentShippedKernel: false,
    gate: {
      source: "future_policy",
      minimumPlan: "growth",
      commercialFeatures: ["subscription_usage_optimization"],
      policy:
        "Growth-gated experimental add-on with Microsoft 365 and Google Workspace connector paths plus a CSV/XLSX fallback. Activation remains blocked when signed Java retrieval or Python reconciliation is unhealthy or unconfigured."
    },
    ownerSurfaces: {
      routes: ["/dashboard/subscription-optimization"],
      components: ["SubscriptionOptimizationWorkbench"],
      modules: [
        "lib/subscription-usage",
        "lib/add-ons/python-intelligence-client.ts",
        "lib/add-ons/java-enterprise-client.ts",
        "services/python-intelligence/app/routes/reconcile_usage.py",
        "services/java-enterprise-connectors/src/main/java/com/noticecontrol/enterprise/connectors/UsageInventoryConnector.java",
        "services/java-enterprise-connectors/src/main/java/com/noticecontrol/enterprise/connectors/GoogleWorkspaceUsageInventoryConnector.java"
      ],
      docs: ["docs/add-on-architecture.md", "docs/GOOGLE_WORKSPACE_SUBSCRIPTION_USAGE_CONNECTOR.md"]
    },
    requiredTestsOrReleaseGates: [
      "tests/subscription-usage-import.test.ts",
      "tests/subscription-usage-workflow.test.ts",
      "tests/subscription-usage-microsoft365.test.ts",
      "tests/subscription-usage-google-workspace.test.ts",
      "services/python-intelligence/tests/test_endpoints.py",
      "services/java-enterprise-connectors/src/test/java/com/noticecontrol/enterprise/UsageInventoryConnectorTest.java",
      "test:intelligence-release-gate"
    ],
    promotionCriteria: [
      "Usage imports are tenant-scoped, idempotent, and reviewable.",
      "Python returns deterministic findings with source row IDs, confidence, warnings, and no invented per-seat prices.",
      "Human-reviewed actions are required before any savings claim becomes accepted.",
      "Provider consent, credential rotation, scheduled synchronization, and mocked provider failure suites are proven in staging."
    ],
    notAllowed: [
      "Automatic cancellation",
      "Vendor messages",
      "Unsupported savings guarantees",
      "Provider writes, automatic license removal, or automatic subscription cancellation"
    ]
  },
  export_reporting_intelligence: {
    id: "export_reporting_intelligence",
    label: "Export/reporting intelligence",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "export_preset",
      minimumPlan: "preset_specific",
      commercialFeatures: ["exports", "risk_scores"],
      policy: "Export presets define role, format, plan, sensitive-section, and intelligence gates before payload generation."
    },
    ownerSurfaces: {
      routes: ["/dashboard/contracts/export/csv", "/dashboard/contracts/export/xlsx", "/api/exports/contracts"],
      components: ["ContractsTable"],
      modules: ["lib/contracts/export.ts", "lib/contracts/export-route.ts", "lib/contracts/background-exports.ts"],
      docs: ["docs/EXPORT_PRESETS.md", "docs/SCALE_AND_PERFORMANCE.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:release-critical:exports",
      "test:background-exports",
      "tests/export.test.ts",
      "tests/export-routes.test.ts"
    ],
    promotionCriteria: ["Sensitive sections remain preset-gated and exports stay bounded, sanitized, and organization-scoped."],
    notAllowed: ["Notes in basic export", "audit export without hardened redaction", "unbounded artifact generation"]
  },
  ocr_import_intelligence: {
    id: "ocr_import_intelligence",
    label: "OCR/import intelligence",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "active_org_and_role",
      minimumPlan: "starter",
      commercialFeatures: ["manual_contracts"],
      policy: "Upload/import and extraction paths require active organization scope, review gates, and safe OCR job controls."
    },
    ownerSurfaces: {
      routes: ["/dashboard/contracts/new", "/api/extract", "/api/internal/ocr-jobs"],
      components: ["UploadContractForm"],
      modules: ["lib/ocr", "lib/actions/contracts.ts", "lib/contracts/kernel-queries.ts"],
      docs: ["docs/SECURITY_PRIVACY_DATA_FLOWS.md", "docs/OPERATIONAL_MATURITY.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:release-critical:intake-review",
      "test:ocr-trust",
      "tests/ocr-jobs.test.ts"
    ],
    promotionCriteria: ["Raw uploaded content and OCR output never leak to logs/errors and review remains required before trust."],
    notAllowed: ["Raw OCR output in logs", "provider payload leakage", "unreviewed extraction as high-confidence truth"]
  },
  reminder_workflow_automation: {
    id: "reminder_workflow_automation",
    label: "Reminder/workflow automation",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "commercial_feature",
      minimumPlan: "growth",
      commercialFeatures: ["multi_recipient_reminders"],
      policy: "Fixed trusted reminders ship in the kernel; broader recipient behavior is Growth-gated and custom rules remain deferred."
    },
    ownerSurfaces: {
      routes: ["/api/reminders", "/api/cron/send-reminders"],
      components: ["ReminderTimeline", "ContractCycleActions"],
      modules: ["lib/notifications/reminders.ts", "lib/contracts/shipped-reminder-policy.ts"],
      docs: ["PHASE1_RELEASE_CRITICAL.md", "docs/OPERATIONAL_RUNBOOKS.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:release-critical:workflow",
      "tests/reminder-control-plane.test.ts",
      "tests/send-reminders-route.test.ts"
    ],
    promotionCriteria: ["Reminder claims, retries, stale rescue, and trusted-state writes remain explicit and auditable."],
    notAllowed: ["Custom reminder rules", "hidden manual reminder triggering as normal workflow"]
  },
  billing_entitlement_control: {
    id: "billing_entitlement_control",
    label: "Billing/entitlement control",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "none",
      minimumPlan: "none",
      policy: "Billing controls access to gated modules through canonical billing snapshots and Paddle-first provider policy."
    },
    ownerSurfaces: {
      routes: ["/api/billing/checkout", "/api/billing/manage", "/api/webhooks/billing/paddle"],
      components: ["SettingsForm"],
      modules: ["lib/billing", "lib/contracts/kernel-queries.ts"],
      docs: ["docs/ARCHITECTURE_BOUNDARIES.md", "docs/OPERATIONAL_EVENT_INVENTORY.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:release-critical:billing",
      "test:billing-control-plane",
      "tests/billing-entitlements.test.ts"
    ],
    promotionCriteria: ["All entitlement decisions keep using the canonical billing snapshot path."],
    notAllowed: ["Legacy Stripe/PayPal as active self-serve runtime", "page-local billing truth"]
  },
  admin_support_operations: {
    id: "admin_support_operations",
    label: "Admin/support operations",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "internal_role",
      minimumPlan: "internal_only",
      policy: "Internal operations are minimal rescue/support surfaces behind internal roles, separated internal secrets, and monitoring."
    },
    ownerSurfaces: {
      routes: ["/internal/ops", "/api/internal/health", "/api/internal/export-jobs", "/api/internal/workspace-deletion"],
      components: ["AdminPanel"],
      modules: [
        "lib/internal",
        "lib/observability",
        "lib/organization/workspace-deletion.ts",
        "lib/product/event-taxonomy.ts",
        "lib/product/customer-onboarding.ts",
        "lib/product/customer-onboarding-progress.ts",
        "lib/product/support-success.ts"
      ],
      docs: [
        "docs/EVENT_TAXONOMY.md",
        "docs/OPERATIONAL_MATURITY.md",
        "docs/OPERATIONAL_RUNBOOKS.md",
        "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
        "docs/SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md",
        "docs/enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md"
      ]
    },
    requiredTestsOrReleaseGates: [
      "test:ops-readiness",
      "test:monitoring-readiness",
      "test:deletion-control-plane",
      "tests/customer-onboarding-support-boundary.test.ts",
      "tests/event-taxonomy-onboarding-support.test.ts",
      "tests/customer-onboarding-progress.test.ts"
    ],
    promotionCriteria: ["Support diagnostics stay code-first, bounded, tenant-scoped, and free of customer content."],
    notAllowed: ["Broad founder operating system runtime", "raw customer data in support views", "destructive action without stronger auth"]
  },
  revenue_intelligence_command_center: {
    id: "revenue_intelligence_command_center",
    label: "Revenue Intelligence Command Center",
    status: "shipped",
    allowedInCurrentShippedKernel: true,
    gate: {
      source: "active_org_and_role",
      minimumPlan: "growth",
      policy:
        "Admin/operator/reviewer command-center access over existing renewal-control evidence only; no external outreach, CRM enrichment, or sending."
    },
    ownerSurfaces: {
      routes: ["/dashboard/revenue-intelligence"],
      components: ["RevenueCommandCenter", "RevenueKpiStrip", "RevenueRiskQueue"],
      modules: ["lib/revenue-intelligence", "lib/actions/revenue-intelligence.ts"],
      docs: ["docs/REVENUE_INTELLIGENCE_COMMAND_CENTER.md", "docs/REVENUE_INTELLIGENCE_RELEASE_GATE.md"]
    },
    requiredTestsOrReleaseGates: [
      "test:revenue-intelligence",
      "tests/revenue-intelligence-boundaries.test.ts",
      "tests/revenue-intelligence-audit-taxonomy.test.ts"
    ],
    promotionCriteria: [
      "Every number is generated from organization-scoped shipped evidence and can link back to source contracts, decisions, quotes, or workflow records."
    ],
    notAllowed: [
      "External cold outreach delivery",
      "CRM enrichment or sync",
      "lead database runtime",
      "automated email sending",
      "unsupported forecasts from ungrounded data"
    ]
  },
  enterprise_identity_rbac_retention: {
    id: "enterprise_identity_rbac_retention",
    label: "Future enterprise controls: SSO/RBAC/retention",
    status: "deferred",
    allowedInCurrentShippedKernel: false,
    gate: {
      source: "future_policy",
      minimumPlan: "enterprise",
      policy: "Enterprise controls require a future security, data-retention, customer-communications, and support-readiness gate."
    },
    ownerSurfaces: {
      routes: [],
      components: [],
      modules: [
        "lib/product/enterprise-rbac.ts",
        "lib/product/enterprise-identity.ts",
        "lib/product/enterprise-identity-runtime.ts",
        "lib/product/enterprise-identity-schema.ts",
        "lib/product/enterprise-identity-routes.ts",
        "lib/product/data-governance.ts",
        "lib/product/data-governance-runtime.ts"
      ],
      docs: [
        "docs/ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md",
        "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md",
        "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md",
        "docs/enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md",
        "docs/enterprise/ENTERPRISE_ADMIN_IDENTITY_GUIDE.md",
        "docs/enterprise/DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md",
        "docs/reference/future/PERMISSIONS_TESTING_STRATEGY.md",
        "docs/reference/founder-operating-system/SECURITY_QUESTIONNAIRE_READINESS.md"
      ]
    },
    requiredTestsOrReleaseGates: [
      "tests/enterprise-identity-rbac.test.ts",
      "tests/enterprise-identity-readiness.test.ts",
      "tests/enterprise-identity-schema-routes.test.ts",
      "tests/enterprise-identity-runtime.test.ts",
      "tests/data-governance-boundary.test.ts",
      "tests/data-governance-runtime.test.ts",
      "future enterprise release gate required before activation"
    ],
    deferredCapabilitySlugs: ["advanced_governance_dashboards", "enterprise_data_governance_retention"],
    promotionCriteria: ["SSO/RBAC/retention policy is implemented, tested, documented, and paid-plan packaged."],
    notAllowed: ["Granular enterprise RBAC exposed as current shipped scope", "retention settings without deletion/privacy controls"]
  },
  enterprise_integrations: {
    id: "enterprise_integrations",
    label: "Future enterprise integrations",
    status: "deferred",
    allowedInCurrentShippedKernel: false,
    gate: {
      source: "future_policy",
      minimumPlan: "enterprise",
      policy: "Slack, Teams, ERP, CRM, API, and data warehouse integrations need provider-specific auth, scopes, monitoring, and support gates."
    },
    ownerSurfaces: {
      routes: [],
      components: [],
      modules: [
        "lib/product/platform-api.ts",
        "lib/product/platform-api-schema.ts",
        "lib/product/platform-api-routes.ts",
        "deferred/integrations/slack.ts",
        "deferred/integrations/teams.ts"
      ],
      docs: [
        "docs/API_AND_INTEGRATION_BOUNDARY.md",
        "docs/enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md",
        "docs/enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md",
        "docs/reference/future/INTEGRATION_TESTING_STRATEGY.md",
        "docs/reference/future/PACKAGING_STRATEGY.md"
      ]
    },
    requiredTestsOrReleaseGates: [
      "tests/platform-api-boundary.test.ts",
      "tests/platform-api-schema-routes.test.ts",
      "future integration release gate required before activation"
    ],
    deferredCapabilitySlugs: ["advanced_integrations", "public_api_integrations"],
    promotionCriteria: ["A specific integration proves renewal-workflow value and has provider auth, replay, alerting, and support runbooks."],
    notAllowed: ["Slack/Teams delivery as shipped kernel", "ERP sync without scoped data contracts", "customer API without platform API gate"]
  },
  advanced_retention_governance_analytics: {
    id: "advanced_retention_governance_analytics",
    label: "Advanced retention/governance analytics",
    status: "experimental",
    allowedInCurrentShippedKernel: false,
    gate: {
      source: "future_policy",
      minimumPlan: "portfolio",
      policy: "Advanced analytics may remain reference/experimental until decision-grade formulas, privacy boundaries, and customer action loops are proven."
    },
    ownerSurfaces: {
      routes: [],
      components: [],
      modules: ["deferred/analytics/advanced-analytics.ts"],
      docs: ["docs/reference/future/FULL_ANALYTICS_ARCHITECTURE.md", "docs/reference/future/RETENTION_ANALYTICS_SYSTEM.md"]
    },
    requiredTestsOrReleaseGates: ["future analytics release gate required before activation"],
    deferredCapabilitySlugs: ["future_advanced_analytics", "retention_health_surfaces"],
    promotionCriteria: ["Metrics drive customer action, are formula-backed, and do not become dashboard theater."],
    notAllowed: ["Customer-visible readiness/capacity/profitability theater", "unvalidated health scores"]
  },
  full_clm_expansion: {
    id: "full_clm_expansion",
    label: "Full CLM expansion",
    status: "excluded",
    allowedInCurrentShippedKernel: false,
    gate: {
      source: "excluded",
      minimumPlan: "none",
      policy: "Full CLM, drafting, redlining, negotiation, and e-signature remain outside product direction."
    },
    ownerSurfaces: {
      routes: [],
      components: [],
      modules: [],
      docs: ["NOT_SHIPPED_FIRST.md", "DEFERRED_CAPABILITIES.md"]
    },
    requiredTestsOrReleaseGates: ["tests/shipped-first-docs.test.ts", "tests/current-product-truth-docs.test.ts"],
    deferredCapabilitySlugs: ["full_clm_expansion"],
    promotionCriteria: ["None. This module is intentionally excluded rather than deferred."],
    notAllowed: ["Drafting", "redlining", "negotiation tracking", "e-signature", "full CLM positioning"]
  }
} as const;

export const PLATFORM_MODULE_IDS = Object.keys(PLATFORM_MODULES) as PlatformModuleId[];

export function getPlatformModulesByStatus(status: PlatformModuleStatus) {
  return PLATFORM_MODULE_IDS.map((id) => PLATFORM_MODULES[id]).filter(
    (module) => module.status === status
  );
}
