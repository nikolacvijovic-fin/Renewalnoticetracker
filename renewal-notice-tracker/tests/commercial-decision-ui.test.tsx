import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  finalizeCommercialDecisionFormAction: vi.fn(),
  recomputeCommercialDecisionFormAction: vi.fn(),
  rejectCommercialDecisionFormAction: vi.fn(),
  submitCommercialDecisionForReviewFormAction: vi.fn()
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
  it("renders the decision truth users need to act", () => {
    render(
      <CommercialDecisionWorkbenchPanel
        decision={decision}
        evidenceLinks={evidenceLinks}
        approvalSteps={approvals}
        snapshots={snapshots}
        ownerLabel="Alex Owner"
        approverLabel="Priya Approver"
        canAct
      />
    );

    expect(screen.getByText("Commercial Decision Workbench")).toBeInTheDocument();
    expect(screen.getAllByText("renegotiate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("critical").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("challenge increase").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("missing quote comparison")).toBeInTheDocument();
    expect(screen.getByText("critical quote finding")).toBeInTheDocument();
    expect(screen.getByText("Critical renewal price increase")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("hides mutation actions from read-only viewers", () => {
    render(
      <CommercialDecisionWorkbenchPanel
        decision={decision}
        evidenceLinks={evidenceLinks}
        approvalSteps={approvals}
        snapshots={snapshots}
        ownerLabel="Alex Owner"
        approverLabel="Priya Approver"
        canAct={false}
      />
    );

    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.getByText("Commercial Decision Workbench")).toBeInTheDocument();
  });
});
