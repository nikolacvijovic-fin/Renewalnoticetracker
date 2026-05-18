import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const redirectMock = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});
const getProcurementAnalyticsDashboard = vi.fn();
const getBillingSnapshot = vi.fn();
const auditProcurementAnalyticsViewed = vi.fn();

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

vi.mock("@/lib/intelligence/procurement/query-helpers", () => ({
  getProcurementAnalyticsDashboard,
  normalizeProcurementDueWindow: (value: string | undefined) => (value ? Number(value) : null),
  normalizeProcurementTrustFilter: (value: string | undefined) => value ?? "all"
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
  auditProcurementAnalyticsViewed
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    key: "row-1",
    label: "Acme",
    contract_count: 3,
    low_confidence_contract_count: 1,
    owner_missing_contract_count: 1,
    decision_gap_contract_count: 2,
    due_soon_contract_count: 2,
    auto_renewal_contract_count: 2,
    drilldown_contract_ids: ["contract-1", "contract-2"],
    trust_level: "low",
    warnings: [
      {
        code: "low_confidence_contracts",
        message: "1 Acme contract remains unreviewed or low-confidence.",
        severity: "warning"
      }
    ],
    exposure_amount: 120000,
    exposure_currency: "USD",
    latest_decision_date: "2026-05-11",
    duplicate_suggestions: [],
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProcurementAnalyticsPage", () => {
  it(
    "renders action-oriented procurement analytics with drilldowns and low-trust labels",
    async () => {
      requireOrganization.mockResolvedValue({
        user: { id: "operator-1" },
        organizationId: "org-1",
        role: "operator"
      });
      getBillingSnapshot.mockResolvedValue({
        organizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        trialEndsAt: null,
        currentPeriodEnd: null
      });
      getProcurementAnalyticsDashboard.mockResolvedValue({
        filters: {
          department: "",
          ownerUserId: "",
          counterpartyName: "",
          dueWindowDays: "",
          trustStatus: "all"
        },
        filterOptions: {
          departments: ["Legal"],
          owners: [{ user_id: "owner-1", label: "Owner One" }],
          counterparties: ["Acme"],
          dueWindows: [30, 60, 90, 180],
          trustStatuses: ["all", "verified", "low_confidence"]
        },
        emptyState: null,
        totalContractsInScope: 5,
        lowConfidenceContractCount: 1,
        reviewedContractCount: 4,
        ownerAssignedContractCount: 4,
        valuedContractCount: 5,
        vendorExposureSummary: {
          slug: "procurement.vendor_exposure_summary",
          title: "Vendor exposure summary",
          rows: [makeRow()],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.vendor_exposure_summary",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        departmentExposureSummary: {
          slug: "procurement.department_exposure_summary",
          title: "Department exposure summary",
          rows: [makeRow({ key: "department:Legal", label: "Legal" })],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.department_exposure_summary",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        ownerCoverageSummary: {
          slug: "procurement.owner_coverage_summary",
          title: "Owner coverage summary",
          rows: [makeRow({ key: "owner:owner-1", label: "Owner One" })],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.owner_coverage_summary",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        decisionGapSummary: {
          slug: "procurement.decision_gap_summary",
          title: "Decision gap summary",
          rows: [
            makeRow({ key: "decision_gap", label: "Decision gap", contract_count: 2 }),
            makeRow({ key: "decision_recorded", label: "Decision recorded", contract_count: 3 })
          ],
          total_contract_count: 5,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.decision_gap_summary",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        dueSoonVendorConcentration: {
          slug: "procurement.due_soon_vendor_concentration",
          title: "Due-soon vendor concentration",
          rows: [makeRow()],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.due_soon_vendor_concentration",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        duplicateCounterpartySummary: {
          slug: "procurement.duplicate_counterparty_summary",
          title: "Duplicate counterparty summary",
          rows: [
            makeRow({
              key: "duplicate-1",
              exposure_amount: null,
              exposure_currency: null,
              duplicate_suggestions: [{ id: "counterparty-2", raw_counterparty_name: "ACME Inc", score: 88 }]
            })
          ],
          total_contract_count: 3,
          low_confidence_contract_count: 0,
          warnings: [],
          calculation_basis: {
            slug: "procurement.duplicate_counterparty_summary",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        renewalOutcomeHistory: {
          slug: "procurement.renewal_outcome_history",
          title: "Renewal outcome history",
          rows: [makeRow({ key: "renew", label: "Renewed" })],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.renewal_outcome_history",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        autoRenewalConcentrationSummary: {
          slug: "procurement.auto_renewal_concentration",
          title: "Auto-renewal concentration",
          rows: [makeRow()],
          total_contract_count: 3,
          low_confidence_contract_count: 1,
          warnings: [],
          calculation_basis: {
            slug: "procurement.auto_renewal_concentration",
            description: "test",
            usesReviewedTruthOnly: true,
            blocksWhenTrustGatesFail: true
          }
        },
        combinedWarnings: []
      });

      const Page = (await import("@/app/dashboard/procurement-analytics/page")).default;
      render(
        await Page({
          searchParams: {}
        })
      );

      expect(getProcurementAnalyticsDashboard).toHaveBeenCalledWith("org-1", {
        department: undefined,
        ownerUserId: undefined,
        counterpartyName: undefined,
        dueWindowDays: null,
        trustStatus: "all"
      });
      expect(screen.getByRole("heading", { name: "Procurement Analytics" })).toBeInTheDocument();
      expect(screen.getByText("Top vendors by upcoming renewal exposure")).toBeInTheDocument();
      expect(screen.getByText("Vendor contracts due soon")).toBeInTheDocument();
      expect(screen.getByText("Owner gaps by department")).toBeInTheDocument();
      expect(screen.getByText("Decision gaps by owner")).toBeInTheDocument();
      expect(screen.getAllByText("Low trust").length).toBeGreaterThan(0);
      expect(auditProcurementAnalyticsViewed).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          actorUserId: "operator-1",
          calculationVersion: "procurement_analytics.v1"
        })
      );
      expect(
        screen.getAllByRole("link", { name: /Open vendor contracts|Work due-soon contracts|Assign owners|Record decisions|Review auto-renewals|Clean up vendor identity|Open decided contracts/i })
          .some((link) => {
            const href = link.getAttribute("href") ?? "";
            return (
              href.startsWith("/dashboard/contracts?") &&
              href.includes("contractIds=contract-1") &&
              href.includes("contract-2")
            );
          })
      ).toBe(true);
      expect(screen.queryByText(/supplier performance/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\bERP\b/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/vendor enrichment/i)).not.toBeInTheDocument();
    },
    15000
  );
});
