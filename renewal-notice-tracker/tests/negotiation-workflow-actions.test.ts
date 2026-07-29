import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  assertCanUseShippedAction: vi.fn()
}));
const queries = vi.hoisted(() => ({ requireScopedContract: vi.fn() }));
const service = vi.hoisted(() => ({
  approveNegotiationBrief: vi.fn(),
  approveVendorCommunicationDraftForCopy: vi.fn(),
  archiveNegotiationBrief: vi.fn(),
  archiveVendorCommunicationDraft: vi.fn(),
  createNegotiationBriefForDecision: vi.fn(),
  createNegotiationPlaybookItem: vi.fn(),
  createVendorCommunicationDraft: vi.fn(),
  recomputeNegotiationBrief: vi.fn(),
  regenerateVendorCommunicationDraft: vi.fn(),
  rejectNegotiationBrief: vi.fn(),
  rejectVendorCommunicationDraft: vi.fn(),
  submitNegotiationBriefForReview: vi.fn(),
  submitVendorCommunicationDraftForApproval: vi.fn()
}));
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/contracts/kernel-queries", () => queries);
vi.mock("@/lib/negotiation-workflow/negotiation-workflow", () => service);

describe("negotiation workflow actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.assertCanUseShippedAction.mockResolvedValue(undefined);
    queries.requireScopedContract.mockResolvedValue({ id: "contract-1", organization_id: "org-1" });
    Object.values(service).forEach((fn) => fn.mockResolvedValue({ id: "workflow-1" }));
  });

  it("requires organization, shipped review permission, and scoped contract before creating a brief", async () => {
    const { createNegotiationBriefAction } = await import("@/lib/actions/negotiation-workflow");

    const result = await createNegotiationBriefAction("decision-1", "contract-1");

    expect(result).toEqual({ ok: true, message: "Negotiation brief created." });
    expect(auth.assertCanUseShippedAction).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }), "review_p0");
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(service.createNegotiationBriefForDecision).toHaveBeenCalledWith({
      organizationId: "org-1",
      commercialDecisionId: "decision-1",
      actorUserId: "user-1"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1/commercial-decision");
  });

  it("routes vendor draft generation through the draft-only service with selected channel and tone", async () => {
    const { createVendorCommunicationDraftAction } = await import("@/lib/actions/negotiation-workflow");
    const formData = new FormData();
    formData.set("channel", "call_script");
    formData.set("tone", "executive");

    const result = await createVendorCommunicationDraftAction("brief-1", "contract-1", formData);

    expect(result).toEqual({ ok: true, message: "Draft-only vendor communication created." });
    expect(service.createVendorCommunicationDraft).toHaveBeenCalledWith({
      organizationId: "org-1",
      negotiationBriefId: "brief-1",
      actorUserId: "user-1",
      channel: "call_script",
      tone: "executive"
    });
  });

  it("returns safe structured failures without leaking raw internal errors", async () => {
    service.approveVendorCommunicationDraftForCopy.mockRejectedValueOnce(
      new Error("database stack with raw contract text, note text, and OCR output")
    );
    const { approveVendorCommunicationDraftForCopyAction } = await import("@/lib/actions/negotiation-workflow");

    const result = await approveVendorCommunicationDraftForCopyAction("draft-1", "contract-1");

    expect(result).toEqual({
      ok: false,
      message: "Negotiation workflow action failed safely.",
      code: "ERR_NEGOTIATION_WORKFLOW_ACTION_FAILED_001"
    });
    expect(JSON.stringify(result)).not.toContain("raw contract text");
    expect(JSON.stringify(result)).not.toContain("OCR output");
  });

  it("does not call the service if scoped contract access fails", async () => {
    queries.requireScopedContract.mockRejectedValueOnce(new Error("not found"));
    const { submitNegotiationBriefAction } = await import("@/lib/actions/negotiation-workflow");

    const result = await submitNegotiationBriefAction("brief-1", "contract-1");

    expect(result.ok).toBe(false);
    expect(service.submitNegotiationBriefForReview).not.toHaveBeenCalled();
  });
});
