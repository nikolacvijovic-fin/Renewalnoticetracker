import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  assertCanUseShippedAction: vi.fn()
}));
const queries = vi.hoisted(() => ({ requireScopedContract: vi.fn() }));
const service = vi.hoisted(() => ({
  approveOutreachDraftForCopy: vi.fn(),
  archiveOutreachDraft: vi.fn(),
  archiveOutreachOpportunity: vi.fn(),
  buildCrmNoteForOpportunity: vi.fn(),
  createOutreachDraft: vi.fn(),
  createOutreachOpportunityFromDecision: vi.fn(),
  createOutreachPlaybookItem: vi.fn(),
  createOutreachSuppression: vi.fn(),
  detectOutreachOpportunitiesForContract: vi.fn(),
  dismissDuplicateOutreachOpportunity: vi.fn(),
  dismissOutreachOpportunity: vi.fn(),
  planOutreachSequence: vi.fn(),
  recomputeOutreachOpportunity: vi.fn(),
  regenerateOutreachDraft: vi.fn(),
  rejectOutreachDraft: vi.fn(),
  refreshOutreachOpportunityIntelligence: vi.fn(),
  resolveOutreachAudience: vi.fn(),
  scoreOutreachOpportunity: vi.fn(),
  submitOutreachDraftForApproval: vi.fn()
}));
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/contracts/kernel-queries", () => queries);
vi.mock("@/lib/internal-outreach-intelligence/internal-outreach-intelligence", () => service);

describe("internal outreach intelligence actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.assertCanUseShippedAction.mockResolvedValue(undefined);
    queries.requireScopedContract.mockResolvedValue({ id: "contract-1", organization_id: "org-1" });
    Object.values(service).forEach((fn) => fn.mockResolvedValue({ id: "outreach-1" }));
    service.detectOutreachOpportunitiesForContract.mockResolvedValue([{ id: "opportunity-1" }]);
  });

  it("requires organization, shipped review permission, and scoped contract before detection", async () => {
    const { detectOutreachOpportunitiesAction } = await import("@/lib/actions/internal-outreach-intelligence");

    const result = await detectOutreachOpportunitiesAction("contract-1");

    expect(result).toEqual({ ok: true, message: "Internal outreach opportunities refreshed." });
    expect(auth.assertCanUseShippedAction).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }), "review_p0");
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(service.detectOutreachOpportunitiesForContract).toHaveBeenCalledWith({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/internal-outreach");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1/internal-outreach");
  });

  it("routes draft generation through the draft-only service with selected channel and tone", async () => {
    const { createOutreachDraftAction } = await import("@/lib/actions/internal-outreach-intelligence");
    const formData = new FormData();
    formData.set("channel", "meeting_agenda");
    formData.set("tone", "executive");

    const result = await createOutreachDraftAction("opportunity-1", "contract-1", formData);

    expect(result).toEqual({ ok: true, message: "Internal draft created. No message was sent." });
    expect(service.createOutreachDraft).toHaveBeenCalledWith({
      organizationId: "org-1",
      opportunityId: "opportunity-1",
      actorUserId: "user-1",
      channel: "meeting_agenda",
      tone: "executive"
    });
  });

  it("does not call service when scoped contract access fails", async () => {
    queries.requireScopedContract.mockRejectedValueOnce(new Error("not found"));
    const { submitOutreachDraftForApprovalAction } = await import("@/lib/actions/internal-outreach-intelligence");

    const result = await submitOutreachDraftForApprovalAction("draft-1", "contract-1");

    expect(result.ok).toBe(false);
    expect(service.submitOutreachDraftForApproval).not.toHaveBeenCalled();
  });

  it("routes guidance refresh through the same guarded action path", async () => {
    const { refreshOutreachOpportunityIntelligenceAction } = await import("@/lib/actions/internal-outreach-intelligence");

    const result = await refreshOutreachOpportunityIntelligenceAction("opportunity-1", "contract-1");

    expect(result).toEqual({ ok: true, message: "Internal outreach guidance refreshed." });
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(service.refreshOutreachOpportunityIntelligence).toHaveBeenCalledWith({
      organizationId: "org-1",
      opportunityId: "opportunity-1",
      actorUserId: "user-1"
    });
  });

  it("dismisses duplicates with explicit duplicate metadata only after scope checks", async () => {
    const { dismissDuplicateOutreachOpportunityAction } = await import("@/lib/actions/internal-outreach-intelligence");

    const result = await dismissDuplicateOutreachOpportunityAction("opportunity-1", "contract-1", "opportunity-0");

    expect(result).toEqual({ ok: true, message: "Duplicate internal outreach opportunity dismissed." });
    expect(service.dismissDuplicateOutreachOpportunity).toHaveBeenCalledWith({
      organizationId: "org-1",
      opportunityId: "opportunity-1",
      duplicateOfOpportunityId: "opportunity-0",
      actorUserId: "user-1"
    });
  });

  it("returns safe structured errors without leaking customer content", async () => {
    service.approveOutreachDraftForCopy.mockRejectedValueOnce(
      new Error("database error with raw contract text, full notes, OCR output, and provider payload")
    );
    const { approveOutreachDraftForCopyAction } = await import("@/lib/actions/internal-outreach-intelligence");

    const result = await approveOutreachDraftForCopyAction("draft-1", "contract-1");

    expect(result).toEqual({
      ok: false,
      message: "Internal outreach action failed safely.",
      code: "ERR_INTERNAL_OUTREACH_ACTION_FAILED_001"
    });
    expect(JSON.stringify(result)).not.toContain("raw contract text");
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });
});
