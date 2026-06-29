import { normalizeBillingSnapshot } from "@/lib/billing/entitlements";
import { sanitizeOperationalValue } from "@/lib/observability/server-logger";

export type EnterpriseOnboardingReadinessStatus =
  | "complete"
  | "needs_action"
  | "unavailable"
  | "future";

export type EnterpriseOnboardingLaunchGate = "pilot" | "paid_launch" | "enterprise_launch";

export type EnterpriseOnboardingReadinessCategory =
  | "organization_profile"
  | "billing_subscription"
  | "first_contract_imported"
  | "owner_assignment"
  | "reminder_policy"
  | "export_capability"
  | "audit_event_visibility"
  | "data_governance_review"
  | "operational_contacts"
  | "identity_readiness"
  | "sso_scim_boundary";

export type EnterpriseOnboardingReadinessInput = {
  organizationId: string;
  organizationProfileCompleted?: boolean;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  trialEndsAt?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  contractCount?: number;
  reviewedContractCount?: number;
  ownerAssignedContractCount?: number;
  trustedReminderCount?: number;
  completedExportCount?: number;
  auditVisibilityReviewed?: boolean;
  dataGovernanceReviewed?: boolean;
  operationalContactCount?: number;
  identityReadinessReviewed?: boolean;
  ssoScimContractReadinessReviewed?: boolean;
  providerBackedSsoEnabled?: boolean;
  providerBackedScimEnabled?: boolean;
  supportMetadata?: Record<string, unknown>;
};

export type EnterpriseOnboardingReadinessItem = {
  category: EnterpriseOnboardingReadinessCategory;
  label: string;
  status: EnterpriseOnboardingReadinessStatus;
  customerSafeReason: string;
  nextAction: string;
  relatedDoc: string;
  requiredFor: readonly EnterpriseOnboardingLaunchGate[];
};

export type EnterpriseOnboardingReadiness = {
  organizationId: string;
  items: readonly EnterpriseOnboardingReadinessItem[];
  gateStatus: Record<EnterpriseOnboardingLaunchGate, boolean>;
  customerSafeSummary: string;
};

export type EnterpriseOnboardingSupportDiagnostic = {
  signalType: "enterprise_onboarding_support_diagnostic";
  organizationId: string;
  gateStatus: Record<EnterpriseOnboardingLaunchGate, boolean>;
  categoryStatuses: Record<EnterpriseOnboardingReadinessCategory, EnterpriseOnboardingReadinessStatus>;
  needsActionCategories: EnterpriseOnboardingReadinessCategory[];
  futureCategories: EnterpriseOnboardingReadinessCategory[];
  safeMetadata: Record<string, unknown>;
};

const activeBillingStatuses = new Set(["active", "trialing"]);

const supportMetadataAllowlist = new Set([
  "organization_id",
  "plan_tier",
  "subscription_status",
  "billing_provider",
  "contract_count",
  "reviewed_contract_count",
  "owner_assigned_contract_count",
  "trusted_reminder_count",
  "completed_export_count",
  "operational_contact_count",
  "request_id",
  "status",
  "failure_code",
  "failure_category",
  "updated_at"
]);

function billingIsLaunchReady(input: EnterpriseOnboardingReadinessInput) {
  const snapshot = normalizeBillingSnapshot({
    organizationId: input.organizationId,
    plan_tier: input.planTier,
    subscription_status: input.subscriptionStatus,
    billing_provider: input.billingProvider,
    trial_ends_at: input.trialEndsAt,
    subscription_current_period_end: input.subscriptionCurrentPeriodEnd
  });

  return snapshot.planTier !== "free" && activeBillingStatuses.has(snapshot.subscriptionStatus);
}

function item(input: EnterpriseOnboardingReadinessItem): EnterpriseOnboardingReadinessItem {
  return input;
}

function isComplete(status: EnterpriseOnboardingReadinessStatus) {
  return status === "complete";
}

function buildGateStatus(items: readonly EnterpriseOnboardingReadinessItem[]) {
  return {
    pilot: items
      .filter((readinessItem) => readinessItem.requiredFor.includes("pilot"))
      .every((readinessItem) => isComplete(readinessItem.status)),
    paid_launch: items
      .filter((readinessItem) => readinessItem.requiredFor.includes("paid_launch"))
      .every((readinessItem) => isComplete(readinessItem.status)),
    enterprise_launch: items
      .filter((readinessItem) => readinessItem.requiredFor.includes("enterprise_launch"))
      .every((readinessItem) => isComplete(readinessItem.status))
  };
}

function sanitizeSupportMetadata(metadata: Record<string, unknown> = {}) {
  const allowed = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => supportMetadataAllowlist.has(key))
  );
  return sanitizeOperationalValue(allowed) as Record<string, unknown>;
}

export function buildEnterpriseOnboardingReadiness(
  input: EnterpriseOnboardingReadinessInput
): EnterpriseOnboardingReadiness {
  const billingReady = billingIsLaunchReady(input);
  const hasContract = (input.contractCount ?? 0) > 0;
  const hasReviewedContract = (input.reviewedContractCount ?? 0) > 0;
  const ownerConfigured = (input.ownerAssignedContractCount ?? 0) > 0;
  const reminderConfigured = (input.trustedReminderCount ?? 0) > 0;
  const exportVerified = (input.completedExportCount ?? 0) > 0;
  const operationalContactsConfigured = (input.operationalContactCount ?? 0) > 0;
  const providerBackedIdentityShipped = Boolean(
    input.providerBackedSsoEnabled && input.providerBackedScimEnabled
  );

  const items = [
    item({
      category: "organization_profile",
      label: "Organization profile completed",
      status: input.organizationProfileCompleted ? "complete" : "needs_action",
      customerSafeReason: input.organizationProfileCompleted
        ? "Workspace identity and organization basics are ready."
        : "Workspace basics need to be confirmed before onboarding can be trusted.",
      nextAction: input.organizationProfileCompleted
        ? "Keep organization contacts and ownership current."
        : "Confirm organization name, active org context, and primary administrator.",
      relatedDoc: "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
      requiredFor: ["pilot", "paid_launch", "enterprise_launch"]
    }),
    item({
      category: "billing_subscription",
      label: "Billing/subscription active",
      status: billingReady ? "complete" : "needs_action",
      customerSafeReason: billingReady
        ? "Canonical billing truth shows an active paid or trial subscription state."
        : "Paid launch needs canonical billing truth, not provider-label inference.",
      nextAction: billingReady
        ? "Review support-led exceptions only if billing provider is not Paddle."
        : "Activate Paddle billing or configure a support-led exception with explicit plan/status.",
      relatedDoc: "docs/CURRENT_PRODUCT_TRUTH.md",
      requiredFor: ["paid_launch", "enterprise_launch"]
    }),
    item({
      category: "first_contract_imported",
      label: "First contract uploaded/imported",
      status: hasContract ? "complete" : "needs_action",
      customerSafeReason: hasContract
        ? "At least one organization-scoped contract exists for renewal-control work."
        : "No contract has reached the renewal-control workspace yet.",
      nextAction: hasContract ? "Review P0 metadata for the first contract." : "Upload or import the first contract.",
      relatedDoc: "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
      requiredFor: ["pilot", "paid_launch", "enterprise_launch"]
    }),
    item({
      category: "owner_assignment",
      label: "Owner assignment configured",
      status: hasReviewedContract && ownerConfigured ? "complete" : "needs_action",
      customerSafeReason: ownerConfigured
        ? "At least one reviewed contract has accountable ownership."
        : "Trusted reminder and decision workflows need accountable ownership.",
      nextAction: ownerConfigured ? "Keep owner coverage current." : "Assign an owner to a reviewed contract.",
      relatedDoc: "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
      requiredFor: ["pilot", "paid_launch", "enterprise_launch"]
    }),
    item({
      category: "reminder_policy",
      label: "Reminder policy configured",
      status: reminderConfigured ? "complete" : "needs_action",
      customerSafeReason: reminderConfigured
        ? "At least one trusted reminder path is active."
        : "Reminder activation still needs review, owner, and trust gates.",
      nextAction: reminderConfigured
        ? "Monitor reminder delivery and stale-rescue health."
        : "Complete review and owner gates, then activate a trusted reminder.",
      relatedDoc: "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
      requiredFor: ["pilot", "paid_launch", "enterprise_launch"]
    }),
    item({
      category: "export_capability",
      label: "Export capability verified",
      status: exportVerified ? "complete" : "needs_action",
      customerSafeReason: exportVerified
        ? "At least one safe export/reporting path has completed."
        : "Launch readiness should verify export/reporting without exposing sensitive sections by default.",
      nextAction: exportVerified
        ? "Use preset-specific export gates for richer reports."
        : "Run a basic contract register or workflow export with the correct preset gate.",
      relatedDoc: "docs/EXPORT_PRESETS.md",
      requiredFor: ["paid_launch", "enterprise_launch"]
    }),
    item({
      category: "audit_event_visibility",
      label: "Audit/event visibility understood",
      status: input.auditVisibilityReviewed ? "complete" : "needs_action",
      customerSafeReason: input.auditVisibilityReviewed
        ? "The team understands audit truth, analytics, logs, and monitoring separation."
        : "Enterprise launch needs clear accountability evidence and privacy-safe event semantics.",
      nextAction: input.auditVisibilityReviewed
        ? "Keep event taxonomy and customer audit copy aligned."
        : "Review the event taxonomy and audit/log/analytics boundary with operators.",
      relatedDoc: "docs/EVENT_TAXONOMY.md",
      requiredFor: ["enterprise_launch"]
    }),
    item({
      category: "data_governance_review",
      label: "Data retention/governance reviewed",
      status: input.dataGovernanceReviewed ? "complete" : "needs_action",
      customerSafeReason: input.dataGovernanceReviewed
        ? "Retention, deletion, export artifact expiry, and support-access boundaries have been reviewed."
        : "Enterprise launch needs privacy/governance boundaries understood before customer commitments.",
      nextAction: input.dataGovernanceReviewed
        ? "Keep future legal hold and retention claims out of shipped copy until runtime exists."
        : "Review data governance, retention, workspace deletion, and support-access boundaries.",
      relatedDoc: "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md",
      requiredFor: ["enterprise_launch"]
    }),
    item({
      category: "operational_contacts",
      label: "Operational contacts configured",
      status: operationalContactsConfigured ? "complete" : "needs_action",
      customerSafeReason: operationalContactsConfigured
        ? "At least one operational contact exists for billing, support, or incident follow-up."
        : "Support and incident response need named operational contacts.",
      nextAction: operationalContactsConfigured
        ? "Keep contacts current as account ownership changes."
        : "Add billing/support/security operational contacts outside raw customer-data fields.",
      relatedDoc: "docs/OPERATIONAL_MATURITY.md",
      requiredFor: ["enterprise_launch"]
    }),
    item({
      category: "identity_readiness",
      label: "Identity readiness reviewed",
      status: input.identityReadinessReviewed ? "complete" : "needs_action",
      customerSafeReason: input.identityReadinessReviewed
        ? "Current roles, future enterprise identity boundaries, and break-glass expectations have been reviewed."
        : "Enterprise launch needs identity boundaries reviewed before SSO/SCIM commitments.",
      nextAction: input.identityReadinessReviewed
        ? "Keep role/RBAC changes tied to the central enterprise identity registry."
        : "Review shipped roles, future SSO/SCIM contracts, and break-glass admin expectations.",
      relatedDoc: "docs/ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md",
      requiredFor: ["enterprise_launch"]
    }),
    item({
      category: "sso_scim_boundary",
      label: "SSO/SCIM contract readiness",
      status:
        providerBackedIdentityShipped && input.ssoScimContractReadinessReviewed
          ? "complete"
          : "future",
      customerSafeReason: providerBackedIdentityShipped
        ? "Provider-backed SSO and SCIM are enabled and readiness has been reviewed."
        : "Runtime policy and contracts exist, but provider-backed SSO login and live SCIM endpoints are still future work.",
      nextAction: providerBackedIdentityShipped
        ? "Verify provider metadata, SCIM token lifecycle, session revocation, and audit evidence."
        : "Do not present SSO/SCIM as shipped; use the implementation plan for enterprise commitments.",
      relatedDoc: "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md",
      requiredFor: ["enterprise_launch"]
    })
  ] as const;

  const gateStatus = buildGateStatus(items);

  return {
    organizationId: input.organizationId,
    items,
    gateStatus,
    customerSafeSummary: gateStatus.enterprise_launch
      ? "Enterprise onboarding readiness is complete for the configured launch gates."
      : gateStatus.paid_launch
        ? "Paid launch readiness is complete; enterprise readiness still needs governance, operations, identity, or future SSO/SCIM work."
        : gateStatus.pilot
          ? "Pilot readiness is complete; paid launch still needs billing or export verification."
          : "Enterprise onboarding readiness is not complete yet; finish the renewal-control pilot path first."
  };
}

export function buildEnterpriseOnboardingSupportDiagnostic(
  input: EnterpriseOnboardingReadinessInput
): EnterpriseOnboardingSupportDiagnostic {
  const readiness = buildEnterpriseOnboardingReadiness(input);
  const categoryStatuses = Object.fromEntries(
    readiness.items.map((readinessItem) => [readinessItem.category, readinessItem.status])
  ) as Record<EnterpriseOnboardingReadinessCategory, EnterpriseOnboardingReadinessStatus>;

  return {
    signalType: "enterprise_onboarding_support_diagnostic",
    organizationId: input.organizationId,
    gateStatus: readiness.gateStatus,
    categoryStatuses,
    needsActionCategories: readiness.items
      .filter((readinessItem) => readinessItem.status === "needs_action")
      .map((readinessItem) => readinessItem.category),
    futureCategories: readiness.items
      .filter((readinessItem) => readinessItem.status === "future")
      .map((readinessItem) => readinessItem.category),
    safeMetadata: sanitizeSupportMetadata({
      organization_id: input.organizationId,
      plan_tier: input.planTier ?? null,
      subscription_status: input.subscriptionStatus ?? null,
      billing_provider: input.billingProvider ?? null,
      contract_count: input.contractCount ?? 0,
      reviewed_contract_count: input.reviewedContractCount ?? 0,
      owner_assigned_contract_count: input.ownerAssignedContractCount ?? 0,
      trusted_reminder_count: input.trustedReminderCount ?? 0,
      completed_export_count: input.completedExportCount ?? 0,
      operational_contact_count: input.operationalContactCount ?? 0,
      ...(input.supportMetadata ?? {})
    })
  };
}
