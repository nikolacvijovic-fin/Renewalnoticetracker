import { beforeEach, describe, expect, it } from "vitest";

describe("internal health route", () => {
  beforeEach(() => {
    process.env.INTERNAL_HEALTH_SECRET = "test-health-secret";
    process.env.INTERNAL_OPERATIONS_SECRET = "test-operations-secret";
  });

  it("rejects requests without the internal health header", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(new Request("http://localhost/api/internal/health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("does not accept the secret via query string fallback", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health?secret=test-health-secret")
    );

    expect(response.status).toBe(401);
  });

  it("allows requests with the correct header secret", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health", {
        headers: {
          "x-internal-health-secret": "test-health-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mode: "secret-check"
    });
  });

  it("does not accept an operations secret on the health route", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health", {
        headers: {
          "x-internal-operations-secret": "test-operations-secret"
        }
      })
    );

    expect(response.status).toBe(401);
  });
});
