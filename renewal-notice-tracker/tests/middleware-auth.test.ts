import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const createServerClient = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient
}));

describe("middleware auth redirect posture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClient.mockReturnValue({
      auth: {
        getSession
      }
    });
  });

  it("redirects unauthenticated dashboard traffic to auth", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { middleware } = await import("@/middleware");

    const response = await middleware(
      new NextRequest("http://localhost/dashboard/contracts")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/auth");
  });

  it("keeps public pages public when no session exists", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { middleware } = await import("@/middleware");

    const response = await middleware(
      new NextRequest("http://localhost/pricing")
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects authenticated users away from the auth landing page only", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    const { middleware } = await import("@/middleware");

    const response = await middleware(
      new NextRequest("http://localhost/auth")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
  });
});
