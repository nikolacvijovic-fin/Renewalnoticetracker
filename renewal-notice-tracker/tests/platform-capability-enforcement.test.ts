import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveOrganizationContext, MembershipRole } from "@/lib/auth";

const createAuditLog = vi.fn();
const createCommercialDenialAuditLog = vi.fn();
const enforceFeatureAccess = vi.fn();
const getBillingSnapshot = vi.fn();

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );
  return {
    ...actual,
    createCommercialDenialAuditLog,
    enforceFeatureAccess,
    getBillingSnapshot
  };
});

function makeBillingSnapshot(planTier: "free" | "starter" | "growth" = "growth") {
  return {
    organizationId: "org-1",
    planTier,
    subscriptionStatus: "active",
    billingProvider: "paddle" as const,
    trialEndsAt: null,
    currentPeriodEnd: null
  };
}

function makeContext(role: MembershipRole = "admin"): ActiveOrganizationContext {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-05-18T00:00:00.000Z"
    },
    organizationId: "org-1",
    role
  };
}

function makeAccessResult(feature = "exports", allowed = true) {
  return {
    allowed,
    feature,
    reason: allowed ? "allowed" : "upgrade_required",
    message: allowed ? "Allowed" : "Upgrade required"
  };
}

describe("platform capability enforcement surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
    enforceFeatureAccess.mockResolvedValue({
      billingSnapshot: makeBillingSnapshot(),
      accessResult: makeAccessResult()
    });
  });

  it("keeps shipped export access working when platform runtime context is healthy", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("admin"),
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "csv",
        source: "export_route"
      })
    ).resolves.toBeUndefined();

    expect(enforceFeatureAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "exports",
        context: expect.objectContaining({
          export_preset: "basic_contract_register",
          source: "export_route"
        })
      })
    );
  }, 15000);

  it("resolves runtime context from billing provider, market profile, feature gates, and commercial features", async () => {
    const {
      resolvePlatformRuntimeContext,
      resolvePlatformProviders,
      resolveShippedPlatformFeatureGates
    } = await import("@/lib/product/platform-capability-gates");

    expect(
      resolvePlatformProviders({
        billingSnapshot: makeBillingSnapshot("growth")
      })
    ).toEqual(expect.arrayContaining(["paddle", "supabase", "openai", "resend"]));

    const manualContext = resolvePlatformRuntimeContext({
      context: makeContext("admin"),
      billingSnapshot: {
        ...makeBillingSnapshot("growth"),
        billingProvider: "manual"
      }
    });
    expect(manualContext.providerPolicies.providers).toEqual(
      expect.arrayContaining(["manual_invoice", "supabase", "openai", "resend"])
    );
    expect(manualContext.providerPolicies.providers).not.toContain("future_identity_provider");
    expect(manualContext.providerPolicies.providers).not.toContain("future_public_api_provider");
    expect(manualContext.subscription.commercialFeatures).toEqual(
      expect.arrayContaining(["exports", "risk_scores", "financial_intelligence", "procurement_analytics"])
    );

    const gates = resolveShippedPlatformFeatureGates();
    expect(gates).toContain("exports");
    expect(gates).toContain("contract_intelligence");
    expect(gates).toContain("revenue_intelligence_command_center");
    expect(gates).not.toContain("revenue_intelligence");
    expect(gates).not.toContain("identity");
    expect(gates).not.toContain("market_activation");
    expect(gates).not.toContain("approval_queue");
    expect(gates).not.toContain("platform_api_integrations");
    expect(gates).not.toContain("ai_generation");
  });

  it.each([
    ["global", true],
    ["us", false],
    ["eu", false],
    ["manual_invoice_review", false],
    ["restricted_market_review", false],
    ["unknown_market", false]
  ] as const)("resolves %s market runtime permission conservatively", async (marketId, expectedRuntime) => {
    const { resolvePlatformRuntimeContext } = await import("@/lib/product/platform-capability-gates");

    expect(
      resolvePlatformRuntimeContext({
        context: makeContext("admin"),
        billingSnapshot: makeBillingSnapshot("growth"),
        market: { marketId }
      }).market
    ).toMatchObject({
      runtimeEnabled: expectedRuntime
    });
  });

  it("blocks export access before payload assembly when the platform exports feature gate is missing", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");
    const { PlatformCapabilityGateError } = await import("@/lib/product/platform-capability-gates");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("admin"),
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "csv",
        source: "export_route",
        platformRuntimeContextOverrides: {
          featureGates: { enabledCapabilities: ["billing", "contracts", "audit", "permissions"] }
        }
      })
    ).rejects.toBeInstanceOf(PlatformCapabilityGateError);

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("admin"),
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "csv",
        source: "export_route",
        platformRuntimeContextOverrides: {
          featureGates: { enabledCapabilities: ["billing", "contracts", "audit", "permissions"] }
        }
      })
    ).rejects.toMatchObject({
      decision: {
        allowed: false,
        capabilityId: "exports",
        internalDiagnostics: expect.objectContaining({
          platformStatus: "missing_feature_gate",
          missingFeatureGates: ["exports"]
        })
      }
    });
  });

  it("blocks export access when the resolved market is not runtime-enabled", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("admin"),
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "csv",
        source: "export_route",
        platformRuntimeContextInput: {
          market: { marketId: "eu" }
        }
      })
    ).rejects.toMatchObject({
      decision: {
        allowed: false,
        capabilityId: "exports",
        reasonCodes: expect.arrayContaining(["market_runtime_disabled", "market_not_shipped_runtime"])
      }
    });
  });

  it("blocks export access when a required resolved provider is unavailable", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("admin"),
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "csv",
        source: "export_route",
        platformRuntimeContextInput: {
          providerAvailability: { supabase: false }
        }
      })
    ).rejects.toMatchObject({
      decision: {
        allowed: false,
        capabilityId: "exports",
        reasonCodes: expect.arrayContaining(["provider_missing_supabase"])
      }
    });
  });

  it("keeps existing export role and billing checks ahead of platform evaluation", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("owner"),
        preset: EXPORT_PRESETS.notes_and_decisions_export,
        format: "csv",
        source: "export_route",
        platformRuntimeContextOverrides: {
          featureGates: { enabledCapabilities: [] }
        }
      })
    ).rejects.toMatchObject({
      name: "OrganizationAuthorizationError"
    });

    expect(enforceFeatureAccess).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_denied",
        details: expect.objectContaining({
          denied_reason: "role_not_allowed"
        })
      })
    );
  });

  it("blocks intelligence access when the platform contract intelligence provider is unavailable", async () => {
    const { assertCanAccessIntelligenceSurface } = await import("@/lib/intelligence/access");

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("operator"),
        billingSnapshot: makeBillingSnapshot("growth"),
        surface: "risk_queue",
        platformRuntimeContextInput: {
          providerAvailability: { openai: false }
        }
      })
    ).rejects.toMatchObject({
      name: "IntelligencePlatformAccessError",
      capabilityId: "contract_intelligence",
      decision: expect.objectContaining({
        allowed: false,
        reasonCodes: expect.arrayContaining(["provider_missing_openai"])
      })
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intelligence.access_denied",
        details: expect.objectContaining({
          reason: "platform_capability_blocked",
          platform_capability: "contract_intelligence",
          platform_status: expect.stringMatching(/missing_provider|missing_dependency/)
        })
      })
    );
  });

  it("carries resolved platform context into intelligence export access", async () => {
    const { assertContractExportPresetAccess } = await import("@/lib/contracts/export-access");
    const { EXPORT_PRESETS } = await import("@/lib/contracts/export");

    await expect(
      assertContractExportPresetAccess({
        context: makeContext("operator"),
        preset: EXPORT_PRESETS.intelligence_export,
        format: "csv",
        source: "export_route",
        platformRuntimeContextInput: {
          providerAvailability: { openai: false }
        }
      })
    ).rejects.toMatchObject({
      name: "IntelligencePlatformAccessError",
      capabilityId: "contract_intelligence",
      decision: expect.objectContaining({
        allowed: false,
        reasonCodes: expect.arrayContaining(["provider_missing_openai"])
      })
    });
  });

  it("keeps future-only revenue intelligence blocked with customer-safe output", async () => {
    const { evaluatePlatformCapabilityGate } = await import("@/lib/product/platform-capability-gates");
    const decision = evaluatePlatformCapabilityGate({
      capabilityId: "revenue_intelligence",
      context: makeContext("admin"),
      billingSnapshot: makeBillingSnapshot("growth"),
      runtimeContextOverrides: {
        providerPolicies: {
          providers: ["paddle", "supabase", "openai", "resend", "future_public_api_provider"]
        },
        featureGates: {
          enabledCapabilities: [
            "billing",
            "contracts",
            "renewals",
            "contract_intelligence",
            "ocr",
            "ai_generation",
            "exports",
            "notifications",
            "audit",
            "permissions",
            "revenue_intelligence"
          ]
        }
      }
    });

    expect(decision).toMatchObject({
      allowed: false,
      capabilityId: "revenue_intelligence",
      internalDiagnostics: expect.objectContaining({
        platformStatus: "future_only"
      })
    });
    expect(decision.customerSafeMessage).toContain("future-only");
    expect(JSON.stringify(decision)).not.toMatch(/secret|token|provider payload|raw contract/i);
  });
});
