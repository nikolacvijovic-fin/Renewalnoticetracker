import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuditLog = vi.fn();
const createCommercialDenialAuditLog = vi.fn();
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
    getBillingSnapshot
  };
});

function makeContext(role: "admin" | "operator" | "reviewer" | "owner") {
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

function makeBillingSnapshot(planTier: "free" | "starter" | "growth") {
  return {
    organizationId: "org-1",
    planTier,
    subscriptionStatus: "active",
    billingProvider: "paddle" as const,
    trialEndsAt: null,
    currentPeriodEnd: null
  };
}

describe("intelligence access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot("growth"));
  });

  it("lets owners see risk on their own contract only", async () => {
    const { assertCanAccessIntelligenceSurface } = await import("@/lib/intelligence/access");

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("owner"),
        billingSnapshot: makeBillingSnapshot("growth"),
        surface: "risk_explanation",
        contractOwnerUserId: "user-1"
      })
    ).resolves.toMatchObject({
      access: {
        allowed: true
      }
    });

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("owner"),
        billingSnapshot: makeBillingSnapshot("growth"),
        surface: "risk_explanation",
        contractOwnerUserId: "someone-else"
      })
    ).rejects.toMatchObject({
      name: "IntelligenceAuthorizationError",
      reason: "owner_scope_required"
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intelligence.access_denied",
        details: expect.objectContaining({
          surface: "risk_explanation",
          reason: "owner_scope_required"
        })
      })
    );
  }, 15000);

  it("denies owners from the portfolio-wide risk queue", async () => {
    const { assertCanAccessIntelligenceSurface } = await import("@/lib/intelligence/access");

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("owner"),
        billingSnapshot: makeBillingSnapshot("growth"),
        surface: "risk_queue"
      })
    ).rejects.toMatchObject({
      name: "IntelligenceAuthorizationError",
      reason: "forbidden"
    });
  }, 15000);

  it("denies reviewers from financial intelligence and audits the attempt", async () => {
    const { assertCanAccessIntelligenceSurface } = await import("@/lib/intelligence/access");

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("reviewer"),
        billingSnapshot: makeBillingSnapshot("growth"),
        surface: "financial_dashboard"
      })
    ).rejects.toMatchObject({
      name: "IntelligenceAuthorizationError",
      reason: "forbidden"
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intelligence.access_denied",
        details: expect.objectContaining({
          surface: "financial_dashboard",
          permission: "view_financial_intelligence",
          reason: "forbidden"
        })
      })
    );
  }, 15000);

  it("keeps full risk explanations and queues off the starter plan while leaving badges available", async () => {
    const {
      assertCanAccessIntelligenceSurface,
      getIntelligenceSurfaceAccess
    } = await import("@/lib/intelligence/access");

    expect(
      getIntelligenceSurfaceAccess({
        context: makeContext("operator"),
        billingSnapshot: makeBillingSnapshot("starter"),
        surface: "risk_badge"
      })
    ).toMatchObject({
      allowed: true
    });

    await expect(
      assertCanAccessIntelligenceSurface({
        context: makeContext("operator"),
        billingSnapshot: makeBillingSnapshot("starter"),
        surface: "risk_queue"
      })
    ).rejects.toMatchObject({
      name: "IntelligencePlanAccessError"
    });

    expect(createCommercialDenialAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "risk_scores",
        context: expect.objectContaining({
          surface: "risk_queue"
        })
      })
    );
  }, 15000);

  it("loads the canonical billing snapshot inside the shared intelligence access state helper", async () => {
    const { getIntelligenceSurfaceAccessState } = await import("@/lib/intelligence/access");
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot("starter"));

    const result = await getIntelligenceSurfaceAccessState({
      context: makeContext("admin"),
      surface: "risk_badge"
    });

    expect(getBillingSnapshot).toHaveBeenCalledWith("org-1");
    expect(result.billingSnapshot.planTier).toBe("starter");
    expect(result.access).toMatchObject({
      allowed: true,
      featureAccess: expect.objectContaining({
        allowed: true,
        feature: "risk_badges"
      })
    });
  });

  it("reuses one canonical billing snapshot across multiple intelligence surfaces", async () => {
    const { getIntelligenceSurfaceAccessMap } = await import("@/lib/intelligence/access");
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot("starter"));

    const result = await getIntelligenceSurfaceAccessMap({
      context: makeContext("admin"),
      surfaces: ["risk_badge", "risk_explanation", "financial_dashboard"]
    });

    expect(getBillingSnapshot).toHaveBeenCalledTimes(1);
    expect(result.billingSnapshot.planTier).toBe("starter");
    expect(result.accessBySurface.risk_badge.allowed).toBe(true);
    expect(result.accessBySurface.risk_explanation.allowed).toBe(false);
    expect(result.accessBySurface.financial_dashboard.allowed).toBe(false);
    expect(result.accessBySurface.risk_explanation.featureAccess.reason).toBe("upgrade_required");
    expect(result.accessBySurface.financial_dashboard.featureAccess.reason).toBe("upgrade_required");
  });
});
