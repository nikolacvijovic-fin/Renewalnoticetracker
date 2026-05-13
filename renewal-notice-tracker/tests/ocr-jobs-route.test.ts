import { beforeEach, describe, expect, it, vi } from "vitest";

const processPendingOcrJobs = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_HEALTH_SECRET: "secret"
  }
}));

vi.mock("@/lib/ocr/jobs", () => ({
  processPendingOcrJobs
}));

describe("OCR jobs internal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    const { POST } = await import("@/app/api/internal/ocr-jobs/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ocr-jobs", {
        method: "POST",
        body: JSON.stringify({ limit: 1 }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(401);
    expect(processPendingOcrJobs).not.toHaveBeenCalled();
  });

  it("processes authorized OCR jobs", async () => {
    processPendingOcrJobs.mockResolvedValue([{ id: "job-1", status: "completed" }]);

    const { POST } = await import("@/app/api/internal/ocr-jobs/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ocr-jobs", {
        method: "POST",
        body: JSON.stringify({ limit: 1 }),
        headers: {
          "content-type": "application/json",
          "x-internal-health-secret": "secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(processPendingOcrJobs).toHaveBeenCalledWith(1);
  });
});
