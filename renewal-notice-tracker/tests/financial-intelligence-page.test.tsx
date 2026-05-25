import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

const requireOrganization = vi.fn();
const redirectMock = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});
const getContracts = vi.fn();
const getContractFacets = vi.fn();
const getBillingSnapshot = vi.fn();
const auditFinancialIntelligenceViewed = vi.fn();
const contractsTableSpy = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

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

vi.mock("@/lib/intelligence/audit", () => ({
  auditFinancialIntelligenceViewed
}));

vi.mock("@/components/contracts/contract-filters", () => ({
  ContractFilters: () => <div>Filters</div>
}));

vi.mock("@/components/contracts/contracts-table", () => ({
  ContractsTable: ({ contracts }: { contracts: DashboardContractRow[] }) => {
    contractsTableSpy(contracts);
    return <div>Contracts table</div>;
  }
}));

function makeContract(
  overrides: Partial<DashboardContractRow> = {},
  metadataOverrides: Partial<NonNullable<DashboardContractRow["contract_metadata"]>> = {}
): DashboardContractRow {
  return {
    id: "contract-1",
    status: "active",
    cycle_status: "open",
    status_tag: "active",
    owner_user_id: "owner-1",
    owner_name: "Alex Owner",
    department: "Legal",
    renewal_decision_status: "undecided",
    created_at: "2026-05-16T00:00:00.000Z",
    contract_metadata: {
      contract_title: "MSA",
      counterparty_name: "Acme",
      renewal_date: "2026-06-15",
      expiration_date: null,
      notice_deadline_date: "2026-06-01",
      auto_renewal: true,
      needs_review: false,
      field_confidence: 0.95,
      contract_value_amount: 100000,
      contract_value_currency: "USD",
      contract_value_period: "annual",
      price_change_trigger: null,
      payment_trigger: null,
      financial_data_trust_status: "high",
      ...metadataOverrides
    },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FinancialIntelligencePage", () => {
  it(
    "renders the allowed financial cards and keeps low-trust values labeled without suite creep",
    async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "admin-1" },
      organizationId: "org-1",
      role: "admin"
    });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract(
        { id: "contract-2" },
        {
          needs_review: true,
          financial_data_trust_status: "low",
          contract_value_currency: "USD",
          contract_value_amount: 45000
        }
      )
    ]);

    const Page = (await import("@/app/dashboard/financial-intelligence/page")).default;
    render(await Page());

    expect(screen.getByRole("heading", { name: "Financial Intelligence" })).toBeInTheDocument();
    expect(screen.getByText("Renewal exposure next 30 days")).toBeInTheDocument();
    expect(screen.getByText("Auto-renewal exposure")).toBeInTheDocument();
    expect(screen.getByText("Price-change exposure")).toBeInTheDocument();
    expect(screen.getAllByText("Low trust").length).toBeGreaterThan(0);
    expect(auditFinancialIntelligenceViewed).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "admin-1",
        calculationVersion: "financial_exposure.v1"
      })
    );
    expect(screen.queryByText(/\bERP\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoice matching/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cash-flow forecasting/i)).not.toBeInTheDocument();
    },
    15000
  );

  it("redirects when the active plan does not allow financial intelligence", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "admin-1" },
      organizationId: "org-1",
      role: "admin"
    });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });

    const Page = (await import("@/app/dashboard/financial-intelligence/page")).default;

    await expect(Page()).rejects.toThrow("REDIRECT:/dashboard");
    expect(getContracts).not.toHaveBeenCalled();
  });
});

describe("ContractsPage financial drilldowns", () => {
  it("keeps drilldowns scoped to the active organization contract set", async () => {
    contractsTableSpy.mockReset();
    requireOrganization.mockResolvedValue({
      user: { id: "admin-1" },
      organizationId: "org-1",
      role: "admin"
    });
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract(
        { id: "contract-2" },
        {
          counterparty_name: "Globex"
        }
      )
    ]);
    getContractFacets.mockResolvedValue({
      owners: [],
      departments: [],
      statusTags: []
    });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });

    const Page = (await import("@/app/dashboard/contracts/page")).default;
    render(
      await Page({
        searchParams: {
          financialView: "renewal_exposure",
          counterpartyName: "Acme"
        }
      })
    );

    expect(requireOrganization).toHaveBeenCalled();
    expect(getContracts).toHaveBeenCalledWith("org-1", "all", {
      ownerUserId: undefined,
      department: undefined,
      statusTag: undefined
    });
    expect(contractsTableSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "contract-1" })])
    );
    expect(contractsTableSpy.mock.calls.at(-1)?.[0]).toHaveLength(1);
    expect(screen.getByText(/Viewing renewal exposure/i)).toBeInTheDocument();
  }, 15000);
});
