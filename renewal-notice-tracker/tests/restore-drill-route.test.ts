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

describe("restore drill internal route", () => {
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
    const { POST } = await import("@/app/api/internal/restore-drill/route");
    const response = await POST(
      new Request("http://localhost/api/internal/restore-drill", {
        method: "POST",
        body: JSON.stringify({ outcome: "passed" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("records an authorized restore drill as backup evidence", async () => {
    const { POST } = await import("@/app/api/internal/restore-drill/route");
    const response = await POST(
      new Request("http://localhost/api/internal/restore-drill", {
        method: "POST",
        body: JSON.stringify({
          outcome: "passed",
          tested_at: "2026-04-19T12:00:00.000Z",
          summary: "Nightly restore drill passed.",
          trigger: "nightly",
          scope: "workspace_restore",
          recovery_time_minutes: 47
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
        restore_tested_at: "2026-04-19T12:00:00.000Z",
        summary: "Nightly restore drill passed."
      })
    );
  });
});
