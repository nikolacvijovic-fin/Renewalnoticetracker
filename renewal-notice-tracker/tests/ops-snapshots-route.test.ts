import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshOperationalSnapshots = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@/lib/contracts/queries", () => ({
  refreshOperationalSnapshots
}));

vi.mock("@/lib/internal/ops-queries", () => ({
  refreshOperationalSnapshots
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

describe("ops snapshots internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_HEALTH_SECRET = "test-health-secret";
  });

  it("rejects unauthorized refresh requests", async () => {
    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(new Request("http://localhost/api/internal/ops-snapshots", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("does not trust x-organization-id without internal auth", async () => {
    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ops-snapshots", {
        method: "POST",
        headers: {
          "x-organization-id": "org-1"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(refreshOperationalSnapshots).not.toHaveBeenCalled();
  });

  it("refreshes snapshots with header auth and returns an honest summary", async () => {
    refreshOperationalSnapshots.mockResolvedValue({
      reused: false,
      readiness: { overallScore: 70, confidenceScore: 55 },
      capacity: { overallScore: 66, confidenceScore: 61 },
      alerts: [{ id: "alert-1" }]
    });

    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ops-snapshots", {
        method: "POST",
        headers: {
          "x-internal-health-secret": "test-health-secret",
          "x-idempotency-key": "run-1",
          "x-organization-id": "org-1"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        reused: false,
        readiness: { score: 70, confidence: 55 },
        capacity: { score: 66, confidence: 61 },
        alerts: 1
      })
    );
    expect(refreshOperationalSnapshots).toHaveBeenCalledWith("org-1", {
      jobKey: "run-1"
    });
    expect(createAuditLog).toHaveBeenCalled();
  });
});
