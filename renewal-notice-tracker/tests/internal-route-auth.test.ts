import { describe, expect, it } from "vitest";
import {
  INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER,
  INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER,
  createDestructiveInternalRequestSignature,
  getInternalRouteSecretHeaderName,
  hasValidDestructiveInternalRequestAuth,
  hasValidInternalRouteSecret
} from "@/lib/internal-route-auth";

describe("internal route auth", () => {
  it("maps each internal route purpose to a distinct header name", () => {
    expect(getInternalRouteSecretHeaderName("health")).toBe("x-internal-health-secret");
    expect(getInternalRouteSecretHeaderName("ocr_jobs")).toBe("x-internal-ocr-secret");
    expect(getInternalRouteSecretHeaderName("operations")).toBe("x-internal-operations-secret");
    expect(getInternalRouteSecretHeaderName("destructive")).toBe(
      "x-internal-destructive-ops-secret"
    );
  });

  it("validates only the secret configured for that route purpose", () => {
    const healthRequest = new Request("http://localhost/internal/health", {
      headers: {
        "x-internal-health-secret": "test-health-secret"
      }
    });
    const wrongRequest = new Request("http://localhost/internal/health", {
      headers: {
        "x-internal-operations-secret": "test-operations-secret"
      }
    });

    expect(hasValidInternalRouteSecret(healthRequest, "health")).toBe(true);
    expect(hasValidInternalRouteSecret(wrongRequest, "health")).toBe(false);
  });

  it("validates timestamped HMAC auth for destructive routes", () => {
    const timestamp = new Date("2026-05-24T12:00:00.000Z").getTime().toString();
    const body = JSON.stringify({ request_id: "delete-1" });
    const signature = createDestructiveInternalRequestSignature({
      method: "POST",
      pathname: "/api/internal/workspace-deletion",
      timestamp,
      body
    });
    const request = new Request("http://localhost/api/internal/workspace-deletion", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-internal-destructive-ops-secret": "test-destructive-secret",
        [INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER]: signature
      }
    });

    expect(
      hasValidDestructiveInternalRequestAuth(request, body, new Date("2026-05-24T12:02:00.000Z"))
    ).toBe(true);
  });

  it("rejects expired or tampered destructive signatures", () => {
    const timestamp = new Date("2026-05-24T12:00:00.000Z").getTime().toString();
    const body = JSON.stringify({ request_id: "delete-1" });
    const validSignature = createDestructiveInternalRequestSignature({
      method: "POST",
      pathname: "/api/internal/workspace-deletion",
      timestamp,
      body
    });
    const expiredRequest = new Request("http://localhost/api/internal/workspace-deletion", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-internal-destructive-ops-secret": "test-destructive-secret",
        [INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER]: validSignature
      }
    });
    const tamperedRequest = new Request("http://localhost/api/internal/workspace-deletion", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-internal-destructive-ops-secret": "test-destructive-secret",
        [INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER]: "deadbeef"
      }
    });

    expect(
      hasValidDestructiveInternalRequestAuth(expiredRequest, body, new Date("2026-05-24T12:10:01.000Z"))
    ).toBe(false);
    expect(hasValidDestructiveInternalRequestAuth(tamperedRequest, body)).toBe(false);
  });
});
