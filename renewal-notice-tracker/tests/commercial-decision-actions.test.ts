import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  assertCanUseShippedAction: vi.fn(),
  hasRequiredRole: vi.fn((role: string, allowedRoles: string[]) => allowedRoles.includes(role))
}));
const queries = vi.hoisted(() => ({ requireScopedContract: vi.fn() }));
const service = vi.hoisted(() => ({
  approveCommercialDecision: vi.fn(),
  archiveCommercialDecision: vi.fn(),
  attachDecisionEvidence: vi.fn(),
  createCommercialDecisionForContract: vi.fn(),
  createDecisionSnapshot: vi.fn(),
  finalizeCommercialDecision: vi.fn(),
  recomputeCommercialDecision: vi.fn(),
  rejectCommercialDecision: vi.fn(),
  reassignCommercialDecisionApprover: vi.fn(),
  submitCommercialDecisionForReview: vi.fn(),
  updateCommercialDecisionNegotiationPosture: vi.fn(),
  updateCommercialDecisionRecommendedAction: vi.fn()
}));
const revalidatePath = vi.fn();
const enforceDesignPartnerBetaMutation = vi.fn();
const recalculateEvidenceReadiness = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/contracts/kernel-queries", () => queries);
vi.mock("@/lib/commercial-decision-workbench/commercial-decision-workbench", () => service);
vi.mock("@/lib/billing/design-partner-beta", () => ({ enforceDesignPartnerBetaMutation }));
vi.mock("@/lib/evidence-readiness/evidence-readiness-service", () => ({ recalculateEvidenceReadiness }));

describe("commercial decision actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.assertCanUseShippedAction.mockResolvedValue(undefined);
    enforceDesignPartnerBetaMutation.mockResolvedValue({ allowed: true });
    recalculateEvidenceReadiness.mockResolvedValue({});
    queries.requireScopedContract.mockResolvedValue({ id: "contract-1", organization_id: "org-1" });
    Object.values(service).forEach((fn) => fn.mockResolvedValue({ id: "decision-1" }));
  });

  it("requires active organization, shipped review permission, and scoped contract before creating", async () => {
    const { createCommercialDecisionAction } = await import("@/lib/actions/commercial-decision-workbench");

    const result = await createCommercialDecisionAction("contract-1");

    expect(result).toEqual({ ok: true, message: "Commercial decision created." });
    expect(auth.assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "manage_renewal_decision"
    );
    expect(enforceDesignPartnerBetaMutation).toHaveBeenCalledWith({
      organizationId: "org-1",
      action: "create_decision"
    });
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(service.createCommercialDecisionForContract).toHaveBeenCalledWith({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1/commercial-decision");
  });

  it("routes posture and action changes through the safe service layer", async () => {
    const {
      changeCommercialDecisionNegotiationPostureAction,
      changeCommercialDecisionRecommendedActionAction
    } = await import("@/lib/actions/commercial-decision-workbench");

    await changeCommercialDecisionRecommendedActionAction("decision-1", "contract-1", "renegotiate");
    await changeCommercialDecisionNegotiationPostureAction("decision-1", "contract-1", "challenge_increase");

    expect(service.updateCommercialDecisionRecommendedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        decisionId: "decision-1",
        recommendedAction: "renegotiate"
      })
    );
    expect(service.updateCommercialDecisionNegotiationPosture).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        decisionId: "decision-1",
        negotiationPosture: "challenge_increase"
      })
    );
  });

  it("returns a safe structured failure instead of leaking raw internal errors", async () => {
    service.finalizeCommercialDecision.mockRejectedValueOnce(
      new Error("database stack trace with raw contract text should not be shown")
    );
    const { finalizeCommercialDecisionAction } = await import("@/lib/actions/commercial-decision-workbench");

    const result = await finalizeCommercialDecisionAction("decision-1", "contract-1");

    expect(result).toEqual({
      ok: false,
      message: "Commercial decision action failed safely.",
      code: "ERR_COMMERCIAL_DECISION_ACTION_FAILED_001"
    });
  });

  it("records reviewer-note activity as a snapshot without exposing the note through action output", async () => {
    const { addCommercialDecisionReviewerNoteAction } = await import("@/lib/actions/commercial-decision-workbench");
    const formData = new FormData();
    formData.set("reviewer_note", "raw note text must stay out of UI response");

    const result = await addCommercialDecisionReviewerNoteAction("decision-1", "contract-1", formData);

    expect(result).toEqual({ ok: true, message: "Reviewer note recorded as a safe decision snapshot." });
    expect(service.createDecisionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        decisionId: "decision-1",
        snapshotType: "reviewer_note"
      })
    );
    expect(JSON.stringify(result)).not.toContain("raw note text");
  });

  it("allows admin or operator approver reassignment through the action boundary", async () => {
    auth.requireOrganization.mockResolvedValueOnce({
      organizationId: "org-1",
      role: "operator",
      user: { id: "operator-1" }
    });
    const { reassignCommercialDecisionApproverAction } = await import("@/lib/actions/commercial-decision-workbench");
    const formData = new FormData();
    formData.set("approver_user_id", "approver-2");

    const result = await reassignCommercialDecisionApproverAction("decision-1", "contract-1", formData);

    expect(result).toEqual({ ok: true, message: "Commercial decision approver reassigned." });
    expect(service.reassignCommercialDecisionApprover).toHaveBeenCalledWith({
      organizationId: "org-1",
      decisionId: "decision-1",
      actorUserId: "operator-1",
      newApproverUserId: "approver-2"
    });
  });

  it("blocks reviewer approver reassignment before the service layer", async () => {
    const { reassignCommercialDecisionApproverAction } = await import("@/lib/actions/commercial-decision-workbench");
    const formData = new FormData();
    formData.set("approver_user_id", "approver-2");

    const result = await reassignCommercialDecisionApproverAction("decision-1", "contract-1", formData);

    expect(result).toEqual({
      ok: false,
      message: "Commercial decision approver reassignment requires an admin or operator.",
      code: "ERR_COMMERCIAL_DECISION_ACTION_FAILED_001"
    });
    expect(service.reassignCommercialDecisionApprover).not.toHaveBeenCalled();
  });
});
