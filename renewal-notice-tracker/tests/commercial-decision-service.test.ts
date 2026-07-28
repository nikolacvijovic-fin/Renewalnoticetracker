import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getAdminActiveCommercialDecisionByContractId: vi.fn(),
  getAdminCommercialDecisionById: vi.fn(),
  insertAdminCommercialDecision: vi.fn(),
  updateAdminCommercialDecision: vi.fn(),
  updateAdminCommercialDecisionStatus: vi.fn(),
  updateAdminCommercialDecisionRecommendedAction: vi.fn(),
  updateAdminCommercialDecisionNegotiationPosture: vi.fn(),
  insertAdminCommercialDecisionEvidenceLink: vi.fn(),
  insertAdminCommercialDecisionApprovalStep: vi.fn(),
  updateAdminCommercialDecisionApprovalStep: vi.fn(),
  insertAdminCommercialDecisionSnapshot: vi.fn(),
  listAdminCommercialDecisions: vi.fn(),
  listAdminCommercialDecisionEvidenceLinks: vi.fn(),
  listAdminCommercialDecisionApprovalSteps: vi.fn(),
  listAdminCommercialDecisionSnapshots: vi.fn()
}));
const audit = vi.hoisted(() => ({ recordEnterpriseAuditEvent: vi.fn() }));
const contractQueries = vi.hoisted(() => ({ getContractById: vi.fn() }));
const extraction = vi.hoisted(() => ({ listContractExtractedFields: vi.fn() }));
const quote = vi.hoisted(() => ({
  listQuoteComparisons: vi.fn(),
  listQuoteFindings: vi.fn(),
  listSavingsOpportunities: vi.fn()
}));

vi.mock("@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository", () => repo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => audit);
vi.mock("@/lib/contracts/kernel-queries", () => contractQueries);
vi.mock("@/lib/contract-intelligence/extraction-runs", () => extraction);
vi.mock("@/lib/quote-comparison/quote-comparison", () => quote);

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    created_by_user_id: "user-1",
    recommended_action: "needs_review",
    decision_status: "draft",
    negotiation_posture: "legal_review_required",
    commercial_risk_level: "medium",
    evidence_confidence: 0.7,
    estimated_savings_amount: null,
    currency: "USD",
    commercial_impact: {},
    renewal_deadline: "2030-05-01",
    notice_deadline: "2030-03-01",
    owner_user_id: "owner-1",
    approver_user_id: null,
    decision_summary: "Commercial evidence is ready for review.",
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

describe("commercial decision service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    repo.listAdminCommercialDecisionApprovalSteps.mockResolvedValue({ data: [], error: null });
    repo.insertAdminCommercialDecisionSnapshot.mockResolvedValue({
      data: {
        id: "snapshot-1",
        decision_id: "decision-1",
        snapshot_type: "created"
      },
      error: null
    });
  });

  it("creates a decision from scoped contract, extraction, quote, and savings evidence", async () => {
    repo.getAdminActiveCommercialDecisionByContractId.mockResolvedValue({ data: null, error: null });
    repo.insertAdminCommercialDecision.mockResolvedValue({
      data: decision({ decision_status: "ready_for_review", recommended_action: "renegotiate" }),
      error: null
    });
    repo.getAdminCommercialDecisionById.mockResolvedValue({
      data: decision({ decision_status: "ready_for_review", recommended_action: "renegotiate" }),
      error: null
    });
    contractQueries.getContractById.mockResolvedValue({
      id: "contract-1",
      owner_user_id: "owner-1",
      cycle_status: "active",
      renewal_decision_status: "undecided",
      contract_metadata: {
        renewal_date: "2030-05-01",
        notice_deadline_date: "2030-03-01"
      },
      reminders: [{ status: "scheduled" }]
    });
    extraction.listContractExtractedFields.mockResolvedValue([{ field_key: "renewal_date", confidence: 0.9 }]);
    quote.listQuoteComparisons.mockResolvedValue([
      {
        id: "comparison-1",
        status: "completed",
        overall_risk_level: "critical",
        price_delta_percent: 25,
        price_delta_amount: 10000,
        currency: "USD"
      }
    ]);
    quote.listQuoteFindings.mockResolvedValue([
      { id: "finding-1", finding_type: "price_increase", severity: "critical", confidence: 0.9, status: "open" }
    ]);
    quote.listSavingsOpportunities.mockResolvedValue([]);
    const { createCommercialDecisionForContract } = await import(
      "@/lib/commercial-decision-workbench/commercial-decision-workbench"
    );

    const result = await createCommercialDecisionForContract({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1"
    });

    expect(result.recommended_action).toBe("renegotiate");
    expect(repo.insertAdminCommercialDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        values: expect.objectContaining({
          recommended_action: "renegotiate",
          commercial_risk_level: "critical"
        })
      })
    );
    expect(audit.recordEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "commercial_decision.created" })
    );
  });

  it("does not approve decisions from draft", async () => {
    repo.getAdminCommercialDecisionById.mockResolvedValue({ data: decision({ decision_status: "draft" }), error: null });
    const { approveCommercialDecision } = await import("@/lib/commercial-decision-workbench/commercial-decision-workbench");

    await expect(
      approveCommercialDecision({ organizationId: "org-1", decisionId: "decision-1", actorUserId: "user-1" })
    ).rejects.toMatchObject({ name: "CommercialDecisionTransitionError" });
    expect(repo.updateAdminCommercialDecisionStatus).not.toHaveBeenCalled();
  });

  it("does not finalize without approval and never finalizes rejected decisions", async () => {
    repo.getAdminCommercialDecisionById.mockResolvedValue({ data: decision({ decision_status: "rejected" }), error: null });
    const { finalizeCommercialDecision } = await import(
      "@/lib/commercial-decision-workbench/commercial-decision-workbench"
    );

    await expect(
      finalizeCommercialDecision({ organizationId: "org-1", decisionId: "decision-1", actorUserId: "user-1" })
    ).rejects.toMatchObject({ name: "CommercialDecisionTransitionError" });
    expect(repo.updateAdminCommercialDecisionStatus).not.toHaveBeenCalled();
  });

  it("does not edit finalized decisions", async () => {
    repo.getAdminCommercialDecisionById.mockResolvedValue({ data: decision({ decision_status: "finalized" }), error: null });
    const { updateCommercialDecisionRecommendedAction } = await import(
      "@/lib/commercial-decision-workbench/commercial-decision-workbench"
    );

    await expect(
      updateCommercialDecisionRecommendedAction({
        organizationId: "org-1",
        decisionId: "decision-1",
        actorUserId: "user-1",
        recommendedAction: "cancel"
      })
    ).rejects.toMatchObject({ name: "CommercialDecisionTransitionError" });
    expect(repo.updateAdminCommercialDecisionRecommendedAction).not.toHaveBeenCalled();
  });

  it("records approval audit metadata without raw reviewer notes", async () => {
    repo.getAdminCommercialDecisionById.mockResolvedValue({
      data: decision({ decision_status: "in_approval" }),
      error: null
    });
    repo.updateAdminCommercialDecisionStatus.mockResolvedValue({
      data: decision({ decision_status: "approved", approved_at: "2030-01-01T00:00:00.000Z" }),
      error: null
    });
    repo.listAdminCommercialDecisionApprovalSteps.mockResolvedValue({
      data: [{ id: "step-1", status: "pending" }],
      error: null
    });
    repo.updateAdminCommercialDecisionApprovalStep.mockResolvedValue({ data: { id: "step-1", status: "approved" }, error: null });
    const { approveCommercialDecision } = await import("@/lib/commercial-decision-workbench/commercial-decision-workbench");

    await approveCommercialDecision({
      organizationId: "org-1",
      decisionId: "decision-1",
      actorUserId: "approver-1",
      reviewerNote: "raw contract text and note contents must not enter audit metadata"
    });

    const auditCalls = JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls);
    expect(auditCalls).toContain("reviewerNoteRecorded");
    expect(auditCalls).not.toContain("raw contract text");
    expect(auditCalls).not.toContain("note contents");
    expect(repo.updateAdminCommercialDecisionApprovalStep).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        approvalStepId: "step-1",
        values: expect.objectContaining({
          status: "approved",
          acted_by_user_id: "approver-1",
          reviewer_note: "Reviewer note redacted because it contained sensitive raw content markers."
        })
      })
    );
  });

  it("attaches evidence through organization-scoped repository calls", async () => {
    repo.getAdminCommercialDecisionById.mockResolvedValue({
      data: decision({ decision_status: "ready_for_review" }),
      error: null
    });
    repo.insertAdminCommercialDecisionEvidenceLink.mockResolvedValue({
      data: { id: "link-1", decision_id: "decision-1", evidence_type: "renewal_quote_finding" },
      error: null
    });
    const { attachDecisionEvidence } = await import("@/lib/commercial-decision-workbench/commercial-decision-workbench");

    await attachDecisionEvidence({
      organizationId: "org-1",
      decisionId: "decision-1",
      actorUserId: "user-1",
      evidenceType: "renewal_quote_finding",
      evidenceId: "finding-1",
      evidenceLabel: "Critical renewal price increase"
    });

    expect(repo.insertAdminCommercialDecisionEvidenceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        decisionId: "decision-1"
      })
    );
  });
});
