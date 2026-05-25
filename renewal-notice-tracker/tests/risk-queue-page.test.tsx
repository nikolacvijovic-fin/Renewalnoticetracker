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
const getCounterparties = vi.fn();
const getBillingSnapshot = vi.fn();
const auditRiskQueueViewed = vi.fn();
const auditRiskScoreRecalculated = vi.fn();

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
  useRouter: () => ({
    push: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  redirect: redirectMock
}));

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContracts,
  getContractFacets,
  getCounterparties
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
  auditRiskQueueViewed,
  auditRiskScoreRecalculated
}));

function makeContract(
  overrides: Partial<DashboardContractRow> = {},
  metadataOverrides: Partial<NonNullable<DashboardContractRow["contract_metadata"]>> = {}
): DashboardContractRow {
  return {
    id: "contract-1",
    status: "active",
    cycle_status: "awaiting_acknowledgment",
    status_tag: "active",
    owner_user_id: null,
    owner_name: "Unassigned",
    department: "Legal",
    renewal_decision_status: "undecided",
    created_at: "2026-05-16T00:00:00.000Z",
    counterparty_id: "counterparty-1",
    contract_metadata: {
      contract_title: "MSA",
      counterparty_name: "Acme",
      renewal_date: "2099-05-25",
      expiration_date: "2099-06-20",
      notice_deadline_date: "2099-05-20",
      auto_renewal: true,
      needs_review: true,
      field_confidence: { notice_deadline_date: 0.72 },
      has_weak_evidence: true,
      accepted_unverified_risk_requested: true,
      contract_value_amount: null,
      contract_value_currency: "USD",
      contract_value_period: "annual",
      price_change_trigger: "Price increase after anniversary",
      payment_trigger: null,
      financial_data_trust_status: "low",
      ...metadataOverrides
    },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RiskQueuePage", () => {
  it(
    "renders the risk queue with low-confidence labels and workflow-safe actions only",
    async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "reviewer-1" },
      organizationId: "org-1",
      role: "reviewer"
    });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });
    getContracts.mockResolvedValue([makeContract()]);
    getContractFacets.mockResolvedValue({
      owners: [{ user_id: "owner-1", label: "Owner One" }],
      departments: ["Legal"],
      statusTags: ["active"]
    });
    getCounterparties.mockResolvedValue([
      {
        id: "counterparty-1",
        name: "Acme",
        raw_counterparty_name: "Acme",
        normalized_counterparty_name: "acme",
        contract_count: 1,
        alias_names: [],
        duplicate_suggestions: [{ id: "counterparty-2", raw_counterparty_name: "ACME Inc", score: 90 }]
      }
    ]);

    const Page = (await import("@/app/dashboard/risk-queue/page")).default;
    render(await Page({ searchParams: {} }));

    expect(screen.getByRole("heading", { name: "Risk Queue" })).toBeInTheDocument();
    expect(screen.getByText("Contracts in queue")).toBeInTheDocument();
    expect(screen.getAllByText("Low confidence").length).toBeGreaterThan(0);
    expect(screen.getByText("P0 review is incomplete, so workflow truth is not yet trusted.")).toBeInTheDocument();
    expect(
      screen.getByText("Contract value is missing, so exposure-related risk is understated.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review P0" })).toHaveAttribute(
      "href",
      "/dashboard/contracts/contract-1#review-panel"
    );
    expect(screen.getByRole("link", { name: "Assign owner" })).toHaveAttribute(
      "href",
      "/dashboard/contracts/contract-1#review-panel"
    );
    expect(auditRiskQueueViewed).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "reviewer-1",
        calculationVersion: "risk_score.v1",
        inputDataVersion: "trusted_workflow_state.v1",
        lowConfidenceCount: 1,
        riskBandsViewed: ["critical"],
        warningCount: expect.any(Number)
      })
    );
    expect(auditRiskScoreRecalculated).not.toHaveBeenCalled();
      expect(screen.queryByText(/legal action/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\bterminate\b/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Renew$/i)).not.toBeInTheDocument();
    },
    15000
  );

  it("redirects owners away from the portfolio-wide risk queue", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });

    const Page = (await import("@/app/dashboard/risk-queue/page")).default;

    await expect(Page({ searchParams: {} })).rejects.toThrow("REDIRECT:/dashboard");
    expect(getContracts).not.toHaveBeenCalled();
  });
});
