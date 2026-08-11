import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const getContractById = vi.fn();
const getCounterparties = vi.fn();
const getOrganizationMembers = vi.fn();
const getContractRenewalActionRequests = vi.fn();
const getContractPendingRenewalActionRequestCount = vi.fn();
const getPhase1TrustState = vi.fn();
const getPhase1ReviewMode = vi.fn();
const listPhase1ActiveReviewDirtyFlags = vi.fn();
const buildRiskQueueRow = vi.fn();
const getIntelligenceSurfaceAccessMap = vi.fn();
const auditRiskBadgeViewed = vi.fn();
const auditRiskExplanationViewed = vi.fn();
const auditRiskScoreRecalculated = vi.fn();
const getContractAuditTimeline = vi.fn();
const listContractExtractionRuns = vi.fn();
const listContractExtractedFields = vi.fn();
const listQuoteComparisons = vi.fn();
const listQuoteFindings = vi.fn();
const listSavingsOpportunities = vi.fn();
const getSaasOptOutStatusForContract = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/lib/auth", () => ({
  requireOrganization,
  hasRequiredRole: (role: string, allowedRoles: string[]) => allowedRoles.includes(role)
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContractById,
  getCounterparties,
  getOrganizationMembers,
  getContractRenewalActionRequests,
  getContractPendingRenewalActionRequestCount
}));

vi.mock("@/lib/actions/contracts", () => ({
  assignContractOwnerAction: vi.fn(),
  completeRenewalActionRequestAction: vi.fn(),
  dismissRenewalActionRequestAction: vi.fn(),
  recordSampleContractOpened: vi.fn(),
  requestRenewalActionAction: vi.fn()
}));

vi.mock("@/lib/actions/contracts/sample", () => ({
  removeSampleContractAction: vi.fn()
}));

vi.mock("@/lib/contracts/phase1-pilot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/phase1-pilot")>();
  return {
    ...actual,
    listPhase1ActiveReviewDirtyFlags,
    getPhase1ReviewMode,
    getPhase1TrustState
  };
});

vi.mock("@/lib/contracts/shipped-reminder-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/shipped-reminder-policy")>();
  return {
    ...actual,
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
  };
});

vi.mock("@/lib/intelligence/risk/dashboard", () => ({
  buildRiskQueueRow,
  getRiskConfidenceLabel: (value: string) => value
}));

vi.mock("@/lib/intelligence/access", () => ({
  getIntelligenceSurfaceAccessMap
}));

vi.mock("@/lib/intelligence/audit", () => ({
  auditRiskBadgeViewed,
  auditRiskExplanationViewed,
  auditRiskScoreRecalculated
}));

vi.mock("@/lib/enterprise-audit/audit-queries", () => ({
  getContractAuditTimeline
}));

vi.mock("@/lib/contract-intelligence/extraction-runs", () => ({
  listContractExtractionRuns,
  listContractExtractedFields
}));

vi.mock("@/lib/quote-comparison/quote-comparison", () => ({
  listQuoteComparisons,
  listQuoteFindings,
  listSavingsOpportunities
}));

vi.mock("@/lib/saas/queries", () => ({
  getSaasOptOutStatusForContract
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
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

vi.mock("@/components/contracts/contract-enterprise-audit-timeline", () => ({
  ContractEnterpriseAuditTimeline: () => <div>Enterprise audit timeline</div>
}));

vi.mock("@/components/contracts/contract-secondary-tabs", () => ({
  ContractSecondaryTabs: () => <div>Secondary tabs</div>
}));

vi.mock("@/components/contracts/readiness-score-card", () => ({
  ReadinessScoreCard: () => <div>Readiness score</div>
}));

vi.mock("@/components/contracts/trusted-reminder-blockers", () => ({
  TrustedReminderBlockers: () => <div>Trusted reminder blockers</div>
}));

vi.mock("@/components/contracts/contract-onboarding-panel", () => ({
  ContractOnboardingPanel: () => <div>Contract onboarding</div>
}));

vi.mock("@/components/contracts/contract-extraction-review-panel", () => ({
  ContractExtractionReviewPanel: () => <div>Extraction review</div>
}));

vi.mock("@/components/contracts/renewal-quote-comparison-panel", () => ({
  RenewalQuoteComparisonPanel: () => <div>Quote comparison</div>
}));

vi.mock("@/components/contracts/decision-loop-ledger", () => ({
  DecisionLoopLedger: () => <div>Decision loop ledger</div>
}));

vi.mock("@/components/contracts/manual-renewal-template-panel", () => ({
  ManualRenewalTemplatePanel: () => <div>Manual template panel</div>
}));

vi.mock("@/components/customer-feedback/customer-feedback-panel", () => ({
  CustomerFeedbackPanel: () => <div>Customer feedback</div>,
  DeadlineCorrectnessFeedback: () => <div>Deadline feedback</div>
}));

vi.mock("@/components/contracts/contract-detail-shell", () => ({
  ContractDetailShell: ({
    badges,
    reviewPanel,
    ownerReminderPanel,
    decisionCyclePanel,
    secondaryPanel
  }: {
    badges: ReactNode;
    reviewPanel: ReactNode;
    ownerReminderPanel: ReactNode;
    decisionCyclePanel: ReactNode;
    secondaryPanel: ReactNode;
  }) => (
    <div>
      <div>{badges}</div>
      <div>{reviewPanel}</div>
      <div>{ownerReminderPanel}</div>
      <div>{decisionCyclePanel}</div>
      <div>{secondaryPanel}</div>
    </div>
  )
}));

vi.mock("@/components/contracts/risk-explanation-drawer", () => ({
  RiskExplanationDrawer: ({ auditSurface }: { auditSurface: string }) => (
    <div>{`Risk explanation drawer ${auditSurface}`}</div>
  )
}));

vi.mock("@/components/contracts/risk-badge", () => ({
  RiskBadge: ({ riskBand }: { riskBand: string }) => <div>{`Risk badge ${riskBand}`}</div>
}));

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
      has_weak_evidence: true,
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
    confidenceLevel: "low",
    reasons: [
      {
        factor: "missing_decision",
        label: "Missing decision",
        points: 10,
        detail: "Decision still missing."
      }
    ],
    missingDataWarnings: [
      { code: "warning", message: "One warning", severity: "warning" }
    ],
    explanationMetadata: {
      calculation_version: "risk_score.v1",
      input_data_version: "trusted_workflow_state.v1"
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrganization.mockResolvedValue({
    user: { id: "user-1" },
    organizationId: "org-1",
    role: "reviewer"
  });
  getContractById.mockResolvedValue(makeContract());
  getOrganizationMembers.mockResolvedValue([
    {
      user_id: "owner-1",
      user: { full_name: "Owner One", notification_email: "owner@example.com" }
    }
  ]);
  getCounterparties.mockResolvedValue([]);
  getContractRenewalActionRequests.mockResolvedValue([]);
  getContractPendingRenewalActionRequestCount.mockResolvedValue(0);
  getPhase1TrustState.mockReturnValue("Verified");
  getPhase1ReviewMode.mockReturnValue("fast_review");
  listPhase1ActiveReviewDirtyFlags.mockReturnValue([]);
  getContractAuditTimeline.mockResolvedValue([]);
  listContractExtractionRuns.mockResolvedValue([]);
  listContractExtractedFields.mockResolvedValue([]);
  listQuoteComparisons.mockResolvedValue([]);
  listQuoteFindings.mockResolvedValue([]);
  listSavingsOpportunities.mockResolvedValue([]);
  getSaasOptOutStatusForContract.mockResolvedValue(null);
  buildRiskQueueRow.mockReturnValue(makeRiskExplanation());
  getIntelligenceSurfaceAccessMap.mockResolvedValue({
    billingSnapshot: {
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle"
    },
    accessBySurface: {
      risk_badge: { allowed: true },
      risk_explanation: { allowed: true }
    }
  });
});

describe("Contract detail intelligence audit semantics", () => {
  it("logs only badge-level access on passive render when only badge visibility is allowed", async () => {
    getIntelligenceSurfaceAccessMap.mockResolvedValue({
      billingSnapshot: {
        organizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle"
      },
      accessBySurface: {
        risk_badge: { allowed: true },
        risk_explanation: { allowed: false }
      }
    });

    const Page = (await import("@/app/dashboard/contracts/[id]/page")).default;
    render(await Page({ params: { id: "contract-1" } }));

    expect(auditRiskBadgeViewed).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      contractId: "contract-1",
      riskBand: "high",
      lowConfidenceCount: 1,
      calculationVersion: "risk_score.v1",
      explanationAvailable: false
    });
    expect(auditRiskExplanationViewed).not.toHaveBeenCalled();
    expect(auditRiskScoreRecalculated).not.toHaveBeenCalled();
    expect(screen.getByText("Risk badge high")).toBeInTheDocument();
  }, 15000);

  it("does not log explanation or recalculation events during passive render even when the drawer is available", async () => {
    getIntelligenceSurfaceAccessMap.mockResolvedValue({
      billingSnapshot: {
        organizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle"
      },
      accessBySurface: {
        risk_badge: { allowed: true },
        risk_explanation: { allowed: true }
      }
    });

    const Page = (await import("@/app/dashboard/contracts/[id]/page")).default;
    render(await Page({ params: { id: "contract-1" } }));

    expect(auditRiskBadgeViewed).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "contract-1",
        explanationAvailable: true
      })
    );
    expect(auditRiskExplanationViewed).not.toHaveBeenCalled();
    expect(auditRiskScoreRecalculated).not.toHaveBeenCalled();
    expect(screen.getAllByText("Risk explanation drawer contract_detail").length).toBeGreaterThan(0);
  }, 15000);
});
