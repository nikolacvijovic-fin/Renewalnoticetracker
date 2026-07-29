import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getAdminActiveNegotiationBriefByDecisionId: vi.fn(),
  getAdminNegotiationBriefById: vi.fn(),
  getAdminVendorCommunicationDraftById: vi.fn(),
  insertAdminNegotiationBrief: vi.fn(),
  insertAdminNegotiationPlaybookItem: vi.fn(),
  insertAdminVendorCommunicationApprovalStep: vi.fn(),
  insertAdminVendorCommunicationDraft: vi.fn(),
  listAdminNegotiationBriefEvidenceLinks: vi.fn(),
  listAdminNegotiationPlaybookItems: vi.fn(),
  listAdminVendorCommunicationApprovalSteps: vi.fn(),
  listAdminVendorCommunicationDrafts: vi.fn(),
  updateAdminNegotiationBrief: vi.fn(),
  updateAdminNegotiationBriefStatus: vi.fn(),
  updateAdminVendorCommunicationApprovalStep: vi.fn(),
  updateAdminVendorCommunicationDraft: vi.fn(),
  updateAdminVendorCommunicationDraftStatus: vi.fn(),
  upsertAdminNegotiationBriefEvidenceLink: vi.fn()
}));
const commercialRepo = vi.hoisted(() => ({ getAdminCommercialDecisionById: vi.fn() }));
const audit = vi.hoisted(() => ({ recordEnterpriseAuditEvent: vi.fn() }));
const contracts = vi.hoisted(() => ({ getContractById: vi.fn() }));
const extraction = vi.hoisted(() => ({ listContractExtractedFields: vi.fn() }));
const quote = vi.hoisted(() => ({
  listQuoteComparisons: vi.fn(),
  listQuoteFindings: vi.fn(),
  listSavingsOpportunities: vi.fn()
}));

vi.mock("@/lib/negotiation-workflow/repositories/admin-negotiation-workflow-repository", () => repo);
vi.mock("@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository", () => commercialRepo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => audit);
vi.mock("@/lib/contracts/kernel-queries", () => contracts);
vi.mock("@/lib/contract-intelligence/extraction-runs", () => extraction);
vi.mock("@/lib/quote-comparison/quote-comparison", () => quote);

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    recommended_action: "renegotiate",
    commercial_risk_level: "critical",
    evidence_confidence: 0.9,
    currency: "USD",
    blocker_codes: [],
    warning_codes: [],
    owner_user_id: "owner-1",
    notice_deadline: "2030-03-01",
    ...overrides
  };
}

function brief(overrides: Record<string, unknown> = {}) {
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
    executive_summary: "Renegotiate this renewal.",
    target_ask: "Challenge the price increase.",
    fallback_position: "Request extension.",
    evidence_summary: {},
    commercial_risk_summary: "Critical increase.",
    savings_argument: "Use savings.",
    deadline_risk: "Notice deadline: 2030-03-01.",
    blocker_codes: [],
    warning_codes: [],
    review_flags: [],
    confidence_score: 0.9,
    submitted_at: null,
    approved_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  } as any;
}

function draft(overrides: Record<string, unknown> = {}) {
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
    tone: "neutral",
    subject: "Draft only",
    draft_body: "[INTERNAL DRAFT ONLY]",
    internal_reviewer_note: "Review.",
    evidence_trace: {},
    submitted_at: null,
    approved_for_copy_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  } as any;
}

describe("negotiation workflow service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    commercialRepo.getAdminCommercialDecisionById.mockResolvedValue({ data: decision(), error: null });
    contracts.getContractById.mockResolvedValue({ id: "contract-1" });
    extraction.listContractExtractedFields.mockResolvedValue([]);
    quote.listQuoteComparisons.mockResolvedValue([{ id: "comparison-1", status: "completed", price_delta_percent: 20, overall_risk_level: "critical" }]);
    quote.listQuoteFindings.mockResolvedValue([{ id: "finding-1", finding_type: "price_increase", severity: "critical", confidence: 0.9, status: "open" }]);
    quote.listSavingsOpportunities.mockResolvedValue([]);
    repo.upsertAdminNegotiationBriefEvidenceLink.mockResolvedValue({ data: { id: "link-1" }, error: null });
    repo.listAdminVendorCommunicationApprovalSteps.mockResolvedValue({ data: [], error: null });
  });

  it("creates a negotiation brief from scoped commercial decision evidence", async () => {
    repo.getAdminActiveNegotiationBriefByDecisionId.mockResolvedValue({ data: null, error: null });
    repo.insertAdminNegotiationBrief.mockResolvedValue({ data: brief({ status: "ready_for_review" }), error: null });
    const { createNegotiationBriefForDecision } = await import("@/lib/negotiation-workflow/negotiation-workflow");

    const result = await createNegotiationBriefForDecision({
      organizationId: "org-1",
      commercialDecisionId: "decision-1",
      actorUserId: "user-1"
    });

    expect(result.status).toBe("ready_for_review");
    expect(repo.insertAdminNegotiationBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        commercialDecisionId: "decision-1",
        values: expect.objectContaining({
          strategy: "challenge_price_increase",
          owner_user_id: "owner-1"
        })
      })
    );
    expect(audit.recordEnterpriseAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "negotiation_brief.created" }));
  });

  it("does not approve a vendor draft before the negotiation brief is approved", async () => {
    repo.getAdminVendorCommunicationDraftById.mockResolvedValue({ data: draft(), error: null });
    repo.getAdminNegotiationBriefById.mockResolvedValue({ data: brief({ status: "in_approval" }), error: null });
    const { approveVendorCommunicationDraftForCopy } = await import("@/lib/negotiation-workflow/negotiation-workflow");

    await expect(
      approveVendorCommunicationDraftForCopy({ organizationId: "org-1", draftId: "draft-1", actorUserId: "approver-1" })
    ).rejects.toMatchObject({ name: "NegotiationWorkflowTransitionError" });
    expect(repo.updateAdminVendorCommunicationDraftStatus).not.toHaveBeenCalled();
  });

  it("blocks rejected briefs from generating vendor drafts", async () => {
    repo.getAdminNegotiationBriefById.mockResolvedValue({ data: brief({ status: "rejected" }), error: null });
    const { createVendorCommunicationDraft } = await import("@/lib/negotiation-workflow/negotiation-workflow");

    await expect(
      createVendorCommunicationDraft({ organizationId: "org-1", negotiationBriefId: "brief-1", actorUserId: "user-1" })
    ).rejects.toMatchObject({ name: "NegotiationWorkflowTransitionError" });
    expect(repo.insertAdminVendorCommunicationDraft).not.toHaveBeenCalled();
  });

  it("does not edit archived briefs", async () => {
    repo.getAdminNegotiationBriefById.mockResolvedValue({ data: brief({ status: "archived" }), error: null });
    const { recomputeNegotiationBrief } = await import("@/lib/negotiation-workflow/negotiation-workflow");

    await expect(
      recomputeNegotiationBrief({ organizationId: "org-1", negotiationBriefId: "brief-1", actorUserId: "user-1" })
    ).rejects.toMatchObject({ name: "NegotiationWorkflowTransitionError" });
    expect(repo.updateAdminNegotiationBrief).not.toHaveBeenCalled();
  });

  it("requires assigned approver for draft copy approval and records safe audit metadata", async () => {
    repo.getAdminVendorCommunicationDraftById.mockResolvedValue({ data: draft(), error: null });
    repo.getAdminNegotiationBriefById.mockResolvedValue({ data: brief({ status: "approved" }), error: null });
    repo.updateAdminVendorCommunicationDraftStatus.mockResolvedValue({
      data: draft({ status: "approved_for_copy", draft_body: "raw generated body must stay out" }),
      error: null
    });
    repo.listAdminVendorCommunicationApprovalSteps.mockResolvedValue({
      data: [{ id: "step-1", status: "pending" }],
      error: null
    });
    repo.updateAdminVendorCommunicationApprovalStep.mockResolvedValue({ data: { id: "step-1", status: "approved" }, error: null });
    const { approveVendorCommunicationDraftForCopy } = await import("@/lib/negotiation-workflow/negotiation-workflow");

    await approveVendorCommunicationDraftForCopy({ organizationId: "org-1", draftId: "draft-1", actorUserId: "approver-1" });

    const auditCalls = JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls);
    expect(auditCalls).toContain("vendor_communication_draft.approved_for_copy");
    expect(auditCalls).not.toContain("raw generated body");
    expect(repo.updateAdminVendorCommunicationDraftStatus).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: "in_approval" })
    );
  });
});
