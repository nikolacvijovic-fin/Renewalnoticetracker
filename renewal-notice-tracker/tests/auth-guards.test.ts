import { describe, expect, it } from "vitest";
import {
  isPublicPath,
  shouldRedirectAwayFromAuth,
  shouldRedirectToAuth
} from "@/lib/auth-guards";

describe("auth guards", () => {
  it("treats auth and pricing paths as public", () => {
    expect(isPublicPath("/auth")).toBe(true);
    expect(isPublicPath("/auth/reset")).toBe(true);
    expect(isPublicPath("/pricing")).toBe(true);
  });

  it("redirects unauthenticated dashboard access to auth", () => {
    expect(shouldRedirectToAuth("/dashboard/contracts", false)).toBe(true);
    expect(shouldRedirectToAuth("/pricing", false)).toBe(false);
  });

  it("redirects authenticated users away from the auth page", () => {
    expect(shouldRedirectAwayFromAuth("/auth", true)).toBe(true);
    expect(shouldRedirectAwayFromAuth("/dashboard", true)).toBe(false);
  });
});
