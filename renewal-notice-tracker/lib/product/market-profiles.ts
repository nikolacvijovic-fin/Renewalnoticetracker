import type { BillingProviderName } from "@/lib/billing/types";
import type { PlatformModuleId } from "@/lib/product/platform-modules";

export type MarketProfileId =
  | "global"
  | "us"
  | "eu"
  | "manual_invoice_review"
  | "restricted_market_review";

export type MarketStatus = "shipped" | "planned" | "restricted_review" | "unsupported";
export type MarketPaymentProvider = BillingProviderName;
export type MarketManualInvoicePolicy = "not_allowed" | "support_exception" | "requires_review";
export type MarketAiProvider = "openai" | "none";
export type MarketOcrProvider = "openai" | "mock" | "none";
export type MarketEmailProvider = "resend" | "none";
export type MarketOutreachMode = "manual_export" | "crm_upload" | "email_send";
export type MarketToneProfile = "direct_professional" | "formal_review_required" | "support_led_only";
export type MarketConsentComplianceStrictness = "standard_b2b" | "review_required" | "restricted";
export type MarketDataResidencyPolicy = "standard_us_hosted" | "standard_eu_review" | "future_review_required";
export type MarketTaxInvoicePolicy = "standard_self_serve" | "support_led_invoice_review" | "future_review_required";
export type MarketActivationPolicy =
  | "self_serve_allowed"
  | "support_led_only"
  | "compliance_review_required"
  | "unsupported";

export type MarketCustomerSafeReasonCode =
  | "allowed"
  | "compatible"
  | "market_not_shipped"
  | "compliance_review_required"
  | "provider_unavailable"
  | "manual_invoice_not_allowed"
  | "feature_unavailable"
  | "self_serve_unavailable"
  | "unsupported_market";

export type MarketProviderLimitation = {
  provider: string;
  limitation: string;
  customerSafeMessage: string;
};

export type MarketProfile = {
  marketId: MarketProfileId;
  label: string;
  marketStatus: MarketStatus;
  defaultCurrency: "USD" | "EUR";
  allowedPaymentProviders: readonly MarketPaymentProvider[];
  allowedManualInvoicePolicy: MarketManualInvoicePolicy;
  allowedAiProviders: readonly MarketAiProvider[];
  allowedOcrProviders: readonly MarketOcrProvider[];
  allowedEmailProviders: readonly MarketEmailProvider[];
  allowedOutreachModes: readonly MarketOutreachMode[];
  supportedLanguages: readonly string[];
  toneProfile: MarketToneProfile;
  outreachComplianceStrictness: MarketConsentComplianceStrictness;
  dataResidencyPolicy: MarketDataResidencyPolicy;
  taxInvoicePolicy: MarketTaxInvoicePolicy;
  complianceReviewRequired: boolean;
  activationPolicy: MarketActivationPolicy;
  allowedProductModules: readonly PlatformModuleId[];
  unavailableProductModules: readonly PlatformModuleId[];
  providerLimitations: readonly MarketProviderLimitation[];
  customerSafeStatusMessage: string;
};

export type MarketPolicyDecision = {
  allowed: boolean;
  reason: MarketCustomerSafeReasonCode;
  customerSafeMessage: string;
  requiresComplianceReview: boolean;
  marketId: MarketProfileId;
};

export type MarketCompatibilityDecision = {
  compatible: boolean;
  reason: MarketCustomerSafeReasonCode;
  customerSafeMessage: string;
  marketId: MarketProfileId;
};

export type MarketAuditEventName =
  | "market.profile_selected"
  | "market.activation_requested"
  | "market.manual_invoice_review_requested"
  | "market.provider_unavailable"
  | "market.compliance_review_required";

export type MarketAuditEventContract = {
  eventName: MarketAuditEventName;
  safeMetadataFields: readonly string[];
  forbiddenMetadataFields: readonly string[];
  notes: string;
};

const shippedKernelModules = [
  "core_renewal_control_kernel",
  "contract_intelligence_risk_explanation",
  "financial_exposure_intelligence",
  "procurement_vendor_analytics",
  "export_reporting_intelligence",
  "ocr_import_intelligence",
  "reminder_workflow_automation",
  "billing_entitlement_control",
  "admin_support_operations"
] as const satisfies readonly PlatformModuleId[];

const futureEnterpriseModules = [
  "enterprise_identity_rbac_retention",
  "enterprise_integrations",
  "advanced_retention_governance_analytics",
  "full_clm_expansion"
] as const satisfies readonly PlatformModuleId[];

const restrictedMarketMessage =
  "This market is not self-serve. Activation requires manual legal/compliance review before any provider or product access decision.";

export const MARKET_PROFILES: Record<MarketProfileId, MarketProfile> = {
  global: {
    marketId: "global",
    label: "Global default",
    marketStatus: "shipped",
    defaultCurrency: "USD",
    allowedPaymentProviders: ["paddle", "manual", "paypal"],
    allowedManualInvoicePolicy: "support_exception",
    allowedAiProviders: ["openai"],
    allowedOcrProviders: ["openai", "mock"],
    allowedEmailProviders: ["resend"],
    allowedOutreachModes: ["manual_export"],
    supportedLanguages: ["en"],
    toneProfile: "direct_professional",
    outreachComplianceStrictness: "standard_b2b",
    dataResidencyPolicy: "standard_us_hosted",
    taxInvoicePolicy: "standard_self_serve",
    complianceReviewRequired: false,
    activationPolicy: "self_serve_allowed",
    allowedProductModules: shippedKernelModules,
    unavailableProductModules: futureEnterpriseModules,
    providerLimitations: [
      {
        provider: "manual",
        limitation: "support_led_exception",
        customerSafeMessage: "Manual invoice and wire transfer require support-led setup."
      },
      {
        provider: "paypal",
        limitation: "support_led_exception",
        customerSafeMessage: "PayPal is available only as a support-led billing exception."
      }
    ],
    customerSafeStatusMessage: "NoticeControl currently uses the global default market profile."
  },
  us: {
    marketId: "us",
    label: "United States profile",
    marketStatus: "planned",
    defaultCurrency: "USD",
    allowedPaymentProviders: ["paddle", "manual", "paypal"],
    allowedManualInvoicePolicy: "support_exception",
    allowedAiProviders: ["openai"],
    allowedOcrProviders: ["openai", "mock"],
    allowedEmailProviders: ["resend"],
    allowedOutreachModes: ["manual_export"],
    supportedLanguages: ["en"],
    toneProfile: "direct_professional",
    outreachComplianceStrictness: "standard_b2b",
    dataResidencyPolicy: "standard_us_hosted",
    taxInvoicePolicy: "standard_self_serve",
    complianceReviewRequired: false,
    activationPolicy: "support_led_only",
    allowedProductModules: shippedKernelModules,
    unavailableProductModules: futureEnterpriseModules,
    providerLimitations: [],
    customerSafeStatusMessage: "US-specific packaging is planned; current runtime remains on the global default profile."
  },
  eu: {
    marketId: "eu",
    label: "European Union profile",
    marketStatus: "planned",
    defaultCurrency: "EUR",
    allowedPaymentProviders: ["paddle", "manual", "paypal"],
    allowedManualInvoicePolicy: "support_exception",
    allowedAiProviders: ["openai"],
    allowedOcrProviders: ["openai", "mock"],
    allowedEmailProviders: ["resend"],
    allowedOutreachModes: ["manual_export"],
    supportedLanguages: ["en"],
    toneProfile: "formal_review_required",
    outreachComplianceStrictness: "review_required",
    dataResidencyPolicy: "standard_eu_review",
    taxInvoicePolicy: "support_led_invoice_review",
    complianceReviewRequired: false,
    activationPolicy: "support_led_only",
    allowedProductModules: shippedKernelModules,
    unavailableProductModules: futureEnterpriseModules,
    providerLimitations: [
      {
        provider: "data_residency",
        limitation: "requires_review",
        customerSafeMessage: "EU-specific data residency commitments require review before activation."
      }
    ],
    customerSafeStatusMessage: "EU-specific packaging is planned; current runtime remains on the global default profile."
  },
  manual_invoice_review: {
    marketId: "manual_invoice_review",
    label: "Manual invoice review profile",
    marketStatus: "planned",
    defaultCurrency: "USD",
    allowedPaymentProviders: ["manual"],
    allowedManualInvoicePolicy: "requires_review",
    allowedAiProviders: ["openai"],
    allowedOcrProviders: ["openai", "mock"],
    allowedEmailProviders: ["resend"],
    allowedOutreachModes: ["manual_export"],
    supportedLanguages: ["en"],
    toneProfile: "support_led_only",
    outreachComplianceStrictness: "review_required",
    dataResidencyPolicy: "future_review_required",
    taxInvoicePolicy: "support_led_invoice_review",
    complianceReviewRequired: true,
    activationPolicy: "support_led_only",
    allowedProductModules: shippedKernelModules,
    unavailableProductModules: futureEnterpriseModules,
    providerLimitations: [
      {
        provider: "manual",
        limitation: "requires_review",
        customerSafeMessage: "Manual invoice eligibility requires explicit support and billing review."
      }
    ],
    customerSafeStatusMessage: "Manual invoice availability is support-led and requires explicit review."
  },
  restricted_market_review: {
    marketId: "restricted_market_review",
    label: "Restricted market review profile",
    marketStatus: "restricted_review",
    defaultCurrency: "USD",
    allowedPaymentProviders: [],
    allowedManualInvoicePolicy: "requires_review",
    allowedAiProviders: [],
    allowedOcrProviders: ["none"],
    allowedEmailProviders: [],
    allowedOutreachModes: [],
    supportedLanguages: [],
    toneProfile: "support_led_only",
    outreachComplianceStrictness: "restricted",
    dataResidencyPolicy: "future_review_required",
    taxInvoicePolicy: "future_review_required",
    complianceReviewRequired: true,
    activationPolicy: "compliance_review_required",
    allowedProductModules: [],
    unavailableProductModules: [...shippedKernelModules, ...futureEnterpriseModules],
    providerLimitations: [
      {
        provider: "all",
        limitation: "compliance_review_required",
        customerSafeMessage: restrictedMarketMessage
      }
    ],
    customerSafeStatusMessage: restrictedMarketMessage
  }
} as const;

export const MARKET_PROFILE_IDS = Object.keys(MARKET_PROFILES) as MarketProfileId[];

const sensitiveDiagnosticValuePattern =
  /(raw[_\s-]?contract|ocr[_\s-]?output|payment[_\s-]?detail|sanctions[_\s-]?screening|legal[_\s-]?document|provider[_\s-]?payload|secret|token|password|card[_\s-]?number|bank[_\s-]?account|routing[_\s-]?number)/i;

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sensitiveDiagnosticValuePattern.test(value) ? "[redacted]" : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeDiagnosticValue);
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveDiagnosticValuePattern.test(key))
        .map(([key, nestedValue]) => [key, sanitizeDiagnosticValue(nestedValue)])
    );
  }

  return null;
}

export const MARKET_AUDIT_EVENT_CONTRACTS: Record<MarketAuditEventName, MarketAuditEventContract> = {
  "market.profile_selected": {
    eventName: "market.profile_selected",
    safeMetadataFields: ["organization_id", "actor_user_id", "market_id", "market_status", "reason_code"],
    forbiddenMetadataFields: ["payment_details", "legal_document", "sanctions_screening_details", "provider_payload", "secret", "token"],
    notes: "Future-safe evidence that a market profile was selected or evaluated."
  },
  "market.activation_requested": {
    eventName: "market.activation_requested",
    safeMetadataFields: ["organization_id", "actor_user_id", "market_id", "activation_policy", "reason_code"],
    forbiddenMetadataFields: ["payment_details", "legal_document", "sanctions_screening_details", "provider_payload", "secret", "token"],
    notes: "Future-safe evidence that activation was requested. It is not proof that restricted markets were approved."
  },
  "market.manual_invoice_review_requested": {
    eventName: "market.manual_invoice_review_requested",
    safeMetadataFields: ["organization_id", "actor_user_id", "market_id", "billing_provider", "reason_code"],
    forbiddenMetadataFields: ["payment_details", "invoice_payload", "provider_payload", "secret", "token"],
    notes: "Future-safe evidence for manual invoice review without payment details."
  },
  "market.provider_unavailable": {
    eventName: "market.provider_unavailable",
    safeMetadataFields: ["organization_id", "actor_user_id", "market_id", "provider", "provider_kind", "reason_code"],
    forbiddenMetadataFields: ["provider_payload", "payment_details", "secret", "token"],
    notes: "Future-safe provider-denial evidence with no provider payloads."
  },
  "market.compliance_review_required": {
    eventName: "market.compliance_review_required",
    safeMetadataFields: ["organization_id", "actor_user_id", "market_id", "market_status", "reason_code"],
    forbiddenMetadataFields: ["legal_document", "sanctions_screening_details", "provider_payload", "secret", "token"],
    notes: "Future-safe evidence that manual compliance/legal review is required."
  }
};

export function getMarketProfile(marketId: MarketProfileId | string | null | undefined): MarketProfile {
  if (!marketId) return MARKET_PROFILES.global;
  return MARKET_PROFILES[marketId as MarketProfileId] ?? MARKET_PROFILES.restricted_market_review;
}

function denied(profile: MarketProfile, reason: MarketCustomerSafeReasonCode, message: string): MarketPolicyDecision {
  return {
    allowed: false,
    reason,
    customerSafeMessage: message,
    requiresComplianceReview: profile.complianceReviewRequired,
    marketId: profile.marketId
  };
}

function allowed(profile: MarketProfile, message = "Allowed by the current market profile."): MarketPolicyDecision {
  return {
    allowed: true,
    reason: "allowed",
    customerSafeMessage: message,
    requiresComplianceReview: profile.complianceReviewRequired,
    marketId: profile.marketId
  };
}

function compatible(profile: MarketProfile, message: string): MarketCompatibilityDecision {
  return {
    compatible: true,
    reason: "compatible",
    customerSafeMessage: message,
    marketId: profile.marketId
  };
}

function incompatible(
  profile: MarketProfile,
  reason: MarketCustomerSafeReasonCode,
  message: string
): MarketCompatibilityDecision {
  return {
    compatible: false,
    reason,
    customerSafeMessage: message,
    marketId: profile.marketId
  };
}

function profileCanActivate(profile: MarketProfile) {
  if (profile.marketStatus === "unsupported") {
    return denied(profile, "unsupported_market", "This market is not supported.");
  }

  if (profile.marketStatus === "restricted_review" || profile.complianceReviewRequired) {
    return denied(profile, "compliance_review_required", profile.customerSafeStatusMessage);
  }

  if (profile.marketStatus !== "shipped") {
    return denied(profile, "market_not_shipped", "This market is planned or review-only and is not runtime-enabled.");
  }

  if (profile.activationPolicy !== "self_serve_allowed") {
    return denied(profile, "self_serve_unavailable", "This market requires support-led activation.");
  }

  return allowed(profile, "This market can use the current self-serve activation path.");
}

export function getAllowedPaymentProviders(marketId?: MarketProfileId | string | null) {
  return getMarketProfile(marketId).allowedPaymentProviders;
}

export function isPaymentProviderCompatibleWithMarket(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketPaymentProvider
): MarketCompatibilityDecision {
  const profile = getMarketProfile(marketId);

  if (!profile.allowedPaymentProviders.includes(provider)) {
    return incompatible(profile, "provider_unavailable", `${provider} is not compatible with this market profile.`);
  }

  return compatible(profile, `${provider} is compatible with this market profile.`);
}

export function isAiProviderCompatibleWithMarket(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketAiProvider
): MarketCompatibilityDecision {
  const profile = getMarketProfile(marketId);
  if (!profile.allowedAiProviders.includes(provider)) {
    return incompatible(profile, "provider_unavailable", `${provider} AI processing is not compatible with this market profile.`);
  }
  return compatible(profile, `${provider} AI processing is compatible with this market profile.`);
}

export function isOcrProviderCompatibleWithMarket(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketOcrProvider
): MarketCompatibilityDecision {
  const profile = getMarketProfile(marketId);
  if (!profile.allowedOcrProviders.includes(provider)) {
    return incompatible(profile, "provider_unavailable", `${provider} OCR processing is not compatible with this market profile.`);
  }
  return compatible(profile, `${provider} OCR processing is compatible with this market profile.`);
}

export function isProductModuleCompatibleWithMarket(
  marketId: MarketProfileId | string | null | undefined,
  moduleId: PlatformModuleId
): MarketCompatibilityDecision {
  const profile = getMarketProfile(marketId);
  if (profile.unavailableProductModules.includes(moduleId) || !profile.allowedProductModules.includes(moduleId)) {
    return incompatible(profile, "feature_unavailable", `${moduleId} is not compatible with this market profile.`);
  }
  return compatible(profile, `${moduleId} is compatible with this market profile.`);
}

function denyIfNotRuntimeEnabled(profile: MarketProfile) {
  const activation = profileCanActivate(profile);
  if (!activation.allowed) {
    return activation;
  }
  return null;
}

export function canUsePaymentProviderAtRuntime(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketPaymentProvider
): MarketPolicyDecision {
  const profile = getMarketProfile(marketId);
  const runtimeDenial = denyIfNotRuntimeEnabled(profile);
  if (runtimeDenial) return runtimeDenial;

  const compatibility = isPaymentProviderCompatibleWithMarket(profile.marketId, provider);
  if (!profile.allowedPaymentProviders.includes(provider)) {
    return denied(profile, compatibility.reason, compatibility.customerSafeMessage);
  }

  return allowed(profile, `${provider} is allowed at runtime by the shipped market profile.`);
}

export function canUsePaymentProvider(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketPaymentProvider
): MarketPolicyDecision {
  return canUsePaymentProviderAtRuntime(marketId, provider);
}

export function canUseManualInvoiceAtRuntime(marketId?: MarketProfileId | string | null): MarketPolicyDecision {
  const profile = getMarketProfile(marketId);
  const runtimeDenial = denyIfNotRuntimeEnabled(profile);
  if (runtimeDenial) return runtimeDenial;

  if (profile.allowedManualInvoicePolicy === "not_allowed") {
    return denied(profile, "manual_invoice_not_allowed", "Manual invoice is not available for this market profile.");
  }

  if (profile.allowedManualInvoicePolicy === "requires_review") {
    return denied(profile, "compliance_review_required", "Manual invoice requires explicit support and compliance review.");
  }

  return allowed(profile, "Manual invoice is available only as a support-led exception.");
}

export function canUseManualInvoice(marketId?: MarketProfileId | string | null): MarketPolicyDecision {
  return canUseManualInvoiceAtRuntime(marketId);
}

export function canUseAiProviderAtRuntime(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketAiProvider
): MarketPolicyDecision {
  const profile = getMarketProfile(marketId);
  const runtimeDenial = denyIfNotRuntimeEnabled(profile);
  if (runtimeDenial) return runtimeDenial;

  const compatibility = isAiProviderCompatibleWithMarket(profile.marketId, provider);
  if (!compatibility.compatible) {
    return denied(profile, compatibility.reason, compatibility.customerSafeMessage);
  }
  return allowed(profile, `${provider} AI processing is allowed at runtime by the shipped market profile.`);
}

export function canUseAiProvider(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketAiProvider
): MarketPolicyDecision {
  return canUseAiProviderAtRuntime(marketId, provider);
}

export function canUseOcrProviderAtRuntime(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketOcrProvider
): MarketPolicyDecision {
  const profile = getMarketProfile(marketId);
  const runtimeDenial = denyIfNotRuntimeEnabled(profile);
  if (runtimeDenial) return runtimeDenial;

  const compatibility = isOcrProviderCompatibleWithMarket(profile.marketId, provider);
  if (!compatibility.compatible) {
    return denied(profile, compatibility.reason, compatibility.customerSafeMessage);
  }
  return allowed(profile, `${provider} OCR processing is allowed at runtime by the shipped market profile.`);
}

export function canUseOcrProvider(
  marketId: MarketProfileId | string | null | undefined,
  provider: MarketOcrProvider
): MarketPolicyDecision {
  return canUseOcrProviderAtRuntime(marketId, provider);
}

export function canUseProductModuleAtRuntime(
  marketId: MarketProfileId | string | null | undefined,
  moduleId: PlatformModuleId
): MarketPolicyDecision {
  const profile = getMarketProfile(marketId);
  const runtimeDenial = denyIfNotRuntimeEnabled(profile);
  if (runtimeDenial) return runtimeDenial;

  const compatibility = isProductModuleCompatibleWithMarket(profile.marketId, moduleId);
  if (!compatibility.compatible) {
    return denied(profile, compatibility.reason, compatibility.customerSafeMessage);
  }
  return allowed(profile, `${moduleId} is available at runtime by the shipped market profile.`);
}

export function canUseProductModule(
  marketId: MarketProfileId | string | null | undefined,
  moduleId: PlatformModuleId
): MarketPolicyDecision {
  return canUseProductModuleAtRuntime(marketId, moduleId);
}

export function canSelfServeActivateMarket(marketId?: MarketProfileId | string | null): MarketPolicyDecision {
  return profileCanActivate(getMarketProfile(marketId));
}

export function buildMarketOnboardingWarning(marketId?: MarketProfileId | string | null) {
  const profile = getMarketProfile(marketId);
  const activation = canSelfServeActivateMarket(profile.marketId);
  return {
    marketId: profile.marketId,
    status: profile.marketStatus,
    requiresComplianceReview: profile.complianceReviewRequired,
    canSelfServeActivate: activation.allowed,
    customerSafeMessage: activation.allowed
      ? profile.customerSafeStatusMessage
      : activation.customerSafeMessage
  };
}

export function buildMarketDiagnostic(input: {
  marketId?: MarketProfileId | string | null;
  eventName: MarketAuditEventName;
  organizationId?: string | null;
  actorUserId?: string | null;
  provider?: string | null;
  providerKind?: "payment" | "ai" | "ocr" | "email" | "invoice" | null;
  reasonCode?: MarketCustomerSafeReasonCode | string | null;
  metadata?: Record<string, unknown>;
}) {
  const profile = getMarketProfile(input.marketId);
  const contract = MARKET_AUDIT_EVENT_CONTRACTS[input.eventName];
  const baseMetadata = {
    organization_id: input.organizationId ?? null,
    actor_user_id: input.actorUserId ?? null,
    market_id: profile.marketId,
    market_status: profile.marketStatus,
    billing_provider: input.providerKind === "payment" ? input.provider ?? null : null,
    provider: input.provider ?? null,
    provider_kind: input.providerKind ?? null,
    activation_policy: profile.activationPolicy,
    reason_code: input.reasonCode ?? (profile.complianceReviewRequired ? "compliance_review_required" : "allowed")
  };
  const safeMetadata = Object.fromEntries(
    Object.entries({ ...input.metadata, ...baseMetadata }).filter(([key]) =>
      contract.safeMetadataFields.includes(key)
    )
  );

  return {
    signalType: "market_profile_diagnostic",
    eventName: input.eventName,
    marketId: profile.marketId,
    requiresComplianceReview: profile.complianceReviewRequired,
    safeMetadata: sanitizeDiagnosticValue(safeMetadata) as Record<string, unknown>
  };
}
