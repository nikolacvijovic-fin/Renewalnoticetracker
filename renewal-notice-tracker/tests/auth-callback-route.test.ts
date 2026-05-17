import { describe, expect, it } from "vitest";
import { resolveSafeAuthRedirect } from "@/app/auth/callback/route";

describe("auth callback redirect safety", () => {
  it("allows safe local redirects", () => {
    expect(resolveSafeAuthRedirect("/dashboard")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("/dashboard/contracts?id=1")).toBe("/dashboard/contracts?id=1");
  });

  it("falls back for unsafe redirects", () => {
    expect(resolveSafeAuthRedirect(null)).toBe("/dashboard");
    expect(resolveSafeAuthRedirect(undefined)).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("https://evil.example")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("//evil.example")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("dashboard")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("/\\evil")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("/dashboard\r\nx-test: injected")).toBe("/dashboard");
  });
});
