import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalOutreachPanel } from "@/components/internal-outreach/internal-outreach-panel";
import type {
  InternalOutreachDetail
} from "@/components/internal-outreach/internal-outreach-panel";
import type { InternalOutreachOpportunity } from "@/lib/internal-outreach-intelligence/outreach-types";

vi.mock("@/lib/actions/internal-outreach-intelligence", () => ({
  approveOutreachDraftForCopyFormAction: vi.fn(),
  archiveOutreachDraftFormAction: vi.fn(),
  archiveOutreachOpportunityFormAction: vi.fn(),
  createOutreachDraftFormAction: vi.fn(),
  createOutreachPlaybookItemFormAction: vi.fn(),
  createOutreachSuppressionFormAction: vi.fn(),
  dismissDuplicateOutreachOpportunityFormAction: vi.fn(),
  dismissOutreachOpportunityFormAction: vi.fn(),
  refreshOutreachOpportunityIntelligenceFormAction: vi.fn(),
  recomputeOutreachOpportunityFormAction: vi.fn(),
  regenerateOutreachDraftFormAction: vi.fn(),
  rejectOutreachDraftFormAction: vi.fn(),
  submitOutreachDraftForApprovalFormAction: vi.fn()
}));

afterEach(() => cleanup());

function item(overrides: Partial<InternalOutreachDetail> = {}): InternalOutreachDetail {
  const opportunity: InternalOutreachOpportunity = {
    id: "opportunity-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    negotiation_brief_id: null,
    created_by_user_id: "user-1",
    owner_user_id: "owner-1",
    approver_user_id: "approver-1",
    opportunity_type: "price_increase",
    status: "ready_for_review",
    priority: "high",
    audience: "procurement",
    recommended_channel: "internal_email",
    reason_summary: "Renewal quote includes a price increase.",
    expected_commercial_impact: {},
    evidence_confidence: 0.91,
    due_date: "2030-03-01",
    renewal_deadline: "2030-05-01",
    blocker_codes: [],
    warning_codes: [],
    safety_status: "safe",
    safety_reasons: [],
    submitted_at: null,
    approved_for_copy_at: null,
    dismissed_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  };
  return {
    opportunity,
    evidenceLinks: [{
      id: "link-1",
      organization_id: "org-1",
      contract_id: "contract-1",
      commercial_decision_id: "decision-1",
      negotiation_brief_id: null,
      opportunity_id: "opportunity-1",
      evidence_type: "commercial_decision",
      evidence_id: "decision-1",
      evidence_label: "Commercial decision risk trigger",
      confidence: 0.91,
      metadata: {},
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    drafts: [],
    approvalSteps: [],
    playbookItems: [],
    suppressions: [],
    priorityScore: {
      priorityScore: 82,
      priorityBand: "high",
      urgencyReason: "Notice deadline is in 14 days.",
      commercialReason: "Evidence-backed commercial impact is approximately 25000.",
      nextBestAction: "Generate or route the internal draft for approval.",
      confidenceScore: 91,
      scoringBreakdown: { urgency: 25, commercialImpact: 18 }
    },
    audienceResolution: {
      audienceRole: "procurement_reviewer",
      audienceLabel: "Priya Procurement",
      userId: "owner-1",
      contactIdentifierHash: null,
      resolutionConfidence: 0.95,
      blockerCodes: [],
      warningCodes: []
    },
    sequencePlan: {
      steps: [
        {
          stepOrder: 1,
          stepType: "internal_owner_note",
          audience: "procurement",
          channel: "internal_email",
          purpose: "Confirm the internal owner and commercial objective.",
          dueDate: "2030-03-01",
          prerequisites: [],
          approvalRequired: false,
          copyAllowed: false,
          blockerCodes: []
        },
        {
          stepOrder: 2,
          stepType: "crm_note_prepare",
          audience: "procurement",
          channel: "crm_note",
          purpose: "Prepare a support-safe CRM note for manual copy into a configured system.",
          dueDate: "2030-03-01",
          prerequisites: [],
          approvalRequired: false,
          copyAllowed: true,
          blockerCodes: []
        }
      ],
      blockerCodes: []
    },
    crmNote: {
      crmNoteTitle: "Internal renewal outreach: Renewal quote price increase",
      crmNoteBodyPreview: "Internal CRM note only: Renewal quote price increase.",
      relatedContractId: "contract-1",
      relatedDecisionId: "decision-1",
      relatedOpportunityId: "opportunity-1",
      commercialTrigger: "Renewal quote price increase",
      recommendedNextStep: "Generate or route the internal draft for approval.",
      evidenceReferences: ["commercial_decision:Commercial decision risk trigger"],
      ownerUserId: "owner-1",
      dueDate: "2030-03-01",
      priorityBand: "high",
      syncStatus: "ready_for_manual_copy"
    },
    safetyReview: {
      safetyStatus: "safe",
      safetyReasons: [],
      blockedPhrases: [],
      unsupportedClaims: [],
      recommendedFix: null
    },
    ...overrides
  };
}

describe("InternalOutreachPanel", () => {
  it("renders opportunities as internal draft-only work without send controls", () => {
    render(
      <InternalOutreachPanel
        items={[item()]}
        approverOptions={[{ userId: "approver-1", label: "Priya Approver" }]}
        currentUserId="user-1"
        canAct
      />
    );

    expect(screen.getByText("Renewal quote includes a price increase.")).toBeInTheDocument();
    expect(screen.getByText("internal draft only")).toBeInTheDocument();
    expect(screen.getByText("no sending")).toBeInTheDocument();
    expect(screen.getByText("Priority score")).toBeInTheDocument();
    expect(screen.getByText("Audience resolution")).toBeInTheDocument();
    expect(screen.getByText("Recommended sequence")).toBeInTheDocument();
    expect(screen.getByText("CRM note preview")).toBeInTheDocument();
    expect(screen.getByText("Create draft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
  });

  it("shows approved-for-copy language without implying delivery", () => {
    render(
      <InternalOutreachPanel
        items={[item({
          drafts: [{
            id: "draft-1",
            organization_id: "org-1",
            contract_id: "contract-1",
            opportunity_id: "opportunity-1",
            created_by_user_id: "user-1",
            approver_user_id: "approver-1",
            status: "in_approval",
            audience: "procurement",
            channel: "internal_email",
            tone: "concise",
            title: "Internal draft",
            subject_or_heading: "Internal action needed",
            body_preview: "[INTERNAL DRAFT ONLY]\nManual copy only.",
            key_points: [],
            evidence_references: [],
            ask: "Review",
            next_step: "Approve",
            internal_reviewer_note: "Review",
            safety_status: "safe",
            safety_reasons: [],
            copy_allowed: false,
            submitted_at: null,
            approved_for_copy_at: null,
            rejected_at: null,
            archived_at: null,
            created_at: "2030-01-01T00:00:00.000Z",
            updated_at: "2030-01-01T00:00:00.000Z"
          }]
        })]}
        approverOptions={[{ userId: "approver-1", label: "Priya Approver" }]}
        currentUserId="approver-1"
        canAct
      />
    );

    expect(screen.getByText("manual copy only")).toBeInTheDocument();
    expect(screen.getByText("Approve for copy")).toBeInTheDocument();
    expect(screen.getByText(/does not send, sync, or deliver/i)).toBeInTheDocument();
  });

  it("shows active suppression as a blocker", () => {
    render(
      <InternalOutreachPanel
        items={[item({
          suppressions: [{
            id: "suppression-1",
            organization_id: "org-1",
            contract_id: "contract-1",
            opportunity_id: "opportunity-1",
            audience: "procurement",
            contact_identifier_hash: null,
            scoped_internal_user_id: null,
            reason_code: "manual_suppression",
            notes_preview: null,
            suppressed_by_user_id: "user-1",
            suppressed_at: "2030-01-01T00:00:00.000Z",
            expires_at: null,
            created_at: "2030-01-01T00:00:00.000Z",
            updated_at: "2030-01-01T00:00:00.000Z"
          }]
        })]}
        approverOptions={[]}
        currentUserId="user-1"
        canAct
      />
    );

    expect(screen.getByText(/Active suppression blocks draft generation or approval/i)).toBeInTheDocument();
    expect(screen.queryByText("Create draft")).not.toBeInTheDocument();
  });
});
