import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_SECRET = "test-worker-signing-secret";

function bodyHash(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

describe("background job worker auth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADD_ON_INTERNAL_SIGNING_SECRET = TEST_SECRET;
  });

  it("accepts valid signed worker requests", async () => {
    const {
      createInternalWorkerRequestSignature,
      hasValidSignedInternalWorkerRequestAuth
    } = await import("@/lib/internal-route-auth");
    const body = JSON.stringify({ limit: 1 });
    const timestamp = "2030-01-01T00:00:00.000Z";
    const signature = createInternalWorkerRequestSignature({
      method: "POST",
      pathname: "/api/internal/background-jobs/claim",
      timestamp,
      bodySha256: bodyHash(body)
    });

    const request = new Request("http://localhost/api/internal/background-jobs/claim", {
      method: "POST",
      body,
      headers: {
        "x-noticecontrol-worker-id": "worker-1",
        "x-noticecontrol-timestamp": timestamp,
        "x-noticecontrol-body-sha256": bodyHash(body),
        "x-noticecontrol-signature": signature ?? ""
      }
    });

    expect(
      hasValidSignedInternalWorkerRequestAuth(request, body, new Date("2030-01-01T00:00:00.000Z"))
    ).toBe(true);
  });

  it("rejects unsigned, expired, and body-hash-mismatched worker requests", async () => {
    const {
      createInternalWorkerRequestSignature,
      hasValidSignedInternalWorkerRequestAuth
    } = await import("@/lib/internal-route-auth");
    const body = JSON.stringify({ limit: 1 });
    const timestamp = "2030-01-01T00:00:00.000Z";
    const signature = createInternalWorkerRequestSignature({
      method: "POST",
      pathname: "/api/internal/background-jobs/claim",
      timestamp,
      bodySha256: bodyHash(body)
    });

    const baseHeaders = {
      "x-noticecontrol-worker-id": "worker-1",
      "x-noticecontrol-timestamp": timestamp,
      "x-noticecontrol-body-sha256": bodyHash(body),
      "x-noticecontrol-signature": signature ?? ""
    };

    expect(
      hasValidSignedInternalWorkerRequestAuth(
        new Request("http://localhost/api/internal/background-jobs/claim", {
          method: "POST",
          body,
          headers: { ...baseHeaders, "x-noticecontrol-signature": "" }
        }),
        body,
        new Date("2030-01-01T00:00:00.000Z")
      )
    ).toBe(false);

    expect(
      hasValidSignedInternalWorkerRequestAuth(
        new Request("http://localhost/api/internal/background-jobs/claim", {
          method: "POST",
          body,
          headers: baseHeaders
        }),
        body,
        new Date("2030-01-01T00:10:00.000Z")
      )
    ).toBe(false);

    expect(
      hasValidSignedInternalWorkerRequestAuth(
        new Request("http://localhost/api/internal/background-jobs/claim", {
          method: "POST",
          body: JSON.stringify({ limit: 2 }),
          headers: baseHeaders
        }),
        JSON.stringify({ limit: 2 }),
        new Date("2030-01-01T00:00:00.000Z")
      )
    ).toBe(false);
  });
});
