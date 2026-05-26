import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingSnapshot } from "@/lib/billing/entitlements";

const requireOrganization = vi.fn();
const getContractById = vi.fn();
const getCounterparties = vi.fn();
const getOrganizationMembers = vi.fn();
const getContracts = vi.fn();
const getContractFacets = vi.fn();
const getBillingSnapshot = vi.fn();
const createAuditLog = vi.fn();
const buildRiskQueueRow = vi.fn();
const buildRiskQueueView = vi.fn();
const getProcurementAnalyticsDashboard = vi.fn();
const buildFinancialDashboardView = vi.fn();
const auditRiskBadgeViewed = vi.fn();
const auditRiskQueueViewed = vi.fn();
const auditFinancialIntelligenceViewed = vi.fn();
const auditProcurementAnalyticsViewed = vi.fn();
const contractsTableSpy = vi.fn();

const redirectMock = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});

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
  redirect: redirectMock,
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContractById,
  getCounterparties,
  getOrganizationMembers,
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

vi.mock("@/lib/contracts/phase1-pilot", () => ({
  listPhase1ActiveReviewDirtyFlags: () => [],
  getPhase1ReviewMode: () => "fast_review",
  getPhase1TrustState: () => "Verified"
}));

vi.mock("@/lib/contracts/shipped-reminder-policy", () => ({
  formatReminderRuntimeStatusLabel: (value: string) => value,
  formatReminderTypeLabel: (value: string) => value,
  getReminderActivationState: ({ needsReview, ownerUserId, noticeDeadlineDate, renewalDate, expirationDate }: {
    needsReview?: boolean | null;
    ownerUserId?: string | null;
    noticeDeadlineDate?: string | null;
    renewalDate?: string | null;
    expirationDate?: string | null;
  }) => {
    if (needsReview) return "blocked_by_review";
    if (!ownerUserId) return "blocked_by_missing_owner";
    if (!noticeDeadlineDate && !renewalDate && !expirationDate) return "blocked_by_missing_p0";
    return "scheduled";
  }
}));

vi.mock("@/lib/intelligence/risk/dashboard", () => ({
  buildRiskQueueRow,
  buildRiskQueueView,
  getRiskConfidenceLabel: (value: string) => value
}));

vi.mock("@/lib/intelligence/financial/dashboard", () => ({
  buildFinancialDashboardView,
  describeFinancialDrilldown: () => null,
  filterContractsForFinancialDrilldown: (contracts: unknown[]) => contracts
}));

vi.mock("@/lib/intelligence/procurement/query-helpers", () => ({
  getProcurementAnalyticsDashboard,
  normalizeProcurementDueWindow: (value: string | undefined) => (value ? Number(value) : null),
  normalizeProcurementTrustFilter: (value: string | undefined) => value ?? "all"
}));

vi.mock("@/lib/intelligence/audit", () => ({
  auditRiskBadgeViewed,
  auditRiskQueueViewed,
  auditFinancialIntelligenceViewed,
  auditProcurementAnalyticsViewed
}));

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");

  return {
    ...actual,
    formatDate: () => "May 25, 2026"
  };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>
}));

vi.mock("@/components/contracts/review-form", () => ({
  ReviewForm: () => <div>Review form</div>
}));

vi.mock("@/components/contracts/reminder-timeline", () => ({
  ReminderTimeline: () => <div>Reminder timeline</div>
}));

vi.mock("@/components/contracts/note-form", () => ({
  NoteForm: () => <div>Note form</div>
}));

vi.mock("@/components/contracts/renewal-decision-form", () => ({
  RenewalDecisionForm: () => <div>Decision form</div>
}));

vi.mock("@/components/contracts/contract-cycle-actions", () => ({
  ContractCycleActions: () => <div>Cycle actions</div>
}));

vi.mock("@/components/contracts/contract-workflow-summary", () => ({
  ContractWorkflowSummary: () => <div>Workflow summary</div>
}));

vi.mock("@/components/contracts/contract-activity-feed", () => ({
  ContractActivityFeed: () => <div>Activity feed</div>
}));

vi.mock("@/components/contracts/contract-secondary-tabs", () => ({
  ContractSecondaryTabs: () => <div>Secondary tabs</div>
}));

vi.mock("@/components/contracts/contract-detail-shell", () => ({
  ContractDetailShell: ({
    badges
  }: {
    badges: ReactNode;
  }) => <div>{badges}</div>
}));

vi.mock("@/components/contracts/risk-explanation-drawer", () => ({
  RiskExplanationDrawer: () => <div>Risk explanation drawer</div>
}));

vi.mock("@/components/contracts/risk-badge", () => ({
  RiskBadge: ({ riskBand }: { riskBand: string }) => <div>{`Risk badge ${riskBand}`}</div>
}));

vi.mock("@/components/contracts/contract-filters", () => ({
  ContractFilters: () => <div>Filters</div>
}));

vi.mock("@/components/contracts/contracts-table", () => ({
  ContractsTable: (props: unknown) => {
    contractsTableSpy(props);
    return <div>Contracts table</div>;
  }
}));

vi.mock("@/components/dashboard/risk-queue-filters", () => ({
  RiskQueueFilters: () => <div>Risk filters</div>
}));

vi.mock("@/components/dashboard/risk-queue-table", () => ({
  RiskQueueTable: () => <div>Risk queue table</div>
}));

vi.mock("@/components/dashboard/metric-card", () => ({
  MetricCard: ({ label }: { label: string }) => <div>{label}</div>
}));

vi.mock("@/components/dashboard/financial-exposure-card", () => ({
  FinancialExposureCard: ({ card }: { card: { title: string } }) => <div>{card.title}</div>
}));

vi.mock("@/components/dashboard/financial-exposure-breakdown", () => ({
  FinancialExposureBreakdown: ({ title }: { title: string }) => <div>{title}</div>
}));

vi.mock("@/components/dashboard/procurement-analytics-filters", () => ({
  ProcurementAnalyticsFilters: () => <div>Procurement filters</div>
}));

vi.mock("@/components/dashboard/procurement-action-list", () => ({
  ProcurementActionList: ({ title }: { title: string }) => <div>{title}</div>
}));

function makeBillingSnapshot(
  overrides: Partial<BillingSnapshot> = {}
): BillingSnapshot {
  return {
    organizationId: "org-1",
    planTier: "growth",
    subscriptionStatus: "active",
    billingProvider: "paddle",
    trialEndsAt: null,
    currentPeriodEnd: null,
    ...overrides
  };
}

function makeContract() {
  return {
    id: "contract-1",
    updated_at: "2026-05-25T00:00:00.000Z",
    owner_user_id: "owner-1",
    owner_name: "Owner One",
    department: "Legal",
    status_tag: "active",
    renewal_decision_status: "undecided",
    renewal_decision_date: null,
    cycle_status: "open",
    counterparty_id: "counterparty-1",
    last_acknowledged_at: null,
    contract_files: [
      {
        id: "file-1",
        uploaded_at: "2026-05-24T00:00:00.000Z",
        extraction_source: "native"
      }
    ],
    contract_metadata: {
      id: "metadata-1",
      contract_title: "MSA",
      counterparty_name: "Acme",
      needs_review: false,
      notice_deadline_date: "2026-06-10",
      renewal_date: "2026-06-30",
      expiration_date: "2026-07-01",
      termination_window: "30 days",
      auto_renewal: true,
      field_confidence: {},
      field_source_snippets: {},
      has_weak_evidence: false,
      accepted_unverified_risk_requested: false,
      contract_value_amount: 100000,
      price_change_trigger: null
    },
    reminders: [],
    notes: [],
    audit_logs: [],
    renewal_decisions: [],
    extracted_field_evidence: [],
    processing_errors: []
  };
}

function makeRiskExplanation() {
  return {
    contractId: "contract-1",
    contractTitle: "MSA",
    counterpartyName: "Acme",
    department: "Legal",
    ownerLabel: "Owner One",
    workflowTrustState: "Verified",
    riskBand: "high",
    confidenceLevel: "high",
    reasons: [],
    missingDataWarnings: [],
    explanationMetadata: {
      calculation_version: "risk_score.v1",
      input_data_version: "trusted_workflow_state.v1"
    }
  };
}

function makeRiskQueueDashboard() {
  return {
    summary: {
      total: 1,
      critical: 0,
      high: 1,
      lowConfidence: 0
    },
    rows: [makeRiskExplanation()],
    filters: {
      ownerUserId: "",
      department: "",
      riskBand: "",
      dueWindowDays: "",
      trustStatus: "all"
    },
    filterOptions: {
      owners: [],
      departments: []
    },
    emptyState: null
  };
}

function makeFinancialDashboard() {
  return {
    emptyState: null,
    cards: [
      {
        slug: "renewal_exposure_30",
        title: "Renewal exposure next 30 days",
        explanationMetadata: {
          calculation_version: "financial_exposure.v1"
        }
      }
    ],
    lowTrustContractCount: 0,
    missingFinancialValueCount: 0,
    warnings: [],
    exposureByCounterparty: [],
    exposureByDepartment: [],
    exposureByOwner: []
  };
}

function makeProcurementDashboard() {
  return {
    filters: {
      department: "",
      ownerUserId: "",
      counterpartyName: "",
      dueWindowDays: "",
      trustStatus: "all"
    },
    filterOptions: {
      departments: [],
      owners: [],
      counterparties: [],
      dueWindows: [30, 60, 90, 180],
      trustStatuses: ["all", "verified", "low_confidence"]
    },
    emptyState: null,
    totalContractsInScope: 1,
    lowConfidenceContractCount: 0,
    reviewedContractCount: 1,
    ownerAssignedContractCount: 1,
    valuedContractCount: 1,
    combinedWarnings: [],
    vendorExposureSummary: { rows: [] },
    departmentExposureSummary: { rows: [] },
    ownerCoverageSummary: { rows: [] },
    decisionGapSummary: { rows: [{ key: "decision_gap", contract_count: 0 }] },
    dueSoonVendorConcentration: { rows: [] },
    duplicateCounterpartySummary: { rows: [] },
    renewalOutcomeHistory: { rows: [] },
    autoRenewalConcentrationSummary: { rows: [] }
  };
}

type SurfaceExpectation = {
  contractDetail: { badge: boolean; explanation: boolean };
  contractsList: { badge: boolean; explanation: boolean };
  riskQueueAllowed: boolean;
  financialAllowed: boolean;
  procurementAllowed: boolean;
};

const BILLING_STATE_MATRIX: Array<{
  name: string;
  snapshot: BillingSnapshot;
  expected: SurfaceExpectation;
}> = [
  {
    name: "free plan",
    snapshot: makeBillingSnapshot({
      planTier: "free",
      subscriptionStatus: "inactive",
      billingProvider: "none"
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "starter plan",
    snapshot: makeBillingSnapshot({
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle"
    }),
    expected: {
      contractDetail: { badge: true, explanation: false },
      contractsList: { badge: true, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "growth plan",
    snapshot: makeBillingSnapshot(),
    expected: {
      contractDetail: { badge: true, explanation: true },
      contractsList: { badge: true, explanation: true },
      riskQueueAllowed: true,
      financialAllowed: true,
      procurementAllowed: true
    }
  },
  {
    name: "expired trial",
    snapshot: makeBillingSnapshot({
      planTier: "starter",
      subscriptionStatus: "trialing",
      trialEndsAt: "2020-01-01T00:00:00.000Z"
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "past_due inside grace window",
    snapshot: makeBillingSnapshot({
      planTier: "growth",
      subscriptionStatus: "past_due",
      currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "past_due outside grace window",
    snapshot: makeBillingSnapshot({
      planTier: "growth",
      subscriptionStatus: "past_due",
      currentPeriodEnd: "2020-01-01T00:00:00.000Z"
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "cancelled subscription",
    snapshot: makeBillingSnapshot({
      planTier: "growth",
      subscriptionStatus: "cancelled"
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  },
  {
    name: "provider not configured",
    snapshot: makeBillingSnapshot({
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "stripe"
    }),
    expected: {
      contractDetail: { badge: false, explanation: false },
      contractsList: { badge: false, explanation: false },
      riskQueueAllowed: false,
      financialAllowed: false,
      procurementAllowed: false
    }
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  contractsTableSpy.mockReset();
  requireOrganization.mockResolvedValue({
    user: { id: "admin-1" },
    organizationId: "org-1",
    role: "admin"
  });
  getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
  getContractById.mockResolvedValue(makeContract());
  getOrganizationMembers.mockResolvedValue([
    {
      user_id: "owner-1",
      user: { full_name: "Owner One", notification_email: "owner@example.com" }
    }
  ]);
  getCounterparties.mockResolvedValue([]);
  getContracts.mockResolvedValue([makeContract()]);
  getContractFacets.mockResolvedValue({
    owners: [],
    departments: [],
    statusTags: []
  });
  buildRiskQueueRow.mockReturnValue(makeRiskExplanation());
  buildRiskQueueView.mockReturnValue(makeRiskQueueDashboard());
  buildFinancialDashboardView.mockReturnValue(makeFinancialDashboard());
  getProcurementAnalyticsDashboard.mockResolvedValue(makeProcurementDashboard());
  createAuditLog.mockResolvedValue(undefined);
  auditRiskBadgeViewed.mockResolvedValue(undefined);
  auditRiskQueueViewed.mockResolvedValue(undefined);
  auditFinancialIntelligenceViewed.mockResolvedValue(undefined);
  auditProcurementAnalyticsViewed.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

async function renderContractDetailForCurrentBilling() {
  cleanup();
  const Page = (await import("@/app/dashboard/contracts/[id]/page")).default;
  render(await Page({ params: { id: "contract-1" } }));
}

async function renderContractsListForCurrentBilling(searchParams: Record<string, string> = {}) {
  cleanup();
  const Page = (await import("@/app/dashboard/contracts/page")).default;
  render(await Page({ searchParams }));
}

async function getSharedContractsListRiskViewerExpectation(input: {
  userId: string;
  role: "admin" | "operator" | "reviewer" | "owner";
}) {
  const { getIntelligenceSurfaceAccessMap } = await import("@/lib/intelligence/access");
  const accessMap = await getIntelligenceSurfaceAccessMap({
    context: {
      user: { id: input.userId },
      organizationId: "org-1",
      role: input.role
    } as never,
    surfaces: ["risk_badge", "risk_explanation"],
    contractOwnerUserId: input.role === "owner" ? input.userId : undefined
  });

  return {
    userId: input.userId,
    role: input.role,
    showRiskBadge: accessMap.accessBySurface.risk_badge.allowed,
    showRiskExplanation: accessMap.accessBySurface.risk_explanation.allowed
  };
}

async function expectDashboardPageAccess(input: {
  pageImport:
    | "@/app/dashboard/risk-queue/page"
    | "@/app/dashboard/financial-intelligence/page"
    | "@/app/dashboard/procurement-analytics/page";
  props: Record<string, unknown>;
  allowed: boolean;
  heading: string;
  expectFetched: () => void;
  expectBlockedBeforeFetch: () => void;
  expectVisibleWhenAllowed?: () => void;
}) {
  cleanup();
  const Page = (await import(input.pageImport)).default;

  if (!input.allowed) {
    await expect(Page(input.props as never)).rejects.toThrow("REDIRECT:/dashboard");
    input.expectBlockedBeforeFetch();
    return;
  }

  render(await Page(input.props as never));
  expect(screen.getByRole("heading", { name: input.heading })).toBeInTheDocument();
  input.expectFetched();
  input.expectVisibleWhenAllowed?.();
}

describe("intelligence surface entitlement consistency", () => {
  for (const scenario of BILLING_STATE_MATRIX) {
    it(`keeps contract detail, contracts list, risk queue, financial intelligence, and procurement analytics aligned for ${scenario.name}`, async () => {
      getBillingSnapshot.mockResolvedValue(scenario.snapshot);

      await renderContractDetailForCurrentBilling();

      if (scenario.expected.contractDetail.badge && !scenario.expected.contractDetail.explanation) {
        expect(screen.getByText("Risk badge high")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("Risk badge high")).not.toBeInTheDocument();
      }

      if (scenario.expected.contractDetail.explanation) {
        expect(screen.getByText("Risk explanation drawer")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("Risk explanation drawer")).not.toBeInTheDocument();
      }

      if (scenario.expected.contractDetail.badge) {
        expect(auditRiskBadgeViewed).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: "org-1",
            contractId: "contract-1"
          })
        );
      } else {
        expect(auditRiskBadgeViewed).not.toHaveBeenCalled();
      }

      vi.clearAllMocks();
      contractsTableSpy.mockReset();
      requireOrganization.mockResolvedValue({
        user: { id: "admin-1" },
        organizationId: "org-1",
        role: "admin"
      });
      getBillingSnapshot.mockResolvedValue(scenario.snapshot);
      getContracts.mockResolvedValue([makeContract()]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      const sharedRiskViewer = await getSharedContractsListRiskViewerExpectation({
        userId: "admin-1",
        role: "admin"
      });

      await renderContractsListForCurrentBilling();
      expect(screen.getByRole("heading", { name: "Contracts" })).toBeInTheDocument();
      expect(getContracts).toHaveBeenCalledWith("org-1", "all", {
        ownerUserId: undefined,
        department: undefined,
        statusTag: undefined
      });
      expect(getContractFacets).toHaveBeenCalledWith("org-1");
      expect(contractsTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          riskViewer: expect.objectContaining({
            userId: "admin-1",
            role: "admin",
            showRiskBadge: scenario.expected.contractsList.badge,
            showRiskExplanation: scenario.expected.contractsList.explanation
          })
        })
      );
      expect(contractsTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          riskViewer: sharedRiskViewer
        })
      );

      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: "admin-1" },
        organizationId: "org-1",
        role: "admin"
      });
      getBillingSnapshot.mockResolvedValue(scenario.snapshot);
      getContracts.mockResolvedValue([makeContract()]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      getCounterparties.mockResolvedValue([]);
      buildRiskQueueView.mockReturnValue(makeRiskQueueDashboard());
      auditRiskQueueViewed.mockResolvedValue(undefined);

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/risk-queue/page",
        props: { searchParams: {} },
        allowed: scenario.expected.riskQueueAllowed,
        heading: "Risk Queue",
        expectFetched: () => {
          expect(getContracts).toHaveBeenCalledWith("org-1", "all", {
            ownerUserId: undefined,
            department: undefined
          });
          expect(getContractFacets).toHaveBeenCalledWith("org-1");
          expect(getCounterparties).toHaveBeenCalledWith("org-1");
          expect(auditRiskQueueViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getContracts).not.toHaveBeenCalled();
          expect(getContractFacets).not.toHaveBeenCalled();
          expect(getCounterparties).not.toHaveBeenCalled();
          expect(auditRiskQueueViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Contracts in queue")).toBeInTheDocument();
          expect(screen.getByText("Risk queue table")).toBeInTheDocument();
          expect(screen.getByText("Risk filters")).toBeInTheDocument();
        }
      });

      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: "admin-1" },
        organizationId: "org-1",
        role: "admin"
      });
      getBillingSnapshot.mockResolvedValue(scenario.snapshot);
      getContracts.mockResolvedValue([makeContract()]);
      buildFinancialDashboardView.mockReturnValue(makeFinancialDashboard());
      auditFinancialIntelligenceViewed.mockResolvedValue(undefined);

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/financial-intelligence/page",
        props: {},
        allowed: scenario.expected.financialAllowed,
        heading: "Financial Intelligence",
        expectFetched: () => {
          expect(getContracts).toHaveBeenCalledWith("org-1", "all");
          expect(auditFinancialIntelligenceViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getContracts).not.toHaveBeenCalled();
          expect(auditFinancialIntelligenceViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Renewal exposure next 30 days")).toBeInTheDocument();
          expect(screen.getByText("Trust and data warnings")).toBeInTheDocument();
        }
      });

      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: "admin-1" },
        organizationId: "org-1",
        role: "admin"
      });
      getBillingSnapshot.mockResolvedValue(scenario.snapshot);
      getProcurementAnalyticsDashboard.mockResolvedValue(makeProcurementDashboard());
      auditProcurementAnalyticsViewed.mockResolvedValue(undefined);

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/procurement-analytics/page",
        props: { searchParams: {} },
        allowed: scenario.expected.procurementAllowed,
        heading: "Procurement Analytics",
        expectFetched: () => {
          expect(getProcurementAnalyticsDashboard).toHaveBeenCalledWith("org-1", {
            department: undefined,
            ownerUserId: undefined,
            counterpartyName: undefined,
            dueWindowDays: null,
            trustStatus: "all"
          });
          expect(auditProcurementAnalyticsViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getProcurementAnalyticsDashboard).not.toHaveBeenCalled();
          expect(auditProcurementAnalyticsViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Contracts in scope")).toBeInTheDocument();
          expect(screen.getByText("Top vendors by upcoming renewal exposure")).toBeInTheDocument();
          expect(screen.getByText("Renewal outcome history")).toBeInTheDocument();
        }
      });
    });
  }

  it("blocks owners from risk access on contract detail when they do not own the contract", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
    getContractById.mockResolvedValue({
      ...makeContract(),
      owner_user_id: "owner-2",
      owner_name: "Someone Else"
    });

    await renderContractDetailForCurrentBilling();

    expect(screen.queryByText("Risk badge high")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk explanation drawer")).not.toBeInTheDocument();
    expect(auditRiskBadgeViewed).not.toHaveBeenCalled();
  });

  it("documents the intentional difference that owners can see their own contract risk while portfolio intelligence stays blocked", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());

    await renderContractDetailForCurrentBilling();
    expect(screen.queryByText("Risk explanation drawer")).toBeInTheDocument();

    vi.clearAllMocks();
    contractsTableSpy.mockReset();
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
    getContracts.mockResolvedValue([makeContract()]);
    getContractFacets.mockResolvedValue({
      owners: [],
      departments: [],
      statusTags: []
    });
    const sharedRiskViewer = await getSharedContractsListRiskViewerExpectation({
      userId: "owner-1",
      role: "owner"
    });

    await renderContractsListForCurrentBilling();
    expect(contractsTableSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        riskViewer: sharedRiskViewer
      })
    );

    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());

    await expectDashboardPageAccess({
      pageImport: "@/app/dashboard/risk-queue/page",
      props: { searchParams: {} },
      allowed: false,
      heading: "Risk Queue",
      expectFetched: () => {},
      expectBlockedBeforeFetch: () => {
        expect(getContracts).not.toHaveBeenCalled();
        expect(auditRiskQueueViewed).not.toHaveBeenCalled();
      }
    });

    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());

    await expectDashboardPageAccess({
      pageImport: "@/app/dashboard/financial-intelligence/page",
      props: {},
      allowed: false,
      heading: "Financial Intelligence",
      expectFetched: () => {},
      expectBlockedBeforeFetch: () => {
        expect(getContracts).not.toHaveBeenCalled();
        expect(auditFinancialIntelligenceViewed).not.toHaveBeenCalled();
      }
    });

    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());

    await expectDashboardPageAccess({
      pageImport: "@/app/dashboard/procurement-analytics/page",
      props: { searchParams: {} },
      allowed: false,
      heading: "Procurement Analytics",
      expectFetched: () => {},
      expectBlockedBeforeFetch: () => {
        expect(getProcurementAnalyticsDashboard).not.toHaveBeenCalled();
        expect(auditProcurementAnalyticsViewed).not.toHaveBeenCalled();
      }
    });
  });

  it("keeps contracts list risk visibility aligned with contract detail for admin, operator, and reviewer on growth", async () => {
    const roleCases = [
      { role: "admin", userId: "admin-1" },
      { role: "operator", userId: "operator-1" },
      { role: "reviewer", userId: "reviewer-1" }
    ] as const;

    for (const roleCase of roleCases) {
      vi.clearAllMocks();
      contractsTableSpy.mockReset();
      requireOrganization.mockResolvedValue({
        user: { id: roleCase.userId },
        organizationId: "org-1",
        role: roleCase.role
      });
      getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
      getContractById.mockResolvedValue(makeContract());
      getOrganizationMembers.mockResolvedValue([
        {
          user_id: "owner-1",
          user: { full_name: "Owner One", notification_email: "owner@example.com" }
        }
      ]);
      getCounterparties.mockResolvedValue([]);
      getContracts.mockResolvedValue([makeContract()]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      buildRiskQueueRow.mockReturnValue(makeRiskExplanation());
      auditRiskBadgeViewed.mockResolvedValue(undefined);
      const sharedRiskViewer = await getSharedContractsListRiskViewerExpectation({
        userId: roleCase.userId,
        role: roleCase.role
      });

      await renderContractDetailForCurrentBilling();
      expect(screen.getByText("Risk explanation drawer")).toBeInTheDocument();

      await renderContractsListForCurrentBilling();
      expect(contractsTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          riskViewer: sharedRiskViewer
        })
      );
    }
  });

  it("keeps portfolio dashboard role gates aligned with user-visible page behavior on growth", async () => {
    const roleCases = [
      {
        role: "admin",
        userId: "admin-1",
        expected: {
          riskQueueAllowed: true,
          financialAllowed: true,
          procurementAllowed: true
        }
      },
      {
        role: "operator",
        userId: "operator-1",
        expected: {
          riskQueueAllowed: true,
          financialAllowed: false,
          procurementAllowed: true
        }
      },
      {
        role: "reviewer",
        userId: "reviewer-1",
        expected: {
          riskQueueAllowed: true,
          financialAllowed: false,
          procurementAllowed: false
        }
      }
    ] as const;

    for (const roleCase of roleCases) {
      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: roleCase.userId },
        organizationId: "org-1",
        role: roleCase.role
      });
      getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
      getContracts.mockResolvedValue([makeContract()]);
      getContractFacets.mockResolvedValue({
        owners: [],
        departments: [],
        statusTags: []
      });
      getCounterparties.mockResolvedValue([]);
      buildRiskQueueView.mockReturnValue(makeRiskQueueDashboard());

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/risk-queue/page",
        props: { searchParams: {} },
        allowed: roleCase.expected.riskQueueAllowed,
        heading: "Risk Queue",
        expectFetched: () => {
          expect(getContracts).toHaveBeenCalled();
          expect(auditRiskQueueViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getContracts).not.toHaveBeenCalled();
          expect(auditRiskQueueViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Contracts in queue")).toBeInTheDocument();
        }
      });

      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: roleCase.userId },
        organizationId: "org-1",
        role: roleCase.role
      });
      getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
      getContracts.mockResolvedValue([makeContract()]);
      buildFinancialDashboardView.mockReturnValue(makeFinancialDashboard());

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/financial-intelligence/page",
        props: {},
        allowed: roleCase.expected.financialAllowed,
        heading: "Financial Intelligence",
        expectFetched: () => {
          expect(getContracts).toHaveBeenCalled();
          expect(auditFinancialIntelligenceViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getContracts).not.toHaveBeenCalled();
          expect(auditFinancialIntelligenceViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Trust and data warnings")).toBeInTheDocument();
        }
      });

      vi.clearAllMocks();
      requireOrganization.mockResolvedValue({
        user: { id: roleCase.userId },
        organizationId: "org-1",
        role: roleCase.role
      });
      getBillingSnapshot.mockResolvedValue(makeBillingSnapshot());
      getProcurementAnalyticsDashboard.mockResolvedValue(makeProcurementDashboard());

      await expectDashboardPageAccess({
        pageImport: "@/app/dashboard/procurement-analytics/page",
        props: { searchParams: {} },
        allowed: roleCase.expected.procurementAllowed,
        heading: "Procurement Analytics",
        expectFetched: () => {
          expect(getProcurementAnalyticsDashboard).toHaveBeenCalled();
          expect(auditProcurementAnalyticsViewed).toHaveBeenCalled();
        },
        expectBlockedBeforeFetch: () => {
          expect(getProcurementAnalyticsDashboard).not.toHaveBeenCalled();
          expect(auditProcurementAnalyticsViewed).not.toHaveBeenCalled();
        },
        expectVisibleWhenAllowed: () => {
          expect(screen.getByText("Contracts in scope")).toBeInTheDocument();
        }
      });
    }
  });
});
