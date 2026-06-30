import { describe, expect, it } from "vitest";
import {
  MARKET_ACTIVATION_AUDIT_EVENT_CONTRACTS,
  type MarketActivationApproval,
  buildMarketActivationDiagnostic,
  canActivateMarketWithApproval,
  canUseAiProviderWithApproval,
  canUseEmailProviderWithApproval,
  canUseManualInvoiceWithApproval,
  canUseOcrProviderWithApproval,
  canUsePaymentProviderWithApproval,
  canUseProductModuleWithApproval
} from "@/lib/product/market-activation-approval";
import { MARKET_PROFILE_IDS, MARKET_PROFILES } from "@/lib/product/market-profiles";

function activeApproval(
  overrides: Partial<MarketActivationApproval> = {}
): MarketActivationApproval {
  return {
    marketId: "us",
    organizationId: "org_123",
    approvalStatus: "approved",
    legalReviewStatus: "approved",
    sanctionsScreeningStatus: "approved",
    paymentRailReviewStatus: "approved",
    providerStackReviewStatus: "approved",
    dataResidencyReviewStatus: "approved",
    taxInvoiceReviewStatus: "approved",
    supportIncidentReviewStatus: "approved",
    approvedPaymentProviders: ["paddle"],
    approvedAiProviders: ["openai"],
    approvedOcrProviders: ["openai"],
    approvedEmailProviders: ["resend"],
    approvedProductModules: ["core_renewal_control_kernel"],
    allowedCurrencies: ["USD"],
    approvedManualInvoicePolicy: "not_allowed",
    approvedAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z",
    reviewedBy: "reviewer_123",
    customerSafeReason: "Approved for future market activation testing.",
    ...overrides
  };
}

const now = new Date("2026-06-30T00:00:00.000Z");

describe("market activation approval runtime boundary", () => {
  it("keeps global/default runtime behavior available without market activation approval", () => {
    expect(canActivateMarketWithApproval({ marketId: "global", organizationId: "org_123" })).toMatchObject({
      allowed: true,
      approvalStatus: "not_required"
    });
    expect(
      canUsePaymentProviderWithApproval({
        marketId: "global",
        organizationId: "org_123",
        provider: "paddle"
      })
    ).toMatchObject({
      allowed: true,
      approvalStatus: "not_required"
    });
    expect(
      canUseProductModuleWithApproval({
        marketId: "global",
        organizationId: "org_123",
        moduleId: "core_renewal_control_kernel"
      })
    ).toMatchObject({
      allowed: true,
      approvalStatus: "not_required"
    });
  });

  it("blocks planned markets without explicit active organization-scoped approval", () => {
    expect(canActivateMarketWithApproval({ marketId: "us", organizationId: "org_123" })).toMatchObject({
      allowed: false,
      reason: "approval_missing"
    });
    expect(
      canActivateMarketWithApproval({
        marketId: "us",
        organizationId: "org_123",
        approval: activeApproval({ organizationId: "other_org" }),
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "approval_scope_mismatch"
    });
  });

  it("allows planned markets only with active approval and explicit compatible grants", () => {
    const approval = activeApproval();

    expect(canActivateMarketWithApproval({ marketId: "us", organizationId: "org_123", approval, now })).toMatchObject({
      allowed: true,
      approvalStatus: "approved"
    });
    expect(
      canUsePaymentProviderWithApproval({
        marketId: "us",
        organizationId: "org_123",
        provider: "paddle",
        approval,
        now
      })
    ).toMatchObject({
      allowed: true,
      reason: "allowed"
    });
    expect(
      canUseAiProviderWithApproval({
        marketId: "us",
        organizationId: "org_123",
        provider: "openai",
        approval,
        now
      })
    ).toMatchObject({ allowed: true });
    expect(
      canUseOcrProviderWithApproval({
        marketId: "us",
        organizationId: "org_123",
        provider: "openai",
        approval,
        now
      })
    ).toMatchObject({ allowed: true });
    expect(
      canUseEmailProviderWithApproval({
        marketId: "us",
        organizationId: "org_123",
        provider: "resend",
        approval,
        now
      })
    ).toMatchObject({ allowed: true });
    expect(
      canUseProductModuleWithApproval({
        marketId: "us",
        organizationId: "org_123",
        moduleId: "core_renewal_control_kernel",
        approval,
        now
      })
    ).toMatchObject({ allowed: true });
  });

  it("denies inactive, expired, revoked, and rejected approvals", () => {
    for (const approvalStatus of ["draft", "pending_review", "rejected", "revoked"] as const) {
      expect(
        canActivateMarketWithApproval({
          marketId: "us",
          organizationId: "org_123",
          approval: activeApproval({ approvalStatus }),
          now
        })
      ).toMatchObject({
        allowed: false,
        reason: "approval_inactive",
        approvalStatus
      });
    }

    expect(
      canActivateMarketWithApproval({
        marketId: "us",
        organizationId: "org_123",
        approval: activeApproval({ expiresAt: "2026-01-01T00:00:00.000Z" }),
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "approval_inactive",
      approvalStatus: "expired"
    });
  });

  it("does not let approvals grant incompatible providers or future/excluded modules", () => {
    const approval = activeApproval({
      approvedPaymentProviders: ["stripe"],
      approvedProductModules: ["enterprise_integrations", "full_clm_expansion"]
    });

    expect(
      canUsePaymentProviderWithApproval({
        marketId: "us",
        organizationId: "org_123",
        provider: "stripe",
        approval,
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "provider_unavailable"
    });
    expect(
      canUseProductModuleWithApproval({
        marketId: "us",
        organizationId: "org_123",
        moduleId: "enterprise_integrations",
        approval,
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "future_module_forbidden"
    });
    expect(
      canUseProductModuleWithApproval({
        marketId: "us",
        organizationId: "org_123",
        moduleId: "full_clm_expansion",
        approval,
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "future_module_forbidden"
    });
  });

  it("requires explicit manual invoice approval for review markets", () => {
    expect(
      canUseManualInvoiceWithApproval({
        marketId: "manual_invoice_review",
        organizationId: "org_123",
        approval: activeApproval({
          marketId: "manual_invoice_review",
          approvedPaymentProviders: ["manual"],
          approvedManualInvoicePolicy: "support_exception"
        }),
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "approval_grant_missing"
    });

    expect(
      canUseManualInvoiceWithApproval({
        marketId: "manual_invoice_review",
        organizationId: "org_123",
        approval: activeApproval({
          marketId: "manual_invoice_review",
          approvedPaymentProviders: ["manual"],
          approvedManualInvoicePolicy: "approved"
        }),
        now
      })
    ).toMatchObject({
      allowed: true,
      reason: "allowed"
    });
  });

  it("keeps restricted review and unsupported markets fail-closed", () => {
    const incompleteRestrictedApproval = activeApproval({
      marketId: "restricted_market_review",
      legalReviewStatus: "pending",
      approvedPaymentProviders: ["paddle"],
      approvedProductModules: ["core_renewal_control_kernel"]
    });
    const completeRestrictedApproval = activeApproval({
      marketId: "restricted_market_review",
      approvedPaymentProviders: ["paddle"],
      approvedProductModules: ["core_renewal_control_kernel"]
    });

    expect(
      canActivateMarketWithApproval({
        marketId: "restricted_market_review",
        organizationId: "org_123",
        approval: incompleteRestrictedApproval,
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(
      canUsePaymentProviderWithApproval({
        marketId: "restricted_market_review",
        organizationId: "org_123",
        provider: "paddle",
        approval: completeRestrictedApproval,
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "provider_unavailable"
    });
    expect(
      canActivateMarketWithApproval({
        marketId: "unknown_market",
        organizationId: "org_123",
        approval: activeApproval({ marketId: "unknown_market" }),
        now
      })
    ).toMatchObject({
      allowed: false,
      reason: "unsupported_market"
    });
  });

  it("keeps diagnostics allowlisted and free of sensitive legal/payment/provider data", () => {
    const diagnostic = buildMarketActivationDiagnostic({
      eventName: "market.activation_provider_granted",
      organizationId: "org_123",
      marketId: "us",
      approvalStatus: "approved",
      providerKind: "payment",
      providerName: "paddle",
      reasonCode: "allowed",
      metadata: {
        payment_details: "card_number=4111111111111111",
        legal_document: "LEGAL_DOCUMENT_SHOULD_NOT_SURVIVE",
        sanctions_screening_details: "SANCTIONS_SCREENING_SHOULD_NOT_SURVIVE",
        provider_payload: "PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
        token: "TOKEN_SHOULD_NOT_SURVIVE",
        provider_name: "provider_payload should not survive"
      }
    });
    const rendered = JSON.stringify(diagnostic);

    expect(diagnostic.safeMetadata).toEqual({
      organization_id: "org_123",
      market_id: "us",
      approval_status: "approved",
      provider_kind: "payment",
      provider_name: "paddle",
      reason_code: "allowed"
    });
    for (const forbidden of [
      "card_number",
      "LEGAL_DOCUMENT_SHOULD_NOT_SURVIVE",
      "SANCTIONS_SCREENING_SHOULD_NOT_SURVIVE",
      "PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
      "TOKEN_SHOULD_NOT_SURVIVE"
    ]) {
      expect(rendered).not.toContain(forbidden);
    }

    for (const contract of Object.values(MARKET_ACTIVATION_AUDIT_EVENT_CONTRACTS)) {
      expect(contract.forbiddenMetadataFields).toEqual(
        expect.arrayContaining(["legal_document", "sanctions_screening_details", "provider_payload", "secret", "token"])
      );
    }
  });

  it("does not add country-specific restricted-market runtime profiles or shipped restricted markets", () => {
    expect(MARKET_PROFILE_IDS).not.toContain("russia");
    for (const profile of Object.values(MARKET_PROFILES)) {
      if (profile.marketStatus === "restricted_review" || profile.marketStatus === "unsupported") {
        expect(profile.marketStatus).not.toBe("shipped");
        expect(profile.activationPolicy).not.toBe("self_serve_allowed");
      }
    }
  });
});
