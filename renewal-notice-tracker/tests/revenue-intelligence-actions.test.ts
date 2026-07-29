import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  assertCanUseShippedAction: vi.fn(),
  hasRequiredRole: vi.fn(),
  requireOrganization: vi.fn()
}));
const service = vi.hoisted(() => ({
  archiveRevenueSignal: vi.fn(),
  enqueueRevenueIntelligenceRefreshJob: vi.fn(),
  generateRevenueIntelligenceSnapshot: vi.fn(),
  markExecutiveInsightReviewed: vi.fn()
}));
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/revenue-intelligence/revenue-intelligence", () => service);

describe("revenue intelligence actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.assertCanUseShippedAction.mockResolvedValue(undefined);
    auth.hasRequiredRole.mockReturnValue(true);
    Object.values(service).forEach((fn) => fn.mockResolvedValue({ id: "ok" }));
  });

  it("generates snapshots through the guarded org and review-permission path", async () => {
    const { generateRevenueIntelligenceSnapshotAction } = await import("@/lib/actions/revenue-intelligence");

    await expect(generateRevenueIntelligenceSnapshotAction()).resolves.toEqual({
      ok: true,
      message: "Revenue intelligence snapshot generated."
    });

    expect(auth.assertCanUseShippedAction).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }), "review_p0");
    expect(auth.hasRequiredRole).toHaveBeenCalledWith("reviewer", ["admin", "operator", "reviewer"]);
    expect(service.generateRevenueIntelligenceSnapshot).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/revenue-intelligence");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("queues refresh jobs and preserves idempotent service behavior", async () => {
    const { enqueueRevenueIntelligenceRefreshJobAction } = await import("@/lib/actions/revenue-intelligence");

    await expect(enqueueRevenueIntelligenceRefreshJobAction()).resolves.toEqual({
      ok: true,
      message: "Revenue intelligence refresh job queued."
    });

    expect(service.enqueueRevenueIntelligenceRefreshJob).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1"
    });
  });

  it("routes insight and signal actions through safe org-scoped service calls", async () => {
    const {
      archiveRevenueSignalAction,
      markExecutiveInsightReviewedAction
    } = await import("@/lib/actions/revenue-intelligence");

    await expect(markExecutiveInsightReviewedAction("insight-1")).resolves.toEqual({
      ok: true,
      message: "Executive insight marked reviewed."
    });
    await expect(archiveRevenueSignalAction("signal-1")).resolves.toEqual({
      ok: true,
      message: "Revenue risk signal archived."
    });

    expect(service.markExecutiveInsightReviewed).toHaveBeenCalledWith({
      organizationId: "org-1",
      insightId: "insight-1",
      actorUserId: "user-1"
    });
    expect(service.archiveRevenueSignal).toHaveBeenCalledWith({
      organizationId: "org-1",
      signalId: "signal-1",
      actorUserId: "user-1"
    });
  });

  it("returns safe errors without leaking raw customer/provider content", async () => {
    service.generateRevenueIntelligenceSnapshot.mockRejectedValueOnce(
      new Error("database error with raw contract text, OCR output, provider payload, token")
    );
    const { generateRevenueIntelligenceSnapshotAction } = await import("@/lib/actions/revenue-intelligence");

    const result = await generateRevenueIntelligenceSnapshotAction();

    expect(result).toEqual({
      ok: false,
      message: "Revenue intelligence action failed safely.",
      code: "ERR_REVENUE_INTELLIGENCE_ACTION_FAILED_001"
    });
    expect(JSON.stringify(result)).not.toContain("raw contract text");
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });

  it("denies non-operator roles before service calls", async () => {
    auth.hasRequiredRole.mockReturnValueOnce(false);
    const { generateRevenueIntelligenceSnapshotAction } = await import("@/lib/actions/revenue-intelligence");

    const result = await generateRevenueIntelligenceSnapshotAction();

    expect(result.ok).toBe(false);
    expect(service.generateRevenueIntelligenceSnapshot).not.toHaveBeenCalled();
  });
});
