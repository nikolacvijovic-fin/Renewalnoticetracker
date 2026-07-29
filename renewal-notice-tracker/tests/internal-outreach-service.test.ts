import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getAdminActiveInternalOutreachOpportunityBySource: vi.fn(),
  getAdminInternalOutreachDraftById: vi.fn(),
  getAdminInternalOutreachOpportunityById: vi.fn(),
  hasAdminActiveInternalOutreachSuppression: vi.fn(),
  insertAdminInternalOutreachApprovalStep: vi.fn(),
  insertAdminInternalOutreachDraft: vi.fn(),
  insertAdminInternalOutreachOpportunity: vi.fn(),
  insertAdminInternalOutreachPlaybookItem: vi.fn(),
  insertAdminInternalOutreachSuppression: vi.fn(),
  listAdminInternalOutreachApprovalSteps: vi.fn(),
  listAdminInternalOutreachDrafts: vi.fn(),
  listAdminInternalOutreachEvidenceLinks: vi.fn(),
  listAdminInternalOutreachOpportunities: vi.fn(),
  listAdminInternalOutreachPlaybookItems: vi.fn(),
  listAdminInternalOutreachSuppressions: vi.fn(),
  updateAdminInternalOutreachApprovalStep: vi.fn(),
  updateAdminInternalOutreachDraft: vi.fn(),
  updateAdminInternalOutreachDraftStatus: vi.fn(),
  updateAdminInternalOutreachOpportunity: vi.fn(),
  updateAdminInternalOutreachOpportunityStatus: vi.fn(),
  upsertAdminInternalOutreachEvidenceLink: vi.fn()
}));
const commercialRepo = vi.hoisted(() => ({
  getAdminActiveCommercialDecisionByContractId: vi.fn(),
  getAdminCommercialDecisionById: vi.fn()
}));
const negotiationRepo = vi.hoisted(() => ({ getAdminActiveNegotiationBriefByDecisionId: vi.fn() }));
const audit = vi.hoisted(() => ({ recordEnterpriseAuditEvent: vi.fn() }));
const contracts = vi.hoisted(() => ({ getContractById: vi.fn() }));
const quote = vi.hoisted(() => ({
  listQuoteComparisons: vi.fn(),
  listQuoteFindings: vi.fn(),
  listSavingsOpportunities: vi.fn()
}));

vi.mock("@/lib/internal-outreach-intelligence/repositories/admin-internal-outreach-repository", () => repo);
vi.mock("@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository", () => commercialRepo);
vi.mock("@/lib/negotiation-workflow/repositories/admin-negotiation-workflow-repository", () => negotiationRepo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => audit);
vi.mock("@/lib/contracts/kernel-queries", () => contracts);
vi.mock("@/lib/quote-comparison/quote-comparison", () => quote);

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
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
    evidence_confidence: 0.9,
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
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  } as any;
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
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
    subject_or_heading: "Internal draft",
    body_preview: "[INTERNAL DRAFT ONLY]",
    key_points: [],
    evidence_references: ["commercial_decision:decision-1"],
    ask: "Review",
    next_step: "Approve for copy",
    internal_reviewer_note: "Review first",
    safety_status: "safe",
    safety_reasons: [],
    copy_allowed: false,
    submitted_at: null,
    approved_for_copy_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  } as any;
}

describe("internal outreach intelligence service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    commercialRepo.getAdminActiveCommercialDecisionByContractId.mockResolvedValue({
      data: {
        id: "decision-1",
        contract_id: "contract-1",
        recommended_action: "renegotiate",
        commercial_risk_level: "critical",
        evidence_confidence: 0.91,
        estimated_savings_amount: 12000,
        currency: "USD",
        blocker_codes: [],
        warning_codes: [],
        negotiation_posture: "challenge_increase",
        renewal_deadline: "2030-05-01",
        notice_deadline: "2030-03-01",
        owner_user_id: "owner-1"
      },
      error: null
    });
    contracts.getContractById.mockResolvedValue({
      id: "contract-1",
      owner_user_id: "owner-1",
      contract_metadata: { renewal_date: "2030-05-01", notice_deadline_date: "2030-03-01" }
    });
    quote.listQuoteComparisons.mockResolvedValue([{ id: "comparison-1", price_delta_percent: 20, currency: "USD" }]);
    quote.listQuoteFindings.mockResolvedValue([{ id: "finding-1", finding_type: "price_increase", severity: "critical", confidence: 0.88, status: "open" }]);
    quote.listSavingsOpportunities.mockResolvedValue([]);
    negotiationRepo.getAdminActiveNegotiationBriefByDecisionId.mockResolvedValue({ data: null, error: null });
    repo.getAdminActiveInternalOutreachOpportunityBySource.mockResolvedValue({ data: null, error: null });
    repo.insertAdminInternalOutreachOpportunity.mockImplementation(async () => ({ data: opportunity(), error: null }));
    repo.updateAdminInternalOutreachOpportunity.mockImplementation(async () => ({ data: opportunity(), error: null }));
    repo.upsertAdminInternalOutreachEvidenceLink.mockResolvedValue({ data: { id: "link-1" }, error: null });
    repo.hasAdminActiveInternalOutreachSuppression.mockResolvedValue({ data: false, error: null });
    repo.listAdminInternalOutreachDrafts.mockResolvedValue({ data: [], error: null });
    repo.listAdminInternalOutreachEvidenceLinks.mockResolvedValue({ data: [], error: null });
    repo.listAdminInternalOutreachPlaybookItems.mockResolvedValue({ data: [], error: null });
    repo.listAdminInternalOutreachSuppressions.mockResolvedValue({ data: [], error: null });
    repo.listAdminInternalOutreachApprovalSteps.mockResolvedValue({ data: [{ id: "step-1", status: "pending" }], error: null });
    repo.updateAdminInternalOutreachApprovalStep.mockResolvedValue({ data: { id: "step-1", status: "approved" }, error: null });
    repo.updateAdminInternalOutreachOpportunityStatus.mockResolvedValue({ data: opportunity({ status: "dismissed" }), error: null });
  });

  it("detects and creates org-scoped opportunities with safe audit metadata", async () => {
    const { detectOutreachOpportunitiesForContract } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    const result = await detectOutreachOpportunitiesForContract({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1"
    });

    expect(result.length).toBeGreaterThan(0);
    expect(repo.insertAdminInternalOutreachOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", contractId: "contract-1" })
    );
    const auditCalls = JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls);
    expect(auditCalls).toContain("internal_outreach_opportunity.detected");
    expect(auditCalls).not.toContain("raw contract text");
    expect(auditCalls).not.toContain("OCR output");
  });

  it("blocks draft generation when an active suppression exists", async () => {
    repo.getAdminInternalOutreachOpportunityById.mockResolvedValue({ data: opportunity(), error: null });
    repo.hasAdminActiveInternalOutreachSuppression.mockResolvedValue({ data: true, error: null });
    const { createOutreachDraft } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    await expect(
      createOutreachDraft({ organizationId: "org-1", opportunityId: "opportunity-1", actorUserId: "user-1" })
    ).rejects.toMatchObject({ name: "InternalOutreachTransitionError" });
    expect(repo.insertAdminInternalOutreachDraft).not.toHaveBeenCalled();
  });

  it("does not approve blocked drafts and records a safety audit", async () => {
    repo.getAdminInternalOutreachDraftById.mockResolvedValue({ data: draft({ safety_status: "blocked" }), error: null });
    repo.getAdminInternalOutreachOpportunityById.mockResolvedValue({ data: opportunity(), error: null });
    const { approveOutreachDraftForCopy } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    await expect(
      approveOutreachDraftForCopy({ organizationId: "org-1", draftId: "draft-1", actorUserId: "approver-1" })
    ).rejects.toMatchObject({ name: "InternalOutreachTransitionError" });
    expect(repo.updateAdminInternalOutreachDraftStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls)).toContain("internal_outreach.safety_blocked");
  });

  it("allows rejected drafts to be regenerated but not approved directly", async () => {
    repo.getAdminInternalOutreachDraftById.mockResolvedValue({ data: draft({ status: "rejected" }), error: null });
    repo.getAdminInternalOutreachOpportunityById.mockResolvedValue({ data: opportunity(), error: null });
    repo.updateAdminInternalOutreachDraft.mockResolvedValue({ data: draft({ status: "draft" }), error: null });
    const {
      approveOutreachDraftForCopy,
      regenerateOutreachDraft
    } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    await expect(
      approveOutreachDraftForCopy({ organizationId: "org-1", draftId: "draft-1", actorUserId: "approver-1" })
    ).rejects.toMatchObject({ name: "InternalOutreachTransitionError" });
    await expect(
      regenerateOutreachDraft({ organizationId: "org-1", draftId: "draft-1", actorUserId: "user-1" })
    ).resolves.toEqual(expect.objectContaining({ status: "draft" }));
  });

  it("refreshes guidance and audits safe derived metadata", async () => {
    repo.getAdminInternalOutreachOpportunityById.mockResolvedValue({ data: opportunity(), error: null });
    repo.listAdminInternalOutreachEvidenceLinks.mockResolvedValue({
      data: [{ id: "link-1", evidence_type: "commercial_decision", evidence_label: "Safe decision evidence" }],
      error: null
    });
    const { refreshOutreachOpportunityIntelligence } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    const result = await refreshOutreachOpportunityIntelligence({
      organizationId: "org-1",
      opportunityId: "opportunity-1",
      actorUserId: "user-1"
    });

    expect(result.priorityScore.priorityScore).toBeGreaterThan(0);
    const auditCalls = JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls);
    expect(auditCalls).toContain("internal_outreach.safety_reviewed");
    expect(auditCalls).toContain("priorityScore");
    expect(auditCalls).not.toContain("raw contract text");
  });

  it("dismisses duplicate opportunities with explicit safe metadata", async () => {
    repo.getAdminInternalOutreachOpportunityById.mockResolvedValue({ data: opportunity(), error: null });
    const { dismissDuplicateOutreachOpportunity } = await import("@/lib/internal-outreach-intelligence/internal-outreach-intelligence");

    await expect(
      dismissDuplicateOutreachOpportunity({
        organizationId: "org-1",
        opportunityId: "opportunity-1",
        duplicateOfOpportunityId: "opportunity-0",
        actorUserId: "user-1"
      })
    ).resolves.toEqual(expect.objectContaining({ status: "dismissed" }));
    expect(repo.updateAdminInternalOutreachOpportunityStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        opportunityId: "opportunity-1",
        values: expect.objectContaining({ status: "dismissed" })
      })
    );
    expect(JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls)).toContain("duplicate_opportunity");
  });
});
