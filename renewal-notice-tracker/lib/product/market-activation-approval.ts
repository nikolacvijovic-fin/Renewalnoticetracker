import type { PlatformModuleId } from "@/lib/product/platform-modules";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import {
  MARKET_PROFILES,
  type MarketAiProvider,
  type MarketAuditEventName,
  type MarketCustomerSafeReasonCode,
  type MarketEmailProvider,
  type MarketManualInvoicePolicy,
  type MarketOcrProvider,
  type MarketPaymentProvider,
  type MarketProfile,
  type MarketProfileId,
  canSelfServeActivateMarket,
  canUseManualInvoiceAtRuntime,
  canUsePaymentProviderAtRuntime,
  canUseAiProviderAtRuntime,
  canUseOcrProviderAtRuntime,
  canUseProductModuleAtRuntime,
  getMarketProfile,
  isAiProviderCompatibleWithMarket,
  isOcrProviderCompatibleWithMarket,
  isPaymentProviderCompatibleWithMarket,
  isProductModuleCompatibleWithMarket
} from "@/lib/product/market-profiles";

export type MarketActivationApprovalStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "revoked";

export type MarketActivationReviewStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "rejected"
  | "not_required";

export type MarketActivationReviewArea =
  | "legal"
  | "sanctions_screening"
  | "payment_rail"
  | "provider_stack"
  | "data_residency"
  | "tax_invoice"
  | "support_incident";

export type MarketActivationApprovalDecision = {
  allowed: boolean;
  reason: MarketCustomerSafeReasonCode | "approval_missing" | "approval_inactive" | "approval_scope_mismatch" | "approval_grant_missing" | "future_module_forbidden";
  customerSafeMessage: string;
  marketId: MarketProfileId | string;
  organizationId: string | null;
  approvalStatus: MarketActivationApprovalStatus | "not_required" | "missing";
  requiresComplianceReview: boolean;
};

export type MarketActivationProviderGrant<TProvider extends string = string> = {
  provider: TProvider;
  providerKind: "payment" | "ai" | "ocr" | "email";
  granted: boolean;
};

export type MarketActivationPaymentGrant = MarketActivationProviderGrant<MarketPaymentProvider>;
export type MarketActivationModuleGrant = {
  moduleId: PlatformModuleId;
  granted: boolean;
};

export type MarketActivationExpiryPolicy = {
  expiresAt: string | null;
  renewalRequired: boolean;
};

export type MarketActivationManualInvoicePolicy = MarketManualInvoicePolicy | "approved";

export type MarketActivationApproval = {
  marketId: MarketProfileId | string;
  organizationId: string;
  approvalStatus: MarketActivationApprovalStatus;
  legalReviewStatus: MarketActivationReviewStatus;
  sanctionsScreeningStatus: MarketActivationReviewStatus;
  paymentRailReviewStatus: MarketActivationReviewStatus;
  providerStackReviewStatus: MarketActivationReviewStatus;
  dataResidencyReviewStatus: MarketActivationReviewStatus;
  taxInvoiceReviewStatus: MarketActivationReviewStatus;
  supportIncidentReviewStatus: MarketActivationReviewStatus;
  approvedPaymentProviders: readonly MarketPaymentProvider[];
  approvedAiProviders: readonly MarketAiProvider[];
  approvedOcrProviders: readonly MarketOcrProvider[];
  approvedEmailProviders: readonly MarketEmailProvider[];
  approvedProductModules: readonly PlatformModuleId[];
  allowedCurrencies: readonly string[];
  approvedManualInvoicePolicy: MarketActivationManualInvoicePolicy;
  approvedAt: string | null;
  expiresAt: string | null;
  reviewedBy: string | null;
  customerSafeReason: string;
};

export type MarketActivationAuditEventName =
  | "market.activation_review_requested"
  | "market.activation_approved"
  | "market.activation_rejected"
  | "market.activation_revoked"
  | "market.activation_expired"
  | "market.activation_provider_granted"
  | "market.activation_module_granted";

export type MarketActivationAuditContract = {
  eventName: MarketActivationAuditEventName;
  safeMetadataFields: readonly string[];
  forbiddenMetadataFields: readonly string[];
  notes: string;
};

type ApprovalDecisionInput = {
  marketId: MarketProfileId | string;
  organizationId?: string | null;
  approval?: MarketActivationApproval | null;
  now?: Date;
};

type ProviderApprovalInput<TProvider extends string> = ApprovalDecisionInput & {
  provider: TProvider;
};

type ModuleApprovalInput = ApprovalDecisionInput & {
  moduleId: PlatformModuleId;
};

const activeReviewStatuses = new Set<MarketActivationReviewStatus>(["approved", "not_required"]);

const activationSafeMetadataFields = [
  "organization_id",
  "market_id",
  "approval_status",
  "review_area",
  "provider_kind",
  "provider_name",
  "module_id",
  "reason_code"
] as const;

const activationForbiddenMetadataFields = [
  "legal_document",
  "sanctions_screening_details",
  "payment_details",
  "bank_details",
  "provider_payload",
  "raw_customer_legal_data",
  "secret",
  "token",
  "password"
] as const;

const sensitiveActivationMetadataPattern =
  /(legal[_\s-]?document|sanctions[_\s-]?screening|payment[_\s-]?detail|bank[_\s-]?detail|provider[_\s-]?payload|raw[_\s-]?customer[_\s-]?legal|secret|token|password|card[_\s-]?number|routing[_\s-]?number)/i;

export const MARKET_ACTIVATION_AUDIT_EVENT_CONTRACTS: Record<
  MarketActivationAuditEventName,
  MarketActivationAuditContract
> = {
  "market.activation_review_requested": {
    eventName: "market.activation_review_requested",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a market activation review was requested."
  },
  "market.activation_approved": {
    eventName: "market.activation_approved",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a market activation approval was granted."
  },
  "market.activation_rejected": {
    eventName: "market.activation_rejected",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a market activation approval was rejected."
  },
  "market.activation_revoked": {
    eventName: "market.activation_revoked",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a market activation approval was revoked."
  },
  "market.activation_expired": {
    eventName: "market.activation_expired",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a market activation approval expired."
  },
  "market.activation_provider_granted": {
    eventName: "market.activation_provider_granted",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a provider grant was added to an approval."
  },
  "market.activation_module_granted": {
    eventName: "market.activation_module_granted",
    safeMetadataFields: activationSafeMetadataFields,
    forbiddenMetadataFields: activationForbiddenMetadataFields,
    notes: "Future-safe evidence that a module grant was added to an approval."
  }
};

function allowed(
  input: ApprovalDecisionInput,
  message: string,
  status: MarketActivationApprovalStatus | "not_required" = input.approval?.approvalStatus ?? "not_required"
): MarketActivationApprovalDecision {
  return {
    allowed: true,
    reason: "allowed",
    customerSafeMessage: message,
    marketId: input.marketId,
    organizationId: input.organizationId ?? input.approval?.organizationId ?? null,
    approvalStatus: status,
    requiresComplianceReview: getMarketProfile(input.marketId).complianceReviewRequired
  };
}

function denied(
  input: ApprovalDecisionInput,
  reason: MarketActivationApprovalDecision["reason"],
  message: string,
  status: MarketActivationApprovalStatus | "not_required" | "missing" = input.approval?.approvalStatus ?? "missing"
): MarketActivationApprovalDecision {
  return {
    allowed: false,
    reason,
    customerSafeMessage: message,
    marketId: input.marketId,
    organizationId: input.organizationId ?? input.approval?.organizationId ?? null,
    approvalStatus: status,
    requiresComplianceReview: getMarketProfile(input.marketId).complianceReviewRequired
  };
}

function isKnownMarketId(marketId: string): marketId is MarketProfileId {
  return marketId in MARKET_PROFILES;
}

function getApprovalMarketProfile(marketId: string): MarketProfile | null {
  return isKnownMarketId(marketId) ? MARKET_PROFILES[marketId] : null;
}

function approvalIsExpired(approval: MarketActivationApproval, now = new Date()) {
  return Boolean(approval.expiresAt && new Date(approval.expiresAt).getTime() <= now.getTime());
}

function reviewStatusesAreComplete(approval: MarketActivationApproval) {
  return [
    approval.legalReviewStatus,
    approval.sanctionsScreeningStatus,
    approval.paymentRailReviewStatus,
    approval.providerStackReviewStatus,
    approval.dataResidencyReviewStatus,
    approval.taxInvoiceReviewStatus,
    approval.supportIncidentReviewStatus
  ].every((status) => activeReviewStatuses.has(status));
}

function approvalCanAffectRuntime(input: ApprovalDecisionInput): MarketActivationApprovalDecision | null {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) {
    return denied(input, "unsupported_market", "Unknown or unsupported market approvals cannot enable runtime access.");
  }

  if (profile.marketStatus === "unsupported") {
    return denied(input, "unsupported_market", "Unsupported markets cannot be enabled by approval.");
  }

  const globalRuntime = canSelfServeActivateMarket(profile.marketId);
  if (globalRuntime.allowed) {
    return allowed(input, "The shipped global/default market does not require market activation approval.");
  }

  const approval = input.approval;
  if (!approval) {
    return denied(input, "approval_missing", "This market requires explicit organization-specific activation approval.");
  }

  if (approval.marketId !== profile.marketId || (input.organizationId && approval.organizationId !== input.organizationId)) {
    return denied(input, "approval_scope_mismatch", "Market activation approval does not match this organization and market.");
  }

  if (approval.approvalStatus !== "approved" || !approval.approvedAt) {
    return denied(input, "approval_inactive", "Market activation approval is not active.");
  }

  if (approvalIsExpired(approval, input.now)) {
    return denied(input, "approval_inactive", "Market activation approval is expired.", "expired");
  }

  if ((profile.complianceReviewRequired || profile.marketStatus === "restricted_review") && !reviewStatusesAreComplete(approval)) {
    return denied(input, "compliance_review_required", "Required legal, compliance, provider, data, tax, and support reviews are incomplete.");
  }

  return null;
}

function moduleCanBeGranted(moduleId: PlatformModuleId) {
  return PLATFORM_MODULES[moduleId].status === "shipped";
}

function fromRuntimeDecision(
  input: ApprovalDecisionInput,
  decision: { allowed: boolean; reason: MarketCustomerSafeReasonCode; customerSafeMessage: string; requiresComplianceReview: boolean }
): MarketActivationApprovalDecision {
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    customerSafeMessage: decision.customerSafeMessage,
    marketId: input.marketId,
    organizationId: input.organizationId ?? input.approval?.organizationId ?? null,
    approvalStatus: "not_required",
    requiresComplianceReview: decision.requiresComplianceReview
  };
}

export function canActivateMarketWithApproval(input: ApprovalDecisionInput): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) {
    return denied(input, "unsupported_market", "Unknown or unsupported markets cannot activate.");
  }

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision) return runtimeDecision;

  return allowed({ ...input, marketId: profile.marketId }, "Market activation approval is active for this organization.", input.approval?.approvalStatus ?? "approved");
}

export function canUsePaymentProviderWithApproval(
  input: ProviderApprovalInput<MarketPaymentProvider>
): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use payment providers.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    return fromRuntimeDecision(input, canUsePaymentProviderAtRuntime(profile.marketId, input.provider));
  }
  if (runtimeDecision) return runtimeDecision;

  const compatibility = isPaymentProviderCompatibleWithMarket(profile.marketId, input.provider);
  if (!compatibility.compatible) {
    return denied(input, "provider_unavailable", compatibility.customerSafeMessage);
  }
  if (!input.approval?.approvedPaymentProviders.includes(input.provider)) {
    return denied(input, "approval_grant_missing", "Payment provider is not explicitly granted by this approval.");
  }

  return allowed(input, "Payment provider is granted by active market approval.", input.approval.approvalStatus);
}

export function canUseAiProviderWithApproval(
  input: ProviderApprovalInput<MarketAiProvider>
): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use AI providers.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    return fromRuntimeDecision(input, canUseAiProviderAtRuntime(profile.marketId, input.provider));
  }
  if (runtimeDecision) return runtimeDecision;

  const compatibility = isAiProviderCompatibleWithMarket(profile.marketId, input.provider);
  if (!compatibility.compatible) {
    return denied(input, "provider_unavailable", compatibility.customerSafeMessage);
  }
  if (!input.approval?.approvedAiProviders.includes(input.provider)) {
    return denied(input, "approval_grant_missing", "AI provider is not explicitly granted by this approval.");
  }

  return allowed(input, "AI provider is granted by active market approval.", input.approval.approvalStatus);
}

export function canUseOcrProviderWithApproval(
  input: ProviderApprovalInput<MarketOcrProvider>
): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use OCR providers.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    return fromRuntimeDecision(input, canUseOcrProviderAtRuntime(profile.marketId, input.provider));
  }
  if (runtimeDecision) return runtimeDecision;

  const compatibility = isOcrProviderCompatibleWithMarket(profile.marketId, input.provider);
  if (!compatibility.compatible) {
    return denied(input, "provider_unavailable", compatibility.customerSafeMessage);
  }
  if (!input.approval?.approvedOcrProviders.includes(input.provider)) {
    return denied(input, "approval_grant_missing", "OCR provider is not explicitly granted by this approval.");
  }

  return allowed(input, "OCR provider is granted by active market approval.", input.approval.approvalStatus);
}

export function canUseEmailProviderWithApproval(
  input: ProviderApprovalInput<MarketEmailProvider>
): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use email providers.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    if (!profile.allowedEmailProviders.includes(input.provider)) {
      return denied(input, "provider_unavailable", "Email provider is not compatible with this market profile.", "not_required");
    }
    return allowed(input, "Email provider is allowed at runtime by the shipped market profile.", "not_required");
  }
  if (runtimeDecision) return runtimeDecision;

  if (!profile.allowedEmailProviders.includes(input.provider)) {
    return denied(input, "provider_unavailable", "Email provider is not compatible with this market profile.");
  }
  if (!input.approval?.approvedEmailProviders.includes(input.provider)) {
    return denied(input, "approval_grant_missing", "Email provider is not explicitly granted by this approval.");
  }

  return allowed(input, "Email provider is granted by active market approval.", input.approval.approvalStatus);
}

export function canUseProductModuleWithApproval(input: ModuleApprovalInput): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use product modules.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    return fromRuntimeDecision(input, canUseProductModuleAtRuntime(profile.marketId, input.moduleId));
  }
  if (runtimeDecision) return runtimeDecision;

  if (!moduleCanBeGranted(input.moduleId)) {
    return denied(input, "future_module_forbidden", "Only currently shipped modules can be granted by market approval.");
  }

  const compatibility = isProductModuleCompatibleWithMarket(profile.marketId, input.moduleId);
  if (!compatibility.compatible) {
    return denied(input, "feature_unavailable", compatibility.customerSafeMessage);
  }
  if (!input.approval?.approvedProductModules.includes(input.moduleId)) {
    return denied(input, "approval_grant_missing", "Product module is not explicitly granted by this approval.");
  }

  return allowed(input, "Product module is granted by active market approval.", input.approval.approvalStatus);
}

export function canUseManualInvoiceWithApproval(input: ApprovalDecisionInput): MarketActivationApprovalDecision {
  const profile = getApprovalMarketProfile(input.marketId);
  if (!profile) return denied(input, "unsupported_market", "Unknown or unsupported markets cannot use manual invoice.");

  const runtimeDecision = approvalCanAffectRuntime({ ...input, marketId: profile.marketId });
  if (runtimeDecision?.allowed && profile.marketId === "global") {
    return fromRuntimeDecision(input, canUseManualInvoiceAtRuntime(profile.marketId));
  }
  if (runtimeDecision) return runtimeDecision;

  if (profile.allowedManualInvoicePolicy === "not_allowed") {
    return denied(input, "manual_invoice_not_allowed", "Manual invoice is not compatible with this market profile.");
  }
  if (input.approval?.approvedManualInvoicePolicy !== "approved") {
    return denied(input, "approval_grant_missing", "Manual invoice requires an explicit approved grant.");
  }

  return allowed(input, "Manual invoice is granted by active market approval.", input.approval.approvalStatus);
}

function sanitizeActivationMetadataValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sensitiveActivationMetadataPattern.test(value) ? "[redacted]" : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitizeActivationMetadataValue);
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveActivationMetadataPattern.test(key))
        .map(([key, nestedValue]) => [key, sanitizeActivationMetadataValue(nestedValue)])
    );
  }
  return null;
}

export function buildMarketActivationDiagnostic(input: {
  eventName: MarketActivationAuditEventName | MarketAuditEventName;
  organizationId?: string | null;
  marketId?: MarketProfileId | string | null;
  approvalStatus?: MarketActivationApprovalStatus | null;
  reviewArea?: MarketActivationReviewArea | null;
  providerKind?: "payment" | "ai" | "ocr" | "email" | "invoice" | null;
  providerName?: string | null;
  moduleId?: PlatformModuleId | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const contract =
    MARKET_ACTIVATION_AUDIT_EVENT_CONTRACTS[input.eventName as MarketActivationAuditEventName];
  const allowedFields = contract?.safeMetadataFields ?? activationSafeMetadataFields;
  const safeMetadata = Object.fromEntries(
    Object.entries({
      ...input.metadata,
      organization_id: input.organizationId ?? null,
      market_id: input.marketId ?? null,
      approval_status: input.approvalStatus ?? null,
      review_area: input.reviewArea ?? null,
      provider_kind: input.providerKind ?? null,
      provider_name: input.providerName ?? null,
      module_id: input.moduleId ?? null,
      reason_code: input.reasonCode ?? null
    }).filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        allowedFields.includes(key as (typeof activationSafeMetadataFields)[number])
    )
  );

  return {
    signalType: "market_activation_diagnostic",
    eventName: input.eventName,
    safeMetadata: sanitizeActivationMetadataValue(safeMetadata) as Record<string, unknown>
  };
}
