import { describe, expect, it } from "vitest";

describe("monthly digest cron route", () => {
  it("returns gone because monthly digest is deferred from shipped-first runtime", async () => {
    const { POST } = await import("@/app/api/cron/monthly-digest/route");
    const response = await POST(
      new Request("http://localhost/api/cron/monthly-digest", { method: "POST" })
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Monthly digest is deferred from shipped-first runtime."
    });
  });
});
