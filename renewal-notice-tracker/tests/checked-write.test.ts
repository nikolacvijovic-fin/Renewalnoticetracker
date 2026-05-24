import { describe, expect, it } from "vitest";
import { PrivilegedWriteError, checkedPrivilegedWrite } from "@/lib/supabase/checked-write";

describe("checkedPrivilegedWrite", () => {
  it("returns the original result when the write succeeds", async () => {
    await expect(
      checkedPrivilegedWrite(
        Promise.resolve({
          data: [{ id: "row-1" }],
          error: null
        }),
        {
          operation: "insert",
          table: "backup_readiness_checks",
          context: "internal_backup_readiness"
        }
      )
    ).resolves.toEqual({
      data: [{ id: "row-1" }],
      error: null
    });
  });

  it("throws a typed error when Supabase returns a write error", async () => {
    const cause = new Error("insert failed");

    await expect(
      checkedPrivilegedWrite(
        Promise.resolve({
          data: null,
          error: cause
        }),
        {
          operation: "delete",
          table: "contracts",
          context: "workspace_deletion:delete-1"
        }
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrivilegedWriteError>>({
        name: "PrivilegedWriteError",
        operation: "delete",
        table: "contracts",
        cause,
        context: "workspace_deletion:delete-1"
      })
    );
  });
});
