import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const getContracts = vi.fn();
const getContractFacets = vi.fn();
const getOrganizationBilling = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContracts,
  getContractFacets,
  getOrganizationBilling
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
      requireOrganization.mockResolvedValue({ organizationId: "org-1" });
      getContracts.mockResolvedValue([]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      getOrganizationBilling.mockResolvedValue({
        plan_tier: "free",
        subscription_status: "inactive",
        billing_provider: null
      });

      const Page = (await import("@/app/dashboard/contracts/page")).default;
      render(
        await Page({
          searchParams: {
            commercial: "billing.export_upgrade_required"
          }
        })
      );

      expect(screen.getByText("Exporting contracts requires a paid plan.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
    },
    15000
  );
});
