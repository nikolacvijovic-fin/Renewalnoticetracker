import { beforeEach, describe, expect, it, vi } from "vitest";

describe("admin page authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects customer traffic away from the old dashboard admin route", async () => {
    const AdminPage = (await import("@/app/dashboard/admin/page")).default;

    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT");
  });
});
