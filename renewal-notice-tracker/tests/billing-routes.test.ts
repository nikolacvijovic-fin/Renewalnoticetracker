import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getOrganizationBilling = vi.fn();
const createBillingCheckoutSession = vi.fn();
const createBillingManagementSession = vi.fn();
const getBillingProviderCapability = vi.fn();
const resolveBillingProvider = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const assertCanUseShippedAction = vi.fn();
const OrganizationAuthorizationError = class OrganizationAuthorizationError extends Error {};
const ActiveOrganizationRequiredError = class ActiveOrganizationRequiredError extends Error {};

vi.mock("@/lib/auth", () => ({
  getActiveOrganizationContextOrNull: getOrganizationContextOrNull,
  assertCanUseShippedAction,
  OrganizationAuthorizationError,
  ActiveOrganizationRequiredError
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getOrganizationBilling
}));

vi.mock("@/lib/billing/service", () => ({
  createBillingCheckoutSession,
  createBillingManagementSession
}));

vi.mock("@/lib/billing/provider", () => ({
  getBillingProviderCapability,
  resolveBillingProvider
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "owner"
    });
    getOrganizationBilling.mockResolvedValue({
      id: "org-1",
      billing_email: "billing@example.com",
      billing_provider: "paddle",
      billing_customer_id: "cus_1",
      plan_tier: "starter",
      subscription_status: "active",
      subscription_current_period_end: null
    });
    getBillingProviderCapability.mockReturnValue({
      checkout: { supported: true, message: "ok" },
      management: { supported: true, message: "ok" }
    });
    resolveBillingProvider.mockReturnValue("paddle");
    assertCanUseShippedAction.mockImplementation(async (context: { role: string } | null) => {
      if (!context) {
        throw new ActiveOrganizationRequiredError();
      }
      if (context.role !== "owner" && context.role !== "admin") {
        throw new OrganizationAuthorizationError();
      }
      return context;
    });
  });

  it("starts a checkout session on Paddle", async () => {
    createBillingCheckoutSession.mockResolvedValue({
      url: "https://checkout.test/session",
      provider: "paddle"
    });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter", {
        method: "POST"
      })
    );

    expect(createBillingCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        plan: "starter",
        providerOverride: "paddle"
      })
    );
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_checkout_started",
        organizationId: "org-1"
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.test/session");
  });

  it("rejects billing checkout when no active organization is selected", async () => {
    getOrganizationContextOrNull.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects legacy provider overrides before checkout starts", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter&provider=paypal", {
        method: "POST"
      })
    );

    expect(response.status).toBe(400);
    expect(createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects Stripe checkout overrides before checkout starts", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter&provider=stripe", {
        method: "POST"
      })
    );

    expect(response.status).toBe(400);
    expect(createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  it("redirects manual checkout requests to the support-led billing path and audits them", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter&provider=manual", {
        method: "POST"
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/dashboard/settings?billing=contact-support&provider=manual"
    );
    expect(createBillingCheckoutSession).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.checkout_unavailable",
        details: expect.objectContaining({
          provider: "manual",
          provider_state: "internal_exception",
          request_id: expect.any(String)
        })
      }),
      undefined
    );
  });

  it("rejects reviewer billing checkout attempts before any billing lookup", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-2", email: "reviewer@example.com" },
      organizationId: "org-1",
      role: "reviewer"
    });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new Request("http://localhost/api/billing/checkout?plan=starter", {
        method: "POST"
      })
    );

    expect(response.status).toBe(403);
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(createBillingCheckoutSession).not.toHaveBeenCalled();
  });

  it("redirects to management portal when supported", async () => {
    createBillingManagementSession.mockResolvedValue({
      provider: "paddle",
      supported: true,
      url: "https://portal.test/session"
    });

    const { POST } = await import("@/app/api/billing/manage/route");
    const response = await POST(
      new Request("http://localhost/api/billing/manage", {
        method: "POST"
      })
    );

    expect(createBillingManagementSession).toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portal.test/session");
  });

  it("rejects reviewer billing management attempts before any provider lookup", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-2", email: "reviewer@example.com" },
      organizationId: "org-1",
      role: "reviewer"
    });

    const { POST } = await import("@/app/api/billing/manage/route");
    const response = await POST(
      new Request("http://localhost/api/billing/manage", {
        method: "POST"
      })
    );

    expect(response.status).toBe(403);
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(createBillingManagementSession).not.toHaveBeenCalled();
  });

  it("redirects back to settings when the org is on a legacy/manual billing path", async () => {
    getOrganizationBilling.mockResolvedValue({
      id: "org-1",
      billing_email: "billing@example.com",
      billing_provider: "manual",
      billing_customer_id: "cus_1",
      plan_tier: "starter",
      subscription_status: "active",
      subscription_current_period_end: null
    });
    getBillingProviderCapability.mockReturnValue({
      checkout: { supported: true, message: "ok" },
      management: {
        supported: false,
        message: "Manual invoice exceptions are support-led and are not self-serve in shipped-first runtime."
      }
    });
    resolveBillingProvider.mockReturnValue("paddle");

    const { POST } = await import("@/app/api/billing/manage/route");
    const response = await POST(
      new Request("http://localhost/api/billing/manage", {
        method: "POST"
      })
    );

    expect(createBillingManagementSession).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/dashboard/settings?billing=contact-support&provider=manual"
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.management_unavailable",
        details: expect.objectContaining({
          provider: "manual",
          provider_state: "internal_exception",
          request_id: expect.any(String)
        })
      }),
      undefined
    );
  });

  it("rejects legacy provider overrides on billing management", async () => {
    const { POST } = await import("@/app/api/billing/manage/route");
    const response = await POST(
      new Request("http://localhost/api/billing/manage?provider=stripe", {
        method: "POST"
      })
    );

    expect(response.status).toBe(400);
    expect(createBillingManagementSession).not.toHaveBeenCalled();
  });

  it("keeps /api/billing/portal as a thin compatibility alias", async () => {
    createBillingManagementSession.mockResolvedValue({
      provider: "paddle",
      supported: true,
      url: "https://portal.test/session"
    });

    const { POST } = await import("@/app/api/billing/portal/route");
    const response = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST"
      })
    );

    expect(createBillingManagementSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portal.test/session");
  });
});
