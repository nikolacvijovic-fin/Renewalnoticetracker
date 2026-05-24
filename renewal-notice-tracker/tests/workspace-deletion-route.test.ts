import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER,
  INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER,
  createDestructiveInternalRequestSignature
} from "@/lib/internal-route-auth";

const executeWorkspaceDeletionRequest = vi.fn();

vi.mock("@/lib/organization/workspace-deletion", () => ({
  executeWorkspaceDeletionRequest
}));

describe("workspace deletion internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeSignedHeaders(
    body: string,
    overrides?: Record<string, string>,
    timestamp = Date.now().toString()
  ) {
    const signature = createDestructiveInternalRequestSignature({
      method: "POST",
      pathname: "/api/internal/workspace-deletion",
      timestamp,
      body
    });

    return {
      "content-type": "application/json",
      "x-internal-destructive-ops-secret": "test-destructive-secret",
      [INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER]: timestamp,
      [INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER]: signature,
      ...overrides
    };
  }

  it("rejects requests without the internal secret header", async () => {
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body: JSON.stringify({ request_id: "delete-1" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(401);
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });

  it("executes an authorized workspace deletion request", async () => {
    executeWorkspaceDeletionRequest.mockResolvedValue({
      organizationId: "org-1",
      status: "completed"
    });
    const body = JSON.stringify({ request_id: "delete-1" });

    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: makeSignedHeaders(body)
      })
    );

    expect(response.status).toBe(200);
    expect(executeWorkspaceDeletionRequest).toHaveBeenCalledWith("delete-1");
  });

  it("does not accept the health secret for workspace deletion", async () => {
    const body = JSON.stringify({ request_id: "delete-1" });
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-internal-health-secret": "test-health-secret"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });

  it("does not accept the operations secret even with an otherwise valid destructive signature", async () => {
    const body = JSON.stringify({ request_id: "delete-1" });
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: makeSignedHeaders(body, {
          "x-internal-destructive-ops-secret": "",
          "x-internal-operations-secret": "test-operations-secret"
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });

  it("rejects missing destructive signature headers", async () => {
    const body = JSON.stringify({ request_id: "delete-1" });
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-internal-destructive-ops-secret": "test-destructive-secret"
        }
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });

  it("rejects expired destructive signatures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:10:01.000Z"));
    const body = JSON.stringify({ request_id: "delete-1" });
    const expiredTimestamp = new Date("2026-05-24T12:00:00.000Z").getTime().toString();

    try {
      const { POST } = await import("@/app/api/internal/workspace-deletion/route");
      const response = await POST(
        new Request("http://localhost/api/internal/workspace-deletion", {
          method: "POST",
          body,
          headers: makeSignedHeaders(body, undefined, expiredTimestamp)
        })
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects tampered destructive signatures", async () => {
    const body = JSON.stringify({ request_id: "delete-1" });
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: makeSignedHeaders(body, {
          [INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER]: "deadbeef"
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });

  it("returns a safe 400 for malformed signed JSON", async () => {
    const body = "{";
    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body,
        headers: makeSignedHeaders(body)
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(executeWorkspaceDeletionRequest).not.toHaveBeenCalled();
  });
});
