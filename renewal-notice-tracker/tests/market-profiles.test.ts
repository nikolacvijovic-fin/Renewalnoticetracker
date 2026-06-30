import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MARKET_AUDIT_EVENT_CONTRACTS,
  MARKET_PROFILE_IDS,
  MARKET_PROFILES,
  buildMarketDiagnostic,
  buildMarketOnboardingWarning,
  canSelfServeActivateMarket,
  canUseAiProvider,
  canUseAiProviderAtRuntime,
  canUseManualInvoice,
  canUseManualInvoiceAtRuntime,
  canUseOcrProvider,
  canUseOcrProviderAtRuntime,
  canUsePaymentProvider,
  canUsePaymentProviderAtRuntime,
  canUseProductModule,
  canUseProductModuleAtRuntime,
  getAllowedPaymentProviders,
  getMarketProfile,
  isAiProviderCompatibleWithMarket,
  isOcrProviderCompatibleWithMarket,
  isPaymentProviderCompatibleWithMarket,
  isProductModuleCompatibleWithMarket
} from "@/lib/product/market-profiles";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

const forbiddenDiagnosticMarkers = [
  "raw_contract_text",
  "OCR_OUTPUT_SHOULD_NOT_SURVIVE",
  "payment_details",
  "sanctions_screening_details",
  "provider_payload",
  "SECRET_SHOULD_NOT_SURVIVE",
  "TOKEN_SHOULD_NOT_SURVIVE",
  "card_number"
];

describe("market profile provider policy boundary", () => {
  it("keeps global as the only shipped default market profile", () => {
    expect(getMarketProfile(null).marketId).toBe("global");
    expect(MARKET_PROFILES.global.marketStatus).toBe("shipped");
    expect(canSelfServeActivateMarket("global")).toMatchObject({
      allowed: true,
      reason: "allowed",
      requiresComplianceReview: false
    });

    const shippedProfiles = MARKET_PROFILE_IDS.filter(
      (marketId) => MARKET_PROFILES[marketId].marketStatus === "shipped"
    );
    expect(shippedProfiles).toEqual(["global"]);
    expect(MARKET_PROFILE_IDS).not.toContain("russia");
  });

  it("keeps restricted-review markets out of self-serve activation and provider access", () => {
    const activation = canSelfServeActivateMarket("restricted_market_review");

    expect(MARKET_PROFILES.restricted_market_review.marketStatus).toBe("restricted_review");
    expect(activation).toMatchObject({
      allowed: false,
      reason: "compliance_review_required",
      requiresComplianceReview: true
    });
    expect(canUsePaymentProvider("restricted_market_review", "paddle")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(canUseAiProvider("restricted_market_review", "openai")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(canUseOcrProvider("restricted_market_review", "openai")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(MARKET_PROFILES.restricted_market_review.allowedEmailProviders).toEqual([]);
    expect(canUseProductModule("restricted_market_review", "core_renewal_control_kernel")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(getMarketProfile("unknown-market").marketId).toBe("restricted_market_review");
  });

  it("preserves current global provider policy without changing runtime billing behavior", () => {
    expect(getAllowedPaymentProviders("global")).toEqual(["paddle", "manual", "paypal"]);
    expect(canUsePaymentProvider("global", "paddle")).toMatchObject({
      allowed: true,
      reason: "allowed"
    });
    expect(canUsePaymentProviderAtRuntime("global", "paddle")).toMatchObject({
      allowed: true,
      reason: "allowed"
    });
    expect(canUseManualInvoice("global")).toMatchObject({
      allowed: true,
      reason: "allowed",
      customerSafeMessage: expect.stringContaining("support-led exception")
    });
    expect(canUseManualInvoice("manual_invoice_review")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(canUseManualInvoiceAtRuntime("manual_invoice_review")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
  });

  it("separates future compatibility from current runtime permission for planned markets", () => {
    for (const marketId of ["us", "eu"] as const) {
      expect(isPaymentProviderCompatibleWithMarket(marketId, "paddle")).toMatchObject({
        compatible: true,
        reason: "compatible"
      });
      expect(isAiProviderCompatibleWithMarket(marketId, "openai")).toMatchObject({
        compatible: true,
        reason: "compatible"
      });
      expect(isOcrProviderCompatibleWithMarket(marketId, "openai")).toMatchObject({
        compatible: true,
        reason: "compatible"
      });
      expect(isProductModuleCompatibleWithMarket(marketId, "core_renewal_control_kernel")).toMatchObject({
        compatible: true,
        reason: "compatible"
      });

      expect(canUsePaymentProviderAtRuntime(marketId, "paddle")).toMatchObject({
        allowed: false,
        reason: "market_not_shipped"
      });
      expect(canUseAiProviderAtRuntime(marketId, "openai")).toMatchObject({
        allowed: false,
        reason: "market_not_shipped"
      });
      expect(canUseOcrProviderAtRuntime(marketId, "openai")).toMatchObject({
        allowed: false,
        reason: "market_not_shipped"
      });
      expect(canUseProductModuleAtRuntime(marketId, "core_renewal_control_kernel")).toMatchObject({
        allowed: false,
        reason: "market_not_shipped"
      });
    }
  });

  it("gates product modules by market profile without promoting future modules", () => {
    expect(canUseProductModule("global", "core_renewal_control_kernel")).toMatchObject({
      allowed: true,
      reason: "allowed"
    });
    expect(canUseProductModule("global", "enterprise_integrations")).toMatchObject({
      allowed: false,
      reason: "feature_unavailable"
    });
    expect(canUseProductModule("restricted_market_review", "core_renewal_control_kernel")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });

    for (const moduleId of MARKET_PROFILES.global.allowedProductModules) {
      expect(PLATFORM_MODULES[moduleId].status, moduleId).toBe("shipped");
    }
  });

  it("builds onboarding warnings without leaking unsupported-market availability", () => {
    expect(buildMarketOnboardingWarning("global")).toMatchObject({
      marketId: "global",
      status: "shipped",
      canSelfServeActivate: true,
      requiresComplianceReview: false
    });
    expect(buildMarketOnboardingWarning("restricted_market_review")).toMatchObject({
      marketId: "restricted_market_review",
      status: "restricted_review",
      canSelfServeActivate: false,
      requiresComplianceReview: true
    });
  });

  it("keeps market diagnostics allowlisted and free of sensitive customer/legal/payment data", () => {
    const diagnostic = buildMarketDiagnostic({
      eventName: "market.provider_unavailable",
      marketId: "restricted_market_review",
      organizationId: "org_123",
      actorUserId: "user_123",
      provider: "paddle",
      providerKind: "payment",
      reasonCode: "compliance_review_required",
      metadata: {
        payment_details: "card_number=4111111111111111",
        legal_document: "raw_contract_text",
        sanctions_screening_details: "SECRET_SHOULD_NOT_SURVIVE",
        provider_payload: "TOKEN_SHOULD_NOT_SURVIVE",
        provider: "provider_payload should not survive",
        nested: {
          ocr_output: "OCR_OUTPUT_SHOULD_NOT_SURVIVE"
        }
      }
    });
    const rendered = JSON.stringify(diagnostic);

    expect(diagnostic.safeMetadata).toEqual({
      organization_id: "org_123",
      actor_user_id: "user_123",
      market_id: "restricted_market_review",
      provider: "paddle",
      provider_kind: "payment",
      reason_code: "compliance_review_required"
    });
    for (const marker of forbiddenDiagnosticMarkers) {
      expect(rendered).not.toContain(marker);
    }

    for (const contract of Object.values(MARKET_AUDIT_EVENT_CONTRACTS)) {
      expect(contract.forbiddenMetadataFields).toEqual(
        expect.arrayContaining(["provider_payload", "secret", "token"])
      );
    }
  });

  it("documents that market profiles are future expansion infrastructure, not restricted-market support", () => {
    const boundaryDoc = readRepoFile("docs", "MARKET_EXPANSION_BOUNDARY.md");
    const productTruthDoc = readRepoFile("docs", "CURRENT_PRODUCT_TRUTH.md");
    const combined = `${boundaryDoc}\n${productTruthDoc}`;

    expect(boundaryDoc).toContain("lawful future expansion");
    expect(boundaryDoc).toContain("Compatibility is not runtime permission");
    expect(boundaryDoc).toContain("support-led review does not equal approval");
    expect(boundaryDoc).toContain("not sanctions evasion");
    expect(boundaryDoc).toContain("restricted_market_review");
    expect(combined).toContain("global/default");
    expect(combined).toContain("restricted markets require legal/compliance review");
    expect(combined).not.toMatch(/Russia.*shipped/i);
    expect(combined).not.toMatch(/restricted markets are supported today/i);
  });
});
