import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  hasRequiredRole: vi.fn(),
  requireOrganization: vi.fn()
}));
const getRevenueIntelligenceDashboard = vi.fn();
const redirect = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/revenue-intelligence/revenue-intelligence", () => ({
  getRevenueIntelligenceDashboard
}));
vi.mock("@/components/revenue-intelligence/revenue-command-center", () => ({
  RevenueCommandCenter: ({ canAct }: { canAct: boolean }) => (
    <div>Revenue command center canAct={String(canAct)}</div>
  )
}));

describe("RevenueIntelligencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.hasRequiredRole.mockReturnValue(true);
    getRevenueIntelligenceDashboard.mockResolvedValue({
      snapshot: null,
      metrics: [],
      signals: [],
      vendorCategorySummaries: [],
      forecasts: [],
      insights: [],
      evidenceLinks: [],
      riskQueue: [],
      opportunities: [],
      kpis: {}
    });
  });

  it("loads an organization-scoped dashboard for allowed roles", async () => {
    const Page = (await import("@/app/dashboard/revenue-intelligence/page")).default;

    render(await Page());

    expect(getRevenueIntelligenceDashboard).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(screen.getByText("Revenue command center canAct=true")).toBeInTheDocument();
  });

  it("redirects roles that cannot view the command center", async () => {
    auth.hasRequiredRole.mockReturnValueOnce(false);
    const Page = (await import("@/app/dashboard/revenue-intelligence/page")).default;

    await expect(Page()).rejects.toThrow("REDIRECT:/dashboard");
    expect(getRevenueIntelligenceDashboard).not.toHaveBeenCalled();
  });
});
