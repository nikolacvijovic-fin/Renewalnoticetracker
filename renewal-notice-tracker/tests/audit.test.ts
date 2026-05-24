import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogWriteError, createAuditLog } from "@/lib/audit";

const { insert, createAdminSupabaseClient } = vi.hoisted(() => ({
  insert: vi.fn(),
  createAdminSupabaseClient: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

describe("createAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert
      }))
    });
  });

  it("returns success when the audit insert succeeds", async () => {
    await expect(
      createAuditLog({
        organizationId: "org-1",
        actorUserId: "user-1",
        action: "contracts.review_updated",
        entityType: "contract",
        entityId: "contract-1"
      })
    ).resolves.toEqual({ ok: true });
  });

  it("throws explicitly on audit insert failure by default", async () => {
    insert.mockResolvedValue({
      error: new Error("insert failed")
    });

    await expect(
      createAuditLog({
        organizationId: "org-1",
        actorUserId: "user-1",
        action: "contracts.review_updated",
        entityType: "contract",
        entityId: "contract-1"
      })
    ).rejects.toMatchObject({
      name: "AuditLogWriteError",
      message: 'Audit log write failed for action "contracts.review_updated".'
    });
  });

  it("returns a structured failure only when best-effort mode is explicit", async () => {
    insert.mockResolvedValue({
      error: new Error("insert failed")
    });

    await expect(
      createAuditLog(
        {
          organizationId: "org-1",
          actorUserId: "user-1",
          action: "contracts.review_updated",
          entityType: "contract",
          entityId: "contract-1"
        },
        { mode: "best_effort" }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: expect.any(AuditLogWriteError)
    });
  });
});
