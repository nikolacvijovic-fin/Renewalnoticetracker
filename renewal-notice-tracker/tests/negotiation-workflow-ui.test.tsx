import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NegotiationWorkflowPanel } from "@/components/negotiation-workflow/negotiation-workflow-panel";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import type {
  NegotiationBrief,
  VendorCommunicationDraft
} from "@/lib/negotiation-workflow/negotiation-types";

vi.mock("@/lib/actions/negotiation-workflow", () => ({
  approveNegotiationBriefFormAction: vi.fn(),
  approveVendorCommunicationDraftForCopyFormAction: vi.fn(),
  archiveNegotiationBriefFormAction: vi.fn(),
  archiveVendorCommunicationDraftFormAction: vi.fn(),
  createNegotiationBriefFormAction: vi.fn(),
  createNegotiationPlaybookItemFormAction: vi.fn(),
  createVendorCommunicationDraftFormAction: vi.fn(),
  recomputeNegotiationBriefFormAction: vi.fn(),
  regenerateVendorCommunicationDraftFormAction: vi.fn(),
  rejectNegotiationBriefFormAction: vi.fn(),
  rejectVendorCommunicationDraftFormAction: vi.fn(),
  submitNegotiationBriefFormAction: vi.fn(),
  submitVendorCommunicationDraftFormAction: vi.fn()
}));

afterEach(() => cleanup());

function decision(overrides: Partial<CommercialDecision> = {}): CommercialDecision {
  return {
    id: "decision-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    created_by_user_id: "user-1",
    recommended_action: "renegotiate",
    decision_status: "approved",
    negotiation_posture: "challenge_increase",
    commercial_risk_level: "critical",
    evidence_confidence: 0.92,
    estimated_savings_amount: 12000,
    currency: "USD",
    commercial_impact: {},
    renewal_deadline: "2030-05-01",
    notice_deadline: "2030-03-01",
    owner_user_id: "owner-1",
    approver_user_id: "approver-1",
    decision_summary: "Renegotiate this renewal.",
    blocker_codes: [],
    warning_codes: [],
    finalized_at: null,
    approved_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

function brief(overrides: Partial<NegotiationBrief> = {}): NegotiationBrief {
  return {
    id: "brief-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    created_by_user_id: "user-1",
    owner_user_id: "owner-1",
    approver_user_id: "approver-1",
    status: "approved",
    strategy: "challenge_price_increase",
    executive_summary: "Commercial decision recommends renegotiate.",
    target_ask: "Challenge the price increase.",
    fallback_position: "Request extension.",
    evidence_summary: {},
    commercial_risk_summary: "Critical quote increase.",
    savings_argument: "Use savings evidence.",
    deadline_risk: "Notice deadline: 2030-03-01.",
    blocker_codes: [],
    warning_codes: [],
    review_flags: [],
    confidence_score: 0.92,
    submitted_at: null,
    approved_at: "2030-01-02T00:00:00.000Z",
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

function draft(overrides: Partial<VendorCommunicationDraft> = {}): VendorCommunicationDraft {
  return {
    id: "draft-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    negotiation_brief_id: "brief-1",
    created_by_user_id: "user-1",
    approver_user_id: "approver-1",
    status: "in_approval",
    channel: "email",
    tone: "firm",
    subject: "Draft only: renewal commercial review",
    draft_body: "[INTERNAL DRAFT ONLY - DO NOT SEND AUTOMATICALLY]\n\nManual copy only.",
    internal_reviewer_note: "Review first.",
    evidence_trace: {},
    submitted_at: "2030-01-02T00:00:00.000Z",
    approved_for_copy_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

function renderPanel(input: {
  decisionOverride?: Partial<CommercialDecision>;
  briefOverride?: Partial<NegotiationBrief> | null;
  draftOverride?: Partial<VendorCommunicationDraft> | null;
  canAct?: boolean;
  currentUserId?: string;
} = {}) {
  const currentBrief = input.briefOverride === null ? null : brief(input.briefOverride ?? {});
  const currentDraft = input.draftOverride === null ? null : draft(input.draftOverride ?? {});
  return render(
    <NegotiationWorkflowPanel
      decision={decision(input.decisionOverride)}
      brief={currentBrief}
      evidenceLinks={[]}
      drafts={currentDraft ? [currentDraft] : []}
      approvalSteps={[]}
      playbookItems={[]}
      approverOptions={[{ userId: "approver-1", label: "Priya Approver" }]}
      currentUserId={input.currentUserId ?? "approver-1"}
      canAct={input.canAct ?? true}
    />
  );
}

describe("NegotiationWorkflowPanel", () => {
  it("shows only for renegotiate, escalate, cancel, or needs-review decisions", () => {
    renderPanel({ decisionOverride: { recommended_action: "renew" }, briefOverride: null, draftOverride: null });
    expect(screen.queryByText("AI Negotiation Brief")).not.toBeInTheDocument();
    cleanup();

    renderPanel({ decisionOverride: { recommended_action: "needs_review" }, briefOverride: null, draftOverride: null });
    expect(screen.getByText("AI Negotiation Brief")).toBeInTheDocument();
    expect(screen.getByText("Create negotiation brief")).toBeInTheDocument();
  });

  it("renders brief strategy, blockers, evidence confidence, and draft-only state", () => {
    renderPanel({
      briefOverride: { status: "in_approval", blocker_codes: ["missing_quote_comparison"], review_flags: ["low_confidence_evidence"] },
      draftOverride: null
    });

    expect(screen.getByText("challenge price increase")).toBeInTheDocument();
    expect(screen.getByText("missing_quote_comparison, low_confidence_evidence")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("draft only")).toBeInTheDocument();
  });

  it("never renders a vendor send button and approval only means copy", () => {
    renderPanel();

    expect(screen.getByText("no sending")).toBeInTheDocument();
    expect(screen.getByText("Approve for copy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send$/i })).not.toBeInTheDocument();
  });

  it("hides approval controls from users who are not assigned approver", () => {
    renderPanel({ currentUserId: "reviewer-2" });

    expect(screen.queryByText("Approve for copy")).not.toBeInTheDocument();
    expect(screen.getByText("Vendor communication draft")).toBeInTheDocument();
  });
});
