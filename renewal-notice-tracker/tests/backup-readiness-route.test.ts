import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_OPERATIONS_SECRET: "secret"
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

describe("backup readiness internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert
      }))
    });
  });

  it("rejects requests without the internal secret header", async () => {
    const { POST } = await import("@/app/api/internal/backup-readiness/route");
    const response = await POST(
      new Request("http://localhost/api/internal/backup-readiness", {
        method: "POST",
        body: JSON.stringify({ status: "healthy" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("records an authorized backup readiness check", async () => {
    const { POST } = await import("@/app/api/internal/backup-readiness/route");
    const response = await POST(
      new Request("http://localhost/api/internal/backup-readiness", {
        method: "POST",
        body: JSON.stringify({
          status: "healthy",
          summary: "Nightly backup and restore drill passed.",
          restore_tested_at: "2026-04-19T10:00:00.000Z",
          trigger: "nightly"
        }),
        headers: {
          "content-type": "application/json",
          "x-internal-operations-secret": "secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "production",
        status: "healthy",
        summary: "Nightly backup and restore drill passed.",
        restore_tested_at: "2026-04-19T10:00:00.000Z"
      })
    );
  });

  it("returns a safe failure when the backup readiness insert returns an error", async () => {
    insert.mockResolvedValueOnce({ error: new Error("insert failed") });

    const { POST } = await import("@/app/api/internal/backup-readiness/route");
    const response = await POST(
      new Request("http://localhost/api/internal/backup-readiness", {
        method: "POST",
        body: JSON.stringify({
          status: "healthy",
          trigger: "nightly"
        }),
        headers: {
          "content-type": "application/json",
          "x-internal-operations-secret": "secret"
        }
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Backup readiness check failed."
    });
  });
});
