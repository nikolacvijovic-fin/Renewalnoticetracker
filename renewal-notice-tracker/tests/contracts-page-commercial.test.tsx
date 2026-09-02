import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const getContracts = vi.fn();
const getContractFacets = vi.fn();
const getBillingSnapshot = vi.fn();
const getIntelligenceSurfaceAccessMap = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContracts,
  getContractFacets
}));

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );

  return {
    ...actual,
    getBillingSnapshot
  };
});

vi.mock("@/lib/intelligence/access", () => ({
  getIntelligenceSurfaceAccessMap
}));

vi.mock("@/components/contracts/contract-filters", () => ({
  ContractFilters: () => <div>Filters</div>
}));

vi.mock("@/components/contracts/contracts-table", () => ({
  ContractsTable: () => <div>Contracts table</div>
}));

describe("ContractsPage commercial UX", () => {
  it(
    "shows the commercial notice and disables export buttons when export access is blocked",
    async () => {
      requireOrganization.mockResolvedValue({
        organizationId: "org-1",
        role: "admin",
        user: { id: "user-1" }
      });
      getContracts.mockResolvedValue([]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      getBillingSnapshot.mockResolvedValue({
        organizationId: "org-1",
        planTier: "free",
        subscriptionStatus: "inactive",
        billingProvider: "none",
        trialEndsAt: null,
        currentPeriodEnd: null
      });
      getIntelligenceSurfaceAccessMap.mockResolvedValue({
        billingSnapshot: {
          organizationId: "org-1",
          planTier: "free",
          subscriptionStatus: "inactive",
          billingProvider: "none",
          trialEndsAt: null,
          currentPeriodEnd: null
        },
        accessBySurface: {
          risk_badge: { allowed: false },
          risk_explanation: { allowed: false }
        }
      });

      const Page = (await import("@/app/dashboard/contracts/page")).default;
      render(
        await Page({
          searchParams: Promise.resolve({
            commercial: "billing.export_upgrade_required"
          })
        })
      );

      expect(screen.getByText("Exporting contracts requires a paid plan.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
    },
    30000
  );
});
