import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialDecisionEmptyState } from "@/components/commercial-decision/commercial-decision-empty-state";
import { CommercialDecisionWorkbenchPanel } from "@/components/commercial-decision/commercial-decision-workbench-panel";
import type {
  CommercialDecision,
  CommercialDecisionApprovalStep,
  CommercialDecisionEvidenceLink,
  CommercialDecisionSnapshot
} from "@/lib/commercial-decision-workbench/decision-types";

vi.mock("@/lib/actions/commercial-decision-workbench", () => ({
  addCommercialDecisionReviewerNoteFormAction: vi.fn(),
  approveCommercialDecisionFormAction: vi.fn(),
  archiveCommercialDecisionFormAction: vi.fn(),
  changeCommercialDecisionNegotiationPostureFormAction: vi.fn(),
  changeCommercialDecisionRecommendedActionFormAction: vi.fn(),
  createCommercialDecisionFormAction: vi.fn(),
  finalizeCommercialDecisionFormAction: vi.fn(),
  reassignCommercialDecisionApproverFormAction: vi.fn(),
  recomputeCommercialDecisionFormAction: vi.fn(),
  rejectCommercialDecisionFormAction: vi.fn(),
  submitCommercialDecisionForReviewFormAction: vi.fn(),
  submitCommercialDecisionForReviewWithApproverFormAction: vi.fn()
}));

afterEach(() => cleanup());

const decision: CommercialDecision = {
  id: "decision-1",
  organization_id: "org-1",
  contract_id: "contract-1",
  created_by_user_id: "user-1",
  recommended_action: "renegotiate",
  decision_status: "in_approval",
  negotiation_posture: "challenge_increase",
  commercial_risk_level: "critical",
  evidence_confidence: 0.91,
  estimated_savings_amount: 12000,
  currency: "USD",
  commercial_impact: {},
  renewal_deadline: "2030-05-01",
  notice_deadline: "2030-03-01",
  owner_user_id: "owner-1",
  approver_user_id: "approver-1",
  decision_summary: "Commercial evidence supports renegotiation before renewal approval.",
  blocker_codes: ["missing_quote_comparison"],
  warning_codes: ["critical_quote_finding"],
  finalized_at: null,
  approved_at: null,
  rejected_at: null,
  archived_at: null,
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z"
};

const evidenceLinks: CommercialDecisionEvidenceLink[] = [
  {
    id: "link-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    decision_id: "decision-1",
    evidence_type: "renewal_quote_finding",
    evidence_id: "finding-1",
    evidence_label: "Critical renewal price increase",
    confidence: 0.94,
    risk_level: "critical",
    metadata: {},
    created_by_user_id: "user-1",
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  }
];

const approvals: CommercialDecisionApprovalStep[] = [
  {
    id: "step-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    decision_id: "decision-1",
    step_order: 1,
    status: "pending",
    approver_user_id: "approver-1",
    acted_by_user_id: null,
    reviewer_note: null,
    reason_code: null,
    acted_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  }
];

const snapshots: CommercialDecisionSnapshot[] = [
  {
    id: "snapshot-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    decision_id: "decision-1",
    created_by_user_id: "user-1",
    snapshot_type: "scoring",
    recommended_action: "renegotiate",
    decision_status: "in_approval",
    negotiation_posture: "challenge_increase",
    commercial_risk_level: "critical",
    evidence_confidence: 0.91,
    estimated_savings_amount: 12000,
    currency: "USD",
    blocker_codes: ["missing_quote_comparison"],
    warning_codes: ["critical_quote_finding"],
    evidence_summary: {},
    audit_snapshot: {},
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  }
];

describe("CommercialDecisionWorkbenchPanel", () => {
  function renderPanel(overrides: Partial<CommercialDecision> = {}, options: { currentUserId?: string; canAct?: boolean; canReassignApprover?: boolean } = {}) {
    return render(
      <CommercialDecisionWorkbenchPanel
        decision={{ ...decision, ...overrides }}
        evidenceLinks={evidenceLinks}
        approvalSteps={approvals}
        snapshots={snapshots}
        ownerLabel="Alex Owner"
        approverLabel="Priya Approver"
        approverOptions={[{ userId: "approver-1", label: "Priya Approver" }]}
        currentUserId={options.currentUserId ?? "approver-1"}
        canAct={options.canAct ?? true}
        canReassignApprover={options.canReassignApprover ?? true}
        negotiationWorkflow={{
          brief: null,
          evidenceLinks: [],
          drafts: [],
          approvalSteps: [],
          playbookItems: []
        }}
      />
    );
  }

  it("renders the decision truth users need to act", () => {
    renderPanel();

    expect(screen.getByText("Commercial Decision Workbench")).toBeInTheDocument();
    expect(screen.getAllByText("renegotiate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("critical").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("challenge increase").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("missing quote comparison")).toBeInTheDocument();
    expect(screen.getByText("critical quote finding")).toBeInTheDocument();
    expect(screen.getByText("Critical renewal price increase")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Alex Owner")).toBeInTheDocument();
  });

  it("hides mutation actions from read-only viewers", () => {
    renderPanel({}, { canAct: false });

    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.getByText("Commercial Decision Workbench")).toBeInTheDocument();
  });

  it("shows only assigned-approver controls while in approval", () => {
    renderPanel({}, { currentUserId: "reviewer-2" });

    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
    expect(screen.getByText("Only the assigned approver can approve or reject this decision.")).toBeInTheDocument();
  });

  it("shows finalize only after approval and hides mutating controls for finalized decisions", () => {
    renderPanel({ decision_status: "approved", blocker_codes: [] });
    expect(screen.getByText("Finalize")).toBeInTheDocument();
    cleanup();

    renderPanel({ decision_status: "finalized", blocker_codes: [] });
    expect(screen.queryByText("Finalize")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Record note snapshot")).not.toBeInTheDocument();
  });

  it("renders a read-only empty state with explicit creation action", () => {
    render(<CommercialDecisionEmptyState contractId="contract-1" canCreate />);

    expect(screen.getByText("No commercial decision has been created yet")).toBeInTheDocument();
    expect(screen.getByText("Create decision")).toBeInTheDocument();
  });
});
