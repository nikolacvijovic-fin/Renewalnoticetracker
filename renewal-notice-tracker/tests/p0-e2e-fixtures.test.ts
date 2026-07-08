import { describe, expect, it, vi } from "vitest";
import {
  P0FixtureVerificationError,
  redactP0FixtureMessage,
  verifyP0E2EFixtures
} from "@/scripts/verify-p0-e2e-fixtures.mjs";

const completeEnv = {
  E2E_BASE_URL: "https://staging.noticecontrol.test",
  E2E_AUTH_COOKIE_NAME: "nc_session",
  E2E_AUTH_COOKIE_VALUE: "primary-secret-cookie",
  E2E_SECONDARY_AUTH_COOKIE_VALUE: "secondary-secret-cookie",
  E2E_MEMBER_AUTH_COOKIE_VALUE: "member-secret-cookie",
  E2E_REVIEW_CONTRACT_PATH: "/dashboard/contracts/review-target",
  E2E_FOREIGN_CONTRACT_PATH: "/dashboard/contracts/foreign-target"
};

function response(status: number, body = "") {
  return {
    status,
    text: async () => body
  };
}

describe("P0 E2E staging fixture verifier", () => {
  it("fails required mode before HTTP checks when required env is missing", async () => {
    await expect(
      verifyP0E2EFixtures({
        required: true,
        env: {},
        fetchImpl: vi.fn()
      })
    ).rejects.toMatchObject({
      issues: ["missing_required_inputs"],
      message: expect.stringContaining("E2E_BASE_URL or NEXT_PUBLIC_APP_URL")
    });
  });

  it("redacts configured auth cookies from verifier error messages", () => {
    expect(
      redactP0FixtureMessage(
        "Failure included primary-secret-cookie and secondary-secret-cookie.",
        completeEnv
      )
    ).toBe("Failure included [REDACTED] and [REDACTED].");
  });

  it("fails clearly when staging base URL returns a server error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503));

    await expect(
      verifyP0E2EFixtures({
        required: true,
        env: completeEnv,
        fetchImpl
      })
    ).rejects.toMatchObject({
      issues: ["base_url_unreachable"],
      message: "Staging base URL returned HTTP 503."
    });
  });

  it("fails clearly when the primary review path is not reachable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(404));

    await expect(
      verifyP0E2EFixtures({
        required: true,
        env: completeEnv,
        fetchImpl
      })
    ).rejects.toMatchObject({
      issues: ["review_contract_unreachable"],
      message: "Primary review contract is not reachable; received HTTP 404."
    });
  });

  it("warns but succeeds when optional secondary and member cookies are absent", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    const result = await verifyP0E2EFixtures({
      required: false,
      env: {
        ...completeEnv,
        E2E_SECONDARY_AUTH_COOKIE_VALUE: "",
        E2E_MEMBER_AUTH_COOKIE_VALUE: ""
      },
      fetchImpl
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "Secondary auth cookie is not configured; cross-org denial was not verified.",
        "Member auth cookie is not configured; member admin-denial proof was not verified."
      ])
    );
  });

  it("requires secondary and optionally member cookies in strict policy mode", async () => {
    await expect(
      verifyP0E2EFixtures({
        required: true,
        env: { ...completeEnv, E2E_SECONDARY_AUTH_COOKIE_VALUE: "" },
        fetchImpl: vi.fn()
      })
    ).rejects.toMatchObject({
      issues: ["missing_required_inputs"],
      message: expect.stringContaining("E2E_SECONDARY_AUTH_COOKIE_VALUE")
    });

    await expect(
      verifyP0E2EFixtures({
        required: true,
        requireMember: true,
        env: { ...completeEnv, E2E_MEMBER_AUTH_COOKIE_VALUE: "" },
        fetchImpl: vi.fn()
      })
    ).rejects.toMatchObject({
      issues: ["missing_required_inputs"],
      message: expect.stringContaining("E2E_MEMBER_AUTH_COOKIE_VALUE")
    });
  });

  it("checks cross-org and member denial without exposing cookie values", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200, "Forbidden"))
      .mockResolvedValueOnce(response(302));

    const result = await verifyP0E2EFixtures({
      required: true,
      env: completeEnv,
      fetchImpl
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      "Staging base URL",
      "Primary dashboard",
      "Primary review contract",
      "Secondary user cross-org contract denial",
      "Member admin-surface denial"
    ]);
    expect(JSON.stringify(result)).not.toContain("primary-secret-cookie");
    expect(JSON.stringify(result)).not.toContain("secondary-secret-cookie");
    expect(JSON.stringify(result)).not.toContain("member-secret-cookie");
  });

  it("wraps network errors with redacted safe messages", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network primary-secret-cookie failed"));

    try {
      await verifyP0E2EFixtures({
        required: true,
        env: completeEnv,
        fetchImpl
      });
      throw new Error("Expected verifier to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(P0FixtureVerificationError);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain("primary-secret-cookie");
    }
  });
});
