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
        platformRuntimeContextOverrides: {
          providerPolicies: { providers: ["paddle", "supabase", "resend"] }
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
