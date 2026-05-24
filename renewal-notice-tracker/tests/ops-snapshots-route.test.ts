import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshInternalRescueSnapshot = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@/lib/internal/ops-queries", () => ({
  refreshInternalRescueSnapshot
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

describe("ops snapshots internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_OPERATIONS_SECRET = "test-operations-secret";
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
    expect(refreshInternalRescueSnapshot).not.toHaveBeenCalled();
  });

  it("refreshes rescue-only internal counts with header auth", async () => {
    refreshInternalRescueSnapshot.mockResolvedValue({
      failedReminders: 2,
      retryPendingReminders: 1,
      failedNotifications: 3,
      duplicateSuppressedNotifications: 1,
      extractionFailureCount: 4,
      retryScheduledRuns: 2,
      terminalFailureRuns: 1,
      importsNeedingRescue: 2
    });

    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ops-snapshots", {
        method: "POST",
        headers: {
          "x-internal-operations-secret": "test-operations-secret",
          "x-idempotency-key": "run-1",
          "x-organization-id": "org-1"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        organizationId: "org-1",
        rescue: {
          failedReminders: 2,
          retryPendingReminders: 1,
          failedNotifications: 3,
          duplicateSuppressedNotifications: 1,
          extractionFailureCount: 4,
          retryScheduledRuns: 2,
          terminalFailureRuns: 1,
          importsNeedingRescue: 2
        }
      })
    );
    expect(refreshInternalRescueSnapshot).toHaveBeenCalledWith("org-1");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "internal.ops_snapshots_refreshed",
        details: expect.objectContaining({
          rescue_snapshot: expect.objectContaining({
            failedReminders: 2,
            importsNeedingRescue: 2
          })
        })
      })
    );
  });

  it("does not accept the health secret for operations refresh", async () => {
    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ops-snapshots", {
        method: "POST",
        headers: {
          "x-internal-health-secret": "test-health-secret",
          "x-organization-id": "org-1"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(refreshInternalRescueSnapshot).not.toHaveBeenCalled();
  });

  it("returns a safe failure when the rescue snapshot audit write fails", async () => {
    refreshInternalRescueSnapshot.mockResolvedValue({
      failedReminders: 2,
      retryPendingReminders: 1,
      failedNotifications: 3,
      duplicateSuppressedNotifications: 1,
      extractionFailureCount: 4,
      retryScheduledRuns: 2,
      terminalFailureRuns: 1,
      importsNeedingRescue: 2
    });
    createAuditLog.mockRejectedValueOnce(new Error("audit failed"));

    const { POST } = await import("@/app/api/internal/ops-snapshots/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ops-snapshots", {
        method: "POST",
        headers: {
          "x-internal-operations-secret": "test-operations-secret",
          "x-organization-id": "org-1"
        }
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Ops snapshot refresh failed." });
  });
});
