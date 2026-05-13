import { beforeEach, describe, expect, it, vi } from "vitest";

const executeWorkspaceDeletionRequest = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_HEALTH_SECRET: "secret"
  }
}));

vi.mock("@/lib/organization/workspace-deletion", () => ({
  executeWorkspaceDeletionRequest
}));

describe("workspace deletion internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    const { POST } = await import("@/app/api/internal/workspace-deletion/route");
    const response = await POST(
      new Request("http://localhost/api/internal/workspace-deletion", {
        method: "POST",
        body: JSON.stringify({ request_id: "delete-1" }),
        headers: {
          "content-type": "application/json",
          "x-internal-health-secret": "secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(executeWorkspaceDeletionRequest).toHaveBeenCalledWith("delete-1");
  });
});
