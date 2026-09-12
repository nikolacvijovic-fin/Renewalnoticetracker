import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseCheck = vi.fn();

vi.mock("@/lib/internal/repositories/admin-runtime-health-repository", () => ({
  probeDatabaseReadiness: databaseCheck
}));

describe("internal health route", () => {
  beforeEach(() => {
    process.env.INTERNAL_HEALTH_SECRET = "test-health-secret";
    process.env.INTERNAL_OPERATIONS_SECRET = "test-operations-secret";
    databaseCheck.mockReset();
    databaseCheck.mockResolvedValue(true);
  });

  it("rejects requests without the internal health header", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(new Request("http://localhost/api/internal/health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
      code: "ERR_INTERNAL_AUTH_REQUIRED_001",
      requestId: expect.any(String)
    });
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

  it("checks database reachability for authenticated readiness probes", async () => {
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health?readiness=1", {
        headers: { "x-internal-health-secret": "test-health-secret" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mode: "readiness",
      checks: { database: "ok" }
    });
  });

  it("fails readiness without exposing database details", async () => {
    databaseCheck.mockResolvedValue(false);
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health?readiness=1", {
        headers: { "x-internal-health-secret": "test-health-secret" }
      })
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false, mode: "readiness", checks: { database: "failed" } });
    expect(JSON.stringify(body)).not.toContain("sensitive database failure");
  });

  it("maps rejected database probes to the same safe readiness response", async () => {
    databaseCheck.mockRejectedValue(new Error("sensitive connection failure"));
    const { GET } = await import("@/app/api/internal/health/route");
    const response = await GET(
      new Request("http://localhost/api/internal/health?readiness=1", {
        headers: { "x-internal-health-secret": "test-health-secret" }
      })
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false, mode: "readiness", checks: { database: "failed" } });
    expect(JSON.stringify(body)).not.toContain("sensitive connection failure");
  });
});
