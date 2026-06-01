import { beforeEach, describe, expect, it, vi } from "vitest";

const processPendingOcrJobs = vi.fn();

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
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
      code: "ERR_INTERNAL_AUTH_REQUIRED_001",
      requestId: expect.any(String)
    });
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
          "x-internal-ocr-secret": "test-ocr-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(processPendingOcrJobs).toHaveBeenCalledWith(1);
  });

  it("does not accept an operations secret on the OCR route", async () => {
    const { POST } = await import("@/app/api/internal/ocr-jobs/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ocr-jobs", {
        method: "POST",
        body: JSON.stringify({ limit: 1 }),
        headers: {
          "content-type": "application/json",
          "x-internal-operations-secret": "test-operations-secret"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(processPendingOcrJobs).not.toHaveBeenCalled();
  });

  it("returns a structured validation error for invalid limits", async () => {
    const { POST } = await import("@/app/api/internal/ocr-jobs/route");
    const response = await POST(
      new Request("http://localhost/api/internal/ocr-jobs", {
        method: "POST",
        body: JSON.stringify({ limit: 0 }),
        headers: {
          "content-type": "application/json",
          "x-internal-ocr-secret": "test-ocr-secret"
        }
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid OCR job request.",
      code: "ERR_OCR_JOB_REQUEST_INVALID",
      requestId: expect.any(String)
    });
    expect(processPendingOcrJobs).not.toHaveBeenCalled();
  });
});
