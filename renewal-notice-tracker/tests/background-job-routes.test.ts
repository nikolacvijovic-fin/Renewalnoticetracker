import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimBackgroundJobs = vi.fn();
const completeBackgroundJob = vi.fn();
const runClaimedBackgroundJob = vi.fn();

vi.mock("@/lib/background-jobs/job-queue", () => ({
  claimBackgroundJobs,
  completeBackgroundJob,
  mapBackgroundJobError: (error: unknown) => ({
    notFound: error instanceof Error && error.name === "BackgroundJobNotFoundError",
    conflict:
      error instanceof Error &&
      (error.name === "BackgroundJobStateConflictError" || error.name === "BackgroundJobOwnershipError")
  })
}));

vi.mock("@/lib/background-jobs/job-runner", () => ({
  runClaimedBackgroundJob
}));

function signRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  body: string;
  secret: string;
}) {
  const bodySha256 = createHash("sha256").update(input.body).digest("hex");
  const payload = [input.method.toUpperCase(), input.path, input.timestamp, bodySha256].join("\n");
  return {
    bodySha256,
    signature: `sha256=${createHmac("sha256", input.secret).update(payload).digest("hex")}`
  };
}

describe("background job internal routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADD_ON_INTERNAL_SIGNING_SECRET = "test-worker-signing-secret";
    claimBackgroundJobs.mockResolvedValue([]);
    completeBackgroundJob.mockResolvedValue({ id: "job-1", status: "completed" });
    runClaimedBackgroundJob.mockResolvedValue({ jobId: "job-1", status: "completed" });
  });

  it("rejects unsigned worker claim requests before reading jobs", async () => {
    const { POST } = await import("@/app/api/internal/background-jobs/claim/route");
    const response = await POST(
      new Request("http://localhost/api/internal/background-jobs/claim", {
        method: "POST",
        body: JSON.stringify({ limit: 1 })
      })
    );

    expect(response.status).toBe(401);
    expect(claimBackgroundJobs).not.toHaveBeenCalled();
  });

  it("accepts valid signed claim requests and can process claimed trusted reminder jobs", async () => {
    const path = "/api/internal/background-jobs/claim";
    const body = JSON.stringify({
      limit: 1,
      jobTypes: ["trusted_reminder_delivery"],
      processTrustedReminders: true
    });
    const timestamp = new Date().toISOString();
    const signed = signRequest({
      method: "POST",
      path,
      timestamp,
      body,
      secret: "test-worker-signing-secret"
    });
    const claimedJob = {
      id: "job-1",
      organization_id: "org-1",
      contract_id: "contract-1",
      job_type: "trusted_reminder_delivery",
      status: "processing",
      attempts: 0,
      max_attempts: 3,
      payload: { reminder_id: "reminder-1" }
    };
    claimBackgroundJobs.mockResolvedValue([claimedJob]);
    const { POST } = await import("@/app/api/internal/background-jobs/claim/route");

    const response = await POST(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-noticecontrol-worker-id": "worker-1",
          "x-noticecontrol-timestamp": timestamp,
          "x-noticecontrol-body-sha256": signed.bodySha256,
          "x-noticecontrol-signature": signed.signature
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(claimBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "worker-1",
        jobTypes: ["trusted_reminder_delivery"],
        limit: 1
      })
    );
    expect(runClaimedBackgroundJob).toHaveBeenCalledWith({
      job: claimedJob,
      workerId: "worker-1"
    });
    expect(payload.results).toEqual([{ jobId: "job-1", status: "completed" }]);
  });

  it("rejects invalid signatures before reading jobs", async () => {
    const path = "/api/internal/background-jobs/claim";
    const body = JSON.stringify({ limit: 1 });
    const timestamp = new Date().toISOString();
    const signed = signRequest({
      method: "POST",
      path,
      timestamp,
      body,
      secret: "wrong-secret"
    });
    const { POST } = await import("@/app/api/internal/background-jobs/claim/route");

    const response = await POST(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-noticecontrol-worker-id": "worker-1",
          "x-noticecontrol-timestamp": timestamp,
          "x-noticecontrol-body-sha256": signed.bodySha256,
          "x-noticecontrol-signature": signed.signature
        }
      })
    );

    expect(response.status).toBe(401);
    expect(claimBackgroundJobs).not.toHaveBeenCalled();
  });

  it("maps stale completion ownership conflicts to a safe conflict response", async () => {
    const path = "/api/internal/background-jobs/complete";
    const body = JSON.stringify({
      organizationId: "22222222-2222-4222-8222-222222222222",
      jobId: "11111111-1111-4111-8111-111111111111"
    });
    const timestamp = new Date().toISOString();
    const signed = signRequest({
      method: "POST",
      path,
      timestamp,
      body,
      secret: "test-worker-signing-secret"
    });
    const ownershipError = new Error("Background job lock is owned by a different worker.");
    ownershipError.name = "BackgroundJobOwnershipError";
    completeBackgroundJob.mockRejectedValue(ownershipError);
    const { POST } = await import("@/app/api/internal/background-jobs/complete/route");

    const response = await POST(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-noticecontrol-worker-id": "worker-2",
          "x-noticecontrol-timestamp": timestamp,
          "x-noticecontrol-body-sha256": signed.bodySha256,
          "x-noticecontrol-signature": signed.signature
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("ERR_BACKGROUND_JOB_STATE_CONFLICT_001");
    expect(payload.error).not.toContain("worker-1");
  });
});
