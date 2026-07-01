import type { CommercialFeature } from "@/lib/billing/entitlements";
import type { MarketProfileId } from "@/lib/product/market-profiles";
import { PLATFORM_MODULES, type PlatformModuleId } from "@/lib/product/platform-modules";
import { PRODUCT_EVENT_TAXONOMY, type ProductEventType } from "@/lib/product/event-taxonomy";

export const PLATFORM_LIFECYCLE_STATES = [
  "planned",
  "experimental",
  "beta",
  "internal",
  "customer_preview",
  "generally_available",
  "deprecated",
  "disabled",
  "future_only"
] as const;
export type PlatformLifecycleState = (typeof PLATFORM_LIFECYCLE_STATES)[number];

export const PLATFORM_HEALTH_STATES = [
  "healthy",
  "warning",
  "degraded",
  "maintenance",
  "future_only",
  "disabled",
  "blocked"
] as const;
export type PlatformHealthState = (typeof PLATFORM_HEALTH_STATES)[number];

export type PlatformDomainConcept =
  | "organization"
  | "workspace"
  | "product"
  | "module"
  | "capability"
  | "provider"
  | "market_profile"
  | "market_activation"
  | "enterprise_identity"
  | "user"
  | "approval"
  | "contract"
  | "ai"
  | "audit"
  | "monitoring"
  | "billing"
  | "permission"
  | "export"
  | "job"
  | "health";

export type PlatformCapabilityId =
  | "renewals"
  | "contracts"
  | "contract_intelligence"
  | "financial_intelligence"
  | "procurement_analytics"
  | "revenue_intelligence"
  | "billing"
  | "identity"
  | "platform_api_integrations"
  | "providers"
  | "market_profiles"
  | "market_activation"
  | "analytics"
  | "ocr"
  | "ai_generation"
  | "exports"
  | "notifications"
  | "approval_queue"
  | "audit"
  | "monitoring"
  | "deployment_readiness"
  | "permissions"
  | "compliance";

export type PlatformProvider =
  | "paddle"
  | "manual_invoice"
  | "paypal_exception"
  | "openai"
  | "resend"
  | "supabase"
  | "internal_secret"
  | "future_identity_provider"
  | "future_public_api_provider";

export type PlatformPlanRequirement =
  | "none"
  | "starter"
  | "growth"
  | "portfolio"
  | "enterprise"
  | "internal_only"
  | "future_policy"
  | "preset_specific";

export type PlatformCapability = {
  id: PlatformCapabilityId;
  label: string;
  lifecycle: PlatformLifecycleState;
  health: PlatformHealthState;
  owningModule: PlatformModuleId;
  dependencies: readonly PlatformCapabilityId[];
  requiredProviders: readonly PlatformProvider[];
  requiredPermissions: readonly string[];
  requiredPlans: readonly PlatformPlanRequirement[];
  requiredMarketPolicies: readonly string[];
  requiredIdentityPolicies: readonly string[];
  requiredAuditEvents: readonly string[];
  requiredMonitoring: readonly string[];
  requiredDeploymentGates: readonly string[];
  docs: readonly string[];
  notes: string;
};

export type PlatformRuntimeContext = {
  organization: {
    organizationId: string;
    active: boolean;
  };
  workspace: {
    workspaceId: string | null;
    activeOrganizationId: string;
  };
  market: {
    marketId: MarketProfileId | string;
    runtimeEnabled: boolean;
  };
  identity: {
    actorUserId: string | null;
    role: string | null;
    internalRole?: string | null;
    enterpriseIdentityEnabled?: boolean;
  };
  subscription: {
    planTier: PlatformPlanRequirement | string | null;
    subscriptionStatus: string | null;
    commercialFeatures: readonly CommercialFeature[];
  };
  providerPolicies: {
    providers: readonly PlatformProvider[];
  };
  featureGates: {
    enabledCapabilities: readonly PlatformCapabilityId[];
  };
  approvalContext: {
    approvalRequired: boolean;
    approvalIds: readonly string[];
  };
  auditContext: {
    requestId?: string | null;
    auditBoundary: "customer_truth" | "internal_only" | "future_contract";
  };
  monitoringContext: {
    requestId?: string | null;
    health: PlatformHealthState;
  };
};

export type PlatformRuntimeContextValidation = {
  valid: boolean;
  reasonCodes: readonly string[];
};

export type PlatformCapabilityRuntimeStatus =
  | "usable"
  | "blocked"
  | "future_only"
  | "disabled"
  | "missing_dependency"
  | "missing_provider"
  | "missing_plan"
  | "missing_market_policy"
  | "missing_identity_policy"
  | "missing_feature_gate"
  | "unhealthy_context";

export type PlatformCapabilityEvaluationMode = {
  dependencyMode?: "recursive" | "shallow" | "disabled";
  requireFeatureGate?: boolean;
  allowInternalCapabilities?: boolean;
  allowDegradedHealth?: boolean;
};

export type PlatformCapabilityRuntimeDecision = {
  usable: boolean;
  status: PlatformCapabilityRuntimeStatus;
  reasonCodes: readonly string[];
  capabilityId: PlatformCapabilityId;
  lifecycle: PlatformLifecycleState;
  health: PlatformHealthState;
  requiredProviders: readonly PlatformProvider[];
  missingProviders: readonly PlatformProvider[];
  requiredPlans: readonly PlatformPlanRequirement[];
  requiredPermissions: readonly string[];
  missingFeatureGates: readonly PlatformCapabilityId[];
  dependencyDecisions: readonly PlatformCapabilityRuntimeDecision[];
  customerSafeMessage: string;
};

export type PlatformEventRegistration = {
  eventName: string;
  type: ProductEventType;
  owningCapability: PlatformCapabilityId;
  owningModule: PlatformModuleId;
  emittedToday: boolean;
  requiredForCapability: boolean;
};

export const PLATFORM_DUPLICATED_CONCEPT_INVENTORY: Record<
  PlatformDomainConcept,
  {
    appearsIn: readonly string[];
    canonicalBoundary: string;
  }
> = {
  organization: {
    appearsIn: ["contracts", "billing", "intelligence", "exports", "internal ops"],
    canonicalBoundary: "Active organization context and tenant-scoped query helpers."
  },
  workspace: {
    appearsIn: ["workspace deletion", "internal ops", "customer onboarding"],
    canonicalBoundary: "Workspace lifecycle must remain organization-scoped and audited."
  },
  product: {
    appearsIn: ["platform modules", "revenue intelligence", "pricing/docs"],
    canonicalBoundary: "Offer/product profiles must reference platform module status and current product truth."
  },
  module: {
    appearsIn: ["platform module registry", "market profiles", "scope freeze docs"],
    canonicalBoundary: "lib/product/platform-modules.ts"
  },
  capability: {
    appearsIn: ["billing features", "exports", "intelligence", "future API scopes"],
    canonicalBoundary: "Platform capability registry in this file."
  },
  provider: {
    appearsIn: ["billing", "AI/OCR", "email", "identity", "monitoring"],
    canonicalBoundary: "Provider policy is capability and market gated; raw provider payloads are forbidden."
  },
  market_profile: {
    appearsIn: ["market profiles", "market activation", "revenue intelligence"],
    canonicalBoundary: "lib/product/market-profiles.ts"
  },
  market_activation: {
    appearsIn: ["market activation approvals", "deployment readiness", "market docs"],
    canonicalBoundary: "lib/product/market-activation-approval.ts"
  },
  enterprise_identity: {
    appearsIn: ["RBAC", "SSO/SCIM contracts", "event taxonomy", "docs"],
    canonicalBoundary: "lib/product/enterprise-identity-runtime.ts"
  },
  user: {
    appearsIn: ["auth/session", "memberships", "owners", "SCIM future records"],
    canonicalBoundary: "Authenticated user and active organization membership must be server-validated."
  },
  approval: {
    appearsIn: ["market activation", "support access", "future outreach approval"],
    canonicalBoundary: "Approvals are explicit state contracts, not hidden founder rescue."
  },
  contract: {
    appearsIn: ["renewal workflow", "intelligence", "exports", "OCR/import"],
    canonicalBoundary: "Reviewed contract/workflow truth remains source of product decisions."
  },
  ai: {
    appearsIn: ["OCR/extraction", "risk scoring", "future outreach generation"],
    canonicalBoundary: "AI outputs must carry trust/confidence metadata and never mutate truth directly."
  },
  audit: {
    appearsIn: ["customer audit log", "identity contracts", "exports", "governance"],
    canonicalBoundary: "Audit is customer/accountability truth, separate from ops logs and analytics."
  },
  monitoring: {
    appearsIn: ["exports", "reminders", "OCR", "billing", "identity readiness"],
    canonicalBoundary: "Monitoring emits sanitized operational events and alert severity only."
  },
  billing: {
    appearsIn: ["entitlements", "routes", "pricing", "intelligence access"],
    canonicalBoundary: "Canonical billing snapshot; no page-local billing truth."
  },
  permission: {
    appearsIn: ["roles", "intelligence", "exports", "internal routes", "future API scopes"],
    canonicalBoundary: "Action/capability permissions must be explicit and centrally testable."
  },
  export: {
    appearsIn: ["contract exports", "background jobs", "future reporting/API"],
    canonicalBoundary: "Preset-based export model with bounded payload generation."
  },
  job: {
    appearsIn: ["background exports", "reminders", "OCR"],
    canonicalBoundary: "Jobs require bounded claims, lease/rescue semantics, and safe failure evidence."
  },
  health: {
    appearsIn: ["ops snapshots", "monitoring", "deployment readiness"],
    canonicalBoundary: "Platform health states in this orchestration layer."
  }
};

export const PLATFORM_CAPABILITIES: Record<PlatformCapabilityId, PlatformCapability> = {
  renewals: {
    id: "renewals",
    label: "Renewal workflow control",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "core_renewal_control_kernel",
    dependencies: ["contracts", "notifications", "audit", "permissions"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["contract_review", "owner_assignment", "renewal_decision"],
    requiredPlans: ["starter"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: ["contract.review_updated", "renewal_decision.created"],
    requiredMonitoring: ["reminder dispatch failures", "workflow write failures"],
    requiredDeploymentGates: ["test:release-critical:workflow"],
    docs: ["PHASE1_RELEASE_CRITICAL.md", "docs/ARCHITECTURE_BOUNDARIES.md"],
    notes: "The shipped kernel loop remains the central product truth."
  },
  contracts: {
    id: "contracts",
    label: "Contract register and metadata",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "core_renewal_control_kernel",
    dependencies: ["audit", "permissions"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["contract_upload", "contract_read", "contract_update"],
    requiredPlans: ["starter"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: ["contract.created"],
    requiredMonitoring: ["tenant-scope query failures"],
    requiredDeploymentGates: ["test:release-critical:intake-review"],
    docs: ["docs/SECURITY_PRIVACY_DATA_FLOWS.md"],
    notes: "Contract truth must stay organization-scoped and reviewed before downstream trust."
  },
  contract_intelligence: {
    id: "contract_intelligence",
    label: "Contract intelligence and risk explanation",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "contract_intelligence_risk_explanation",
    dependencies: ["contracts", "ocr", "ai_generation", "audit", "monitoring", "billing"],
    requiredProviders: ["openai", "supabase"],
    requiredPermissions: ["view_risk_scores"],
    requiredPlans: ["starter", "growth", "portfolio"],
    requiredMarketPolicies: ["AI provider allowed for market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: ["intelligence.risk_explanation_viewed", "intelligence.risk_queue_viewed"],
    requiredMonitoring: ["intelligence access denial"],
    requiredDeploymentGates: ["test:intelligence-release-gate"],
    docs: ["docs/intelligence/INTELLIGENCE_RELEASE_GATE.md"],
    notes: "Reads trusted workflow state and cannot mutate reminders or contract truth."
  },
  financial_intelligence: {
    id: "financial_intelligence",
    label: "Financial exposure intelligence",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "financial_exposure_intelligence",
    dependencies: ["contracts", "billing", "audit", "monitoring", "permissions"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["view_financial_intelligence"],
    requiredPlans: ["growth", "portfolio"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["admin financial intelligence access"],
    requiredAuditEvents: ["intelligence.financial_viewed"],
    requiredMonitoring: ["intelligence access denial", "financial exposure calculation failures"],
    requiredDeploymentGates: ["test:intelligence-release-gate", "tests/financial-exposure.test.ts"],
    docs: ["docs/intelligence/FINANCIAL_INTELLIGENCE_SCOPE.md", "docs/intelligence/INTELLIGENCE_RELEASE_GATE.md"],
    notes: "Calculates renewal exposure from reviewed workflow state with trust metadata and no ERP/accounting claims."
  },
  procurement_analytics: {
    id: "procurement_analytics",
    label: "Procurement/vendor analytics",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "procurement_vendor_analytics",
    dependencies: ["contracts", "billing", "audit", "monitoring", "permissions"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["view_procurement_analytics"],
    requiredPlans: ["growth", "portfolio"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["admin/operator procurement analytics access"],
    requiredAuditEvents: ["intelligence.procurement_viewed"],
    requiredMonitoring: ["intelligence access denial", "procurement analytics query failures"],
    requiredDeploymentGates: ["test:intelligence-release-gate", "tests/procurement-query-helpers.test.ts"],
    docs: ["docs/intelligence/PROCUREMENT_ANALYTICS_SCOPE.md", "docs/intelligence/INTELLIGENCE_RELEASE_GATE.md"],
    notes: "Surfaces action-oriented vendor renewal portfolio metrics with drilldown IDs and no vendor enrichment."
  },
  revenue_intelligence: {
    id: "revenue_intelligence",
    label: "Revenue intelligence and personalized outreach foundation",
    lifecycle: "future_only",
    health: "future_only",
    owningModule: "advanced_retention_governance_analytics",
    dependencies: ["market_profiles", "compliance", "ai_generation", "approval_queue", "audit", "monitoring"],
    requiredProviders: ["future_public_api_provider"],
    requiredPermissions: ["future_revenue_intelligence"],
    requiredPlans: ["future_policy"],
    requiredMarketPolicies: ["outreach mode allowed", "compliance strictness reviewed"],
    requiredIdentityPolicies: ["future internal approval role"],
    requiredAuditEvents: [],
    requiredMonitoring: ["future outreach compliance blocks"],
    requiredDeploymentGates: ["tests/revenue-intelligence-boundary.test.ts"],
    docs: ["docs/REVENUE_INTELLIGENCE_MARKET_EXPANSION_BOUNDARY.md"],
    notes: "Foundation only: no lead database, generation, sending, or export automation is shipped."
  },
  billing: {
    id: "billing",
    label: "Billing and entitlement truth",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "billing_entitlement_control",
    dependencies: ["audit", "monitoring"],
    requiredProviders: ["paddle", "supabase"],
    requiredPermissions: ["manage_billing"],
    requiredPlans: ["none"],
    requiredMarketPolicies: ["payment provider allowed"],
    requiredIdentityPolicies: ["organization admin billing authority"],
    requiredAuditEvents: ["billing.checkout_started"],
    requiredMonitoring: ["billing webhook failures"],
    requiredDeploymentGates: ["test:release-critical:billing"],
    docs: ["docs/OPERATIONAL_EVENT_INVENTORY.md"],
    notes: "Entitlements must come from canonical billing snapshots."
  },
  identity: {
    id: "identity",
    label: "Enterprise identity/RBAC readiness",
    lifecycle: "future_only",
    health: "future_only",
    owningModule: "enterprise_identity_rbac_retention",
    dependencies: ["permissions", "audit", "monitoring", "billing"],
    requiredProviders: ["future_identity_provider"],
    requiredPermissions: ["future_sso_settings", "future_scim_provisioning"],
    requiredPlans: ["enterprise"],
    requiredMarketPolicies: ["enterprise market review where applicable"],
    requiredIdentityPolicies: ["break-glass admin preserved", "SCIM role mapping safe"],
    requiredAuditEvents: ["identity.sso_callback_prepared", "enterprise.scim_user_updated"],
    requiredMonitoring: ["future SSO/SCIM failures"],
    requiredDeploymentGates: ["test:permission-boundaries"],
    docs: ["docs/ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md"],
    notes: "Runtime policy layer exists; provider-backed SSO/SCIM remains future-only."
  },
  platform_api_integrations: {
    id: "platform_api_integrations",
    label: "Public API and enterprise integration boundary",
    lifecycle: "future_only",
    health: "future_only",
    owningModule: "enterprise_integrations",
    dependencies: ["permissions", "audit", "monitoring", "billing", "providers"],
    requiredProviders: ["future_public_api_provider"],
    requiredPermissions: ["future_public_api_tokens", "future_integrations_manage"],
    requiredPlans: ["enterprise"],
    requiredMarketPolicies: ["future API/integration activation approval"],
    requiredIdentityPolicies: ["future scoped API token and OAuth app policy"],
    requiredAuditEvents: [],
    requiredMonitoring: ["future API/integration auth failures"],
    requiredDeploymentGates: ["tests/platform-api-boundary.test.ts", "tests/platform-api-schema-routes.test.ts"],
    docs: ["docs/API_AND_INTEGRATION_BOUNDARY.md", "docs/enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md"],
    notes: "Registry and contract boundary only; no customer API keys, Slack/Teams, ERP/CRM sync, or live integration runtime is shipped."
  },
  providers: {
    id: "providers",
    label: "Provider policy and safe boundaries",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: ["monitoring", "compliance"],
    requiredProviders: ["paddle", "openai", "resend", "supabase"],
    requiredPermissions: ["internal_provider_policy_review"],
    requiredPlans: ["internal_only"],
    requiredMarketPolicies: ["provider compatibility"],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["provider failure events"],
    requiredDeploymentGates: ["test:ops-readiness"],
    docs: ["docs/MARKET_EXPANSION_BOUNDARY.md"],
    notes: "Providers are market and capability gated; raw provider payloads are not safe metadata."
  },
  market_profiles: {
    id: "market_profiles",
    label: "Market profile policy",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: ["compliance"],
    requiredProviders: [],
    requiredPermissions: ["internal_market_policy_review"],
    requiredPlans: ["internal_only"],
    requiredMarketPolicies: ["global/default is only shipped market"],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["market activation denials"],
    requiredDeploymentGates: ["tests/market-profiles.test.ts"],
    docs: ["docs/MARKET_EXPANSION_BOUNDARY.md"],
    notes: "Compatibility is not runtime permission."
  },
  market_activation: {
    id: "market_activation",
    label: "Market activation approval contracts",
    lifecycle: "future_only",
    health: "future_only",
    owningModule: "admin_support_operations",
    dependencies: ["market_profiles", "providers", "compliance", "approval_queue"],
    requiredProviders: [],
    requiredPermissions: ["future_market_activation_approval"],
    requiredPlans: ["future_policy"],
    requiredMarketPolicies: ["organization-specific activation approval"],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["restricted market activation attempts"],
    requiredDeploymentGates: ["tests/market-activation-approval.test.ts"],
    docs: ["docs/MARKET_EXPANSION_BOUNDARY.md"],
    notes: "Does not enable planned or restricted markets today."
  },
  analytics: {
    id: "analytics",
    label: "Analytics and product measurement",
    lifecycle: "experimental",
    health: "warning",
    owningModule: "advanced_retention_governance_analytics",
    dependencies: ["audit", "monitoring", "billing"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["future_analytics_view"],
    requiredPlans: ["future_policy"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["admin/operator access where future-visible"],
    requiredAuditEvents: [],
    requiredMonitoring: ["analytics pipeline failures"],
    requiredDeploymentGates: ["test:analytics-runtime"],
    docs: ["docs/reference/future/UNIFIED_ANALYTICS_BLUEPRINT.md"],
    notes: "Analytics remains bounded by privacy and actionability rules."
  },
  ocr: {
    id: "ocr",
    label: "OCR/import processing",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "ocr_import_intelligence",
    dependencies: ["contracts", "ai_generation", "monitoring", "audit"],
    requiredProviders: ["openai", "supabase"],
    requiredPermissions: ["contract_upload"],
    requiredPlans: ["starter"],
    requiredMarketPolicies: ["OCR provider allowed for market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: [],
    requiredMonitoring: ["OCR job failures", "OCR stale rescue"],
    requiredDeploymentGates: ["test:ocr-trust"],
    docs: ["docs/SECURITY_PRIVACY_DATA_FLOWS.md"],
    notes: "Raw OCR output must never enter logs or audit details."
  },
  ai_generation: {
    id: "ai_generation",
    label: "AI contracts and generation boundaries",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "ocr_import_intelligence",
    dependencies: ["providers", "monitoring", "compliance"],
    requiredProviders: ["openai"],
    requiredPermissions: ["ai_processing"],
    requiredPlans: ["starter", "growth", "portfolio"],
    requiredMarketPolicies: ["AI provider allowed for market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: [],
    requiredMonitoring: ["AI/OCR provider failures"],
    requiredDeploymentGates: ["test:ocr-trust", "test:intelligence-release-gate"],
    docs: ["docs/intelligence/INTELLIGENCE_LAYER_ARCHITECTURE.md"],
    notes: "AI output is confidence/trust bounded and cannot bypass review gates."
  },
  exports: {
    id: "exports",
    label: "Export and reporting subsystem",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "export_reporting_intelligence",
    dependencies: ["contracts", "billing", "audit", "monitoring", "permissions"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["export_basic", "export_sensitive_presets"],
    requiredPlans: ["starter", "growth", "portfolio", "preset_specific"],
    requiredMarketPolicies: ["global/default runtime market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: ["contracts.export_attempted", "contracts.exported"],
    requiredMonitoring: ["export failures", "artifact limit failures"],
    requiredDeploymentGates: ["test:release-critical:exports", "test:background-exports"],
    docs: ["docs/EXPORT_PRESETS.md", "docs/SCALE_AND_PERFORMANCE.md"],
    notes: "Exports are preset-based, bounded, tenant-scoped, and sanitized."
  },
  notifications: {
    id: "notifications",
    label: "Reminder and notification workflow",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "reminder_workflow_automation",
    dependencies: ["contracts", "audit", "monitoring", "providers"],
    requiredProviders: ["resend", "supabase"],
    requiredPermissions: ["trusted_reminder_activation"],
    requiredPlans: ["growth"],
    requiredMarketPolicies: ["email provider allowed for market"],
    requiredIdentityPolicies: ["active organization membership"],
    requiredAuditEvents: [],
    requiredMonitoring: ["reminder dispatch failures", "stale reminder rescue"],
    requiredDeploymentGates: ["test:release-critical:workflow"],
    docs: ["docs/OPERATIONAL_RUNBOOKS.md"],
    notes: "Reminder state writes must be explicit and recoverable."
  },
  approval_queue: {
    id: "approval_queue",
    label: "Approval queue contracts",
    lifecycle: "future_only",
    health: "future_only",
    owningModule: "admin_support_operations",
    dependencies: ["audit", "permissions", "compliance"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["future_approval_review"],
    requiredPlans: ["future_policy"],
    requiredMarketPolicies: ["approval policy by market"],
    requiredIdentityPolicies: ["reviewer/admin authority"],
    requiredAuditEvents: [],
    requiredMonitoring: ["approval queue stuck/failure"],
    requiredDeploymentGates: ["tests/revenue-intelligence-boundary.test.ts"],
    docs: ["docs/REVENUE_INTELLIGENCE_MARKET_EXPANSION_BOUNDARY.md"],
    notes: "Approval is modeled as state, not hidden manual rescue."
  },
  audit: {
    id: "audit",
    label: "Audit accountability boundary",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: [],
    requiredProviders: ["supabase"],
    requiredPermissions: ["audit_write", "audit_view_scoped"],
    requiredPlans: ["none"],
    requiredMarketPolicies: [],
    requiredIdentityPolicies: ["customer-visible audit role rules"],
    requiredAuditEvents: [],
    requiredMonitoring: ["audit persistence failures"],
    requiredDeploymentGates: ["tests/audit.test.ts"],
    docs: ["docs/SECURITY_PRIVACY_DATA_FLOWS.md"],
    notes: "Audit is customer/accountability truth and must not be debug dump."
  },
  monitoring: {
    id: "monitoring",
    label: "Monitoring and operational diagnostics",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: [],
    requiredProviders: [],
    requiredPermissions: ["internal_ops_view"],
    requiredPlans: ["internal_only"],
    requiredMarketPolicies: [],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["operational event sink"],
    requiredDeploymentGates: ["test:monitoring-readiness"],
    docs: ["docs/OPERATIONAL_MATURITY.md", "docs/OPERATIONAL_EVENT_INVENTORY.md"],
    notes: "Monitoring is sanitized operator signal, separate from audit truth."
  },
  deployment_readiness: {
    id: "deployment_readiness",
    label: "Deployment readiness gates",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: ["monitoring", "audit", "billing", "market_profiles"],
    requiredProviders: [],
    requiredPermissions: ["internal_release_engineer"],
    requiredPlans: ["internal_only"],
    requiredMarketPolicies: ["global/default shipped boundary"],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["release gate failures"],
    requiredDeploymentGates: ["test:deployment-readiness"],
    docs: ["docs/DEPLOYMENT_RELEASE_SAFETY.md"],
    notes: "Release readiness validates contracts, docs, env, and shipped/deferred boundaries."
  },
  permissions: {
    id: "permissions",
    label: "Permission and action boundary",
    lifecycle: "generally_available",
    health: "healthy",
    owningModule: "core_renewal_control_kernel",
    dependencies: ["billing"],
    requiredProviders: ["supabase"],
    requiredPermissions: ["permission_policy"],
    requiredPlans: ["none"],
    requiredMarketPolicies: [],
    requiredIdentityPolicies: ["role membership"],
    requiredAuditEvents: [],
    requiredMonitoring: ["permission denials"],
    requiredDeploymentGates: ["test:permission-boundaries"],
    docs: ["docs/ARCHITECTURE_BOUNDARIES.md"],
    notes: "Permissions must be explicit per action/capability."
  },
  compliance: {
    id: "compliance",
    label: "Compliance and privacy policy boundary",
    lifecycle: "internal",
    health: "healthy",
    owningModule: "admin_support_operations",
    dependencies: ["audit", "monitoring"],
    requiredProviders: [],
    requiredPermissions: ["compliance_policy_review"],
    requiredPlans: ["internal_only"],
    requiredMarketPolicies: ["restricted market review"],
    requiredIdentityPolicies: ["internal role boundary"],
    requiredAuditEvents: [],
    requiredMonitoring: ["privacy/security policy violations"],
    requiredDeploymentGates: ["test:privacy-ops"],
    docs: ["docs/SECURITY_PRIVACY_DATA_FLOWS.md", "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md"],
    notes: "Compliance contracts are safety gates and not legal advice."
  }
} as const;

export const PLATFORM_CAPABILITY_IDS = Object.keys(PLATFORM_CAPABILITIES) as PlatformCapabilityId[];

export const PLATFORM_EVENT_REGISTRY: readonly PlatformEventRegistration[] = Object.values(
  PRODUCT_EVENT_TAXONOMY
).map((event) => {
  const owningCapability =
    PLATFORM_CAPABILITY_IDS.find(
      (capabilityId) => PLATFORM_CAPABILITIES[capabilityId].owningModule === event.owningProductModule
    ) ?? "audit";
  return {
    eventName: event.name,
    type: event.type,
    owningCapability,
    owningModule: event.owningProductModule,
    emittedToday: event.emittedToday,
    requiredForCapability: PLATFORM_CAPABILITIES[owningCapability].requiredAuditEvents.includes(event.name)
  };
});

export function getPlatformCapability(id: PlatformCapabilityId) {
  return PLATFORM_CAPABILITIES[id];
}

export function resolvePlatformCapabilityDependencies(id: PlatformCapabilityId): PlatformCapabilityId[] {
  const visited = new Set<PlatformCapabilityId>();
  const ordered: PlatformCapabilityId[] = [];

  function visit(current: PlatformCapabilityId) {
    for (const dependency of PLATFORM_CAPABILITIES[current].dependencies) {
      if (visited.has(dependency)) continue;
      visited.add(dependency);
      visit(dependency);
      ordered.push(dependency);
    }
  }

  visit(id);
  return ordered;
}

export function detectPlatformDependencyCycles() {
  const cycles: string[][] = [];
  const visiting = new Set<PlatformCapabilityId>();
  const visited = new Set<PlatformCapabilityId>();

  function visit(id: PlatformCapabilityId, path: PlatformCapabilityId[]) {
    if (visiting.has(id)) {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const dependency of PLATFORM_CAPABILITIES[id].dependencies) {
      visit(dependency, [...path, dependency]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of PLATFORM_CAPABILITY_IDS) visit(id, [id]);
  return cycles;
}

export function getPlatformEventsForCapability(id: PlatformCapabilityId) {
  return PLATFORM_EVENT_REGISTRY.filter((event) => event.owningCapability === id);
}

export function validatePlatformRuntimeContext(
  context: PlatformRuntimeContext
): PlatformRuntimeContextValidation {
  const reasonCodes: string[] = [];

  if (!context.organization.organizationId) reasonCodes.push("organization_missing");
  if (!context.organization.active) reasonCodes.push("organization_inactive");
  if (context.workspace.activeOrganizationId !== context.organization.organizationId) {
    reasonCodes.push("workspace_org_mismatch");
  }
  if (!context.market.marketId) reasonCodes.push("market_missing");
  if (!PLATFORM_HEALTH_STATES.includes(context.monitoringContext.health)) {
    reasonCodes.push("invalid_health_state");
  }
  for (const capabilityId of context.featureGates.enabledCapabilities) {
    if (!PLATFORM_CAPABILITIES[capabilityId]) reasonCodes.push("unknown_capability");
  }

  return {
    valid: reasonCodes.length === 0,
    reasonCodes
  };
}

const planRank: Record<string, number> = {
  none: 0,
  free: 0,
  starter: 1,
  growth: 2,
  portfolio: 3,
  enterprise: 4
};

function planSatisfiesRequirement(
  currentPlan: PlatformRuntimeContext["subscription"]["planTier"],
  requirement: PlatformPlanRequirement,
  mode: PlatformCapabilityEvaluationMode
) {
  if (requirement === "none") return true;
  if (requirement === "internal_only") return Boolean(mode.allowInternalCapabilities);
  if (requirement === "future_policy" || requirement === "preset_specific") return false;

  return (planRank[String(currentPlan ?? "none")] ?? -1) >= (planRank[requirement] ?? Number.POSITIVE_INFINITY);
}

function isCustomerUsableLifecycle(lifecycle: PlatformLifecycleState, mode: PlatformCapabilityEvaluationMode) {
  if (lifecycle === "internal") return Boolean(mode.allowInternalCapabilities);
  return lifecycle === "generally_available" || lifecycle === "beta" || lifecycle === "customer_preview";
}

function isCustomerUsableHealth(health: PlatformHealthState, mode: PlatformCapabilityEvaluationMode) {
  if (health === "healthy" || health === "warning" || health === "maintenance") return true;
  if (health === "degraded" && mode.allowDegradedHealth) return true;
  return false;
}

function requiresRuntimeMarket(capability: PlatformCapability) {
  return capability.lifecycle === "generally_available" || capability.lifecycle === "beta" || capability.lifecycle === "customer_preview";
}

function hasInternalPlanRequirement(capability: PlatformCapability) {
  return capability.requiredPlans.includes("internal_only");
}

function statusFromReasonCodes(reasonCodes: readonly string[]): PlatformCapabilityRuntimeStatus {
  if (reasonCodes.some((reason) => reason.startsWith("context_"))) return "unhealthy_context";
  if (reasonCodes.some((reason) => reason.startsWith("lifecycle_future") || reason.startsWith("health_future"))) {
    return "future_only";
  }
  if (
    reasonCodes.some((reason) =>
      ["lifecycle_disabled", "health_disabled", "lifecycle_deprecated", "health_blocked"].includes(reason)
    )
  ) {
    return "disabled";
  }
  if (reasonCodes.some((reason) => reason.startsWith("dependency_"))) return "missing_dependency";
  if (reasonCodes.some((reason) => reason.startsWith("provider_"))) return "missing_provider";
  if (reasonCodes.some((reason) => reason.startsWith("plan_"))) return "missing_plan";
  if (reasonCodes.some((reason) => reason.startsWith("market_"))) return "missing_market_policy";
  if (reasonCodes.some((reason) => reason.startsWith("identity_"))) return "missing_identity_policy";
  if (reasonCodes.some((reason) => reason.startsWith("feature_gate_"))) return "missing_feature_gate";
  return reasonCodes.length > 0 ? "blocked" : "usable";
}

function messageForStatus(status: PlatformCapabilityRuntimeStatus) {
  switch (status) {
    case "usable":
      return "Capability is usable in the current platform runtime context.";
    case "future_only":
      return "Capability is future-only and cannot be used in current runtime.";
    case "disabled":
      return "Capability is disabled or deprecated and cannot be used.";
    case "missing_dependency":
      return "Capability is blocked because a required dependency is not usable.";
    case "missing_provider":
      return "Capability is blocked because a required provider is unavailable.";
    case "missing_plan":
      return "Capability is blocked by the current plan or packaging policy.";
    case "missing_market_policy":
      return "Capability is blocked by market runtime policy.";
    case "missing_identity_policy":
      return "Capability is blocked by identity or actor context policy.";
    case "missing_feature_gate":
      return "Capability is blocked because the feature gate is not enabled.";
    case "unhealthy_context":
      return "Capability is blocked because the platform runtime context is unhealthy.";
    default:
      return "Capability is blocked by platform policy.";
  }
}

export function evaluatePlatformCapabilityRuntime(
  capabilityId: PlatformCapabilityId,
  context: PlatformRuntimeContext,
  mode: PlatformCapabilityEvaluationMode = {},
  visited: Set<PlatformCapabilityId> = new Set()
): PlatformCapabilityRuntimeDecision {
  const capability = PLATFORM_CAPABILITIES[capabilityId];
  const reasonCodes: string[] = [];
  const dependencyDecisions: PlatformCapabilityRuntimeDecision[] = [];
  const dependencyMode = mode.dependencyMode ?? "recursive";
  const requireFeatureGate = mode.requireFeatureGate ?? true;

  const contextValidation = validatePlatformRuntimeContext(context);
  if (!contextValidation.valid) {
    reasonCodes.push(...contextValidation.reasonCodes.map((reason) => `context_${reason}`));
  }

  if (!isCustomerUsableLifecycle(capability.lifecycle, mode)) {
    reasonCodes.push(`lifecycle_${capability.lifecycle}`);
  }

  if (!isCustomerUsableHealth(capability.health, mode)) {
    reasonCodes.push(`health_${capability.health}`);
  }

  if (hasInternalPlanRequirement(capability) && !mode.allowInternalCapabilities) {
    reasonCodes.push("plan_internal_only");
  }

  const missingProviders = capability.requiredProviders.filter(
    (provider) => !context.providerPolicies.providers.includes(provider)
  );
  if (missingProviders.length > 0) {
    reasonCodes.push(...missingProviders.map((provider) => `provider_missing_${provider}`));
  }

  const planSatisfied = capability.requiredPlans.some((requirement) =>
    planSatisfiesRequirement(context.subscription.planTier, requirement, mode)
  );
  if (!planSatisfied) {
    reasonCodes.push("plan_requirement_not_met");
  }

  if (requiresRuntimeMarket(capability)) {
    if (!context.market.runtimeEnabled) reasonCodes.push("market_runtime_disabled");
    if (context.market.marketId !== "global") reasonCodes.push("market_not_shipped_runtime");
  }

  if (capability.requiredPermissions.length > 0 && !context.identity.actorUserId) {
    reasonCodes.push("identity_actor_required");
  }

  if (requireFeatureGate && isCustomerUsableLifecycle(capability.lifecycle, mode)) {
    if (!context.featureGates.enabledCapabilities.includes(capabilityId)) {
      reasonCodes.push(`feature_gate_missing_${capabilityId}`);
    }
  }

  if (dependencyMode !== "disabled") {
    if (visited.has(capabilityId)) {
      reasonCodes.push("dependency_cycle_detected");
    } else {
      const nextVisited = new Set(visited);
      nextVisited.add(capabilityId);
      for (const dependencyId of capability.dependencies) {
        const dependencyDecision =
          dependencyMode === "recursive"
            ? evaluatePlatformCapabilityRuntime(
                dependencyId,
                context,
                { ...mode, allowInternalCapabilities: true, requireFeatureGate: false },
                nextVisited
              )
            : evaluatePlatformCapabilityRuntime(
                dependencyId,
                context,
                {
                  ...mode,
                  dependencyMode: "disabled",
                  allowInternalCapabilities: true,
                  requireFeatureGate: false
                },
                nextVisited
              );
        dependencyDecisions.push(dependencyDecision);
        if (!dependencyDecision.usable) {
          reasonCodes.push(`dependency_blocked_${dependencyId}`);
        }
      }
    }
  }

  const status = statusFromReasonCodes(reasonCodes);

  return {
    usable: status === "usable",
    status,
    reasonCodes,
    capabilityId,
    lifecycle: capability.lifecycle,
    health: capability.health,
    requiredProviders: capability.requiredProviders,
    missingProviders,
    requiredPlans: capability.requiredPlans,
    requiredPermissions: capability.requiredPermissions,
    missingFeatureGates:
      reasonCodes.includes(`feature_gate_missing_${capabilityId}`) ? [capabilityId] : [],
    dependencyDecisions,
    customerSafeMessage: messageForStatus(status)
  };
}

export function getPlatformModuleCapabilityCoverage() {
  return Object.fromEntries(
    Object.keys(PLATFORM_MODULES).map((moduleId) => [
      moduleId,
      PLATFORM_CAPABILITY_IDS.filter(
        (capabilityId) => PLATFORM_CAPABILITIES[capabilityId].owningModule === moduleId
      )
    ])
  ) as Record<PlatformModuleId, PlatformCapabilityId[]>;
}
