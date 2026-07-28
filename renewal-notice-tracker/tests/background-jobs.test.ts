import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  insertAdminBackgroundJob: vi.fn(),
  getAdminBackgroundJobByIdempotencyKey: vi.fn(),
  listAdminClaimableBackgroundJobs: vi.fn(),
  claimAdminBackgroundJob: vi.fn(),
  completeAdminBackgroundJob: vi.fn(),
  failAdminBackgroundJob: vi.fn(),
  cancelAdminBackgroundJob: vi.fn(),
  insertAdminBackgroundJobAttempt: vi.fn(),
  getAdminBackgroundJobById: vi.fn()
}));
const recordEnterpriseAuditEvent = vi.fn();

vi.mock("@/lib/background-jobs/repositories/admin-background-jobs-repository", () => repo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => ({
  recordEnterpriseAuditEvent
}));

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    contract_id: "33333333-3333-4333-8333-333333333333",
    job_type: "trusted_reminder_delivery",
    status: "queued",
    priority: 100,
    idempotency_key: "trusted_reminder_delivery:reminder-1:2030",
    payload: { reminder_id: "reminder-1", contract_id: "contract-1" },
    attempts: 0,
    max_attempts: 3,
    scheduled_for: "2030-01-01T00:00:00.000Z",
    locked_at: null,
    locked_by: null,
    last_error_code: null,
    last_error_message: null,
    completed_at: null,
    dead_lettered_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("background job queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    repo.insertAdminBackgroundJobAttempt.mockResolvedValue({ data: {}, error: null });
  });

  it("enqueues trusted reminder jobs idempotently by organization and idempotency key", async () => {
    const queued = job();
    repo.insertAdminBackgroundJob.mockResolvedValue({ data: queued, error: null });
    const { enqueueTrustedReminderDeliveryJob } = await import("@/lib/background-jobs/job-queue");

    const result = await enqueueTrustedReminderDeliveryJob({
      organizationId: queued.organization_id,
      contractId: queued.contract_id,
      reminderId: "reminder-1",
      remindAt: "2030-01-01T00:00:00.000Z"
    });

    expect(result).toEqual(queued);
    expect(repo.insertAdminBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: queued.organization_id,
        contractId: queued.contract_id,
        jobType: "trusted_reminder_delivery",
        idempotencyKey: "trusted_reminder_delivery:reminder-1:2030-01-01T00:00:00.000Z"
      })
    );
    expect(recordEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "trusted_reminder_delivery.enqueued",
        eventCategory: "trusted_reminder"
      })
    );
  });

  it("returns an existing duplicate job without overwriting payload or schedule", async () => {
    const existing = job({
      payload: { reminder_id: "original-reminder" },
      scheduled_for: "2030-01-01T00:00:00.000Z",
      priority: 50
    });
    const uniqueError = Object.assign(new Error("duplicate key"), { code: "23505" });
    repo.insertAdminBackgroundJob.mockResolvedValue({ data: null, error: uniqueError });
    repo.getAdminBackgroundJobByIdempotencyKey.mockResolvedValue({ data: existing, error: null });
    const { enqueueBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await enqueueBackgroundJob({
      organizationId: existing.organization_id,
      contractId: "new-contract",
      jobType: "trusted_reminder_delivery",
      idempotencyKey: existing.idempotency_key,
      payload: { reminder_id: "new-reminder" },
      priority: 1,
      scheduledFor: "2040-01-01T00:00:00.000Z"
    });

    expect(result).toEqual(existing);
    expect(repo.getAdminBackgroundJobByIdempotencyKey).toHaveBeenCalledWith({
      organizationId: existing.organization_id,
      idempotencyKey: existing.idempotency_key
    });
    expect(recordEnterpriseAuditEvent).not.toHaveBeenCalled();
  });

  it("does not revive terminal duplicate jobs during enqueue", async () => {
    const completed = job({ status: "completed", completed_at: "2030-01-01T00:01:00.000Z" });
    const uniqueError = Object.assign(new Error("duplicate key"), { code: "23505" });
    repo.insertAdminBackgroundJob.mockResolvedValue({ data: null, error: uniqueError });
    repo.getAdminBackgroundJobByIdempotencyKey.mockResolvedValue({ data: completed, error: null });
    const { enqueueBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await enqueueBackgroundJob({
      organizationId: completed.organization_id,
      contractId: completed.contract_id,
      jobType: "trusted_reminder_delivery",
      idempotencyKey: completed.idempotency_key,
      payload: { reminder_id: "new-reminder" },
      scheduledFor: "2040-01-01T00:00:00.000Z"
    });

    expect(result.status).toBe("completed");
    expect(repo.insertAdminBackgroundJob).toHaveBeenCalled();
    expect(repo.completeAdminBackgroundJob).not.toHaveBeenCalled();
    expect(repo.failAdminBackgroundJob).not.toHaveBeenCalled();
  });

  it("claims only repository-selected due jobs and records a claimed attempt", async () => {
    const queued = job();
    const claimed = job({ status: "processing", locked_by: "worker-1" });
    repo.listAdminClaimableBackgroundJobs.mockResolvedValue({ data: [queued], error: null });
    repo.claimAdminBackgroundJob.mockResolvedValue({ data: claimed, error: null });
    const { claimBackgroundJobs } = await import("@/lib/background-jobs/job-queue");

    const result = await claimBackgroundJobs({
      workerId: "worker-1",
      jobTypes: ["trusted_reminder_delivery"],
      limit: 1,
      now: "2030-01-01T00:00:00.000Z"
    });

    expect(result).toEqual([claimed]);
    expect(repo.listAdminClaimableBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: ["trusted_reminder_delivery"],
        limit: 1,
        nowIso: "2030-01-01T00:00:00.000Z"
      })
    );
    expect(repo.claimAdminBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: queued.organization_id,
        jobId: queued.id,
        workerId: "worker-1"
      })
    );
    expect(repo.insertAdminBackgroundJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "claimed",
        workerId: "worker-1",
        attemptNumber: 1
      })
    );
  });

  it("completes a processing job only when the worker owns the lock", async () => {
    const current = job({ status: "processing", locked_by: "worker-1" });
    const completed = job({ status: "completed", locked_by: null, completed_at: "2030-01-01T00:01:00.000Z" });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    repo.completeAdminBackgroundJob.mockResolvedValue({ data: completed, error: null });
    const { completeBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await completeBackgroundJob({
      organizationId: current.organization_id,
      jobId: current.id,
      workerId: "worker-1"
    });

    expect(result.status).toBe("completed");
    expect(repo.completeAdminBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "worker-1"
      })
    );
  });

  it("rejects completion from the wrong worker before mutating", async () => {
    const current = job({ status: "processing", locked_by: "worker-1" });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    const { completeBackgroundJob, mapBackgroundJobError } = await import("@/lib/background-jobs/job-queue");

    await expect(
      completeBackgroundJob({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "worker-2"
      })
    ).rejects.toMatchObject({ name: "BackgroundJobOwnershipError" });
    expect(repo.completeAdminBackgroundJob).not.toHaveBeenCalled();

    try {
      await completeBackgroundJob({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "worker-2"
      });
    } catch (error) {
      expect(mapBackgroundJobError(error).conflict).toBe(true);
    }
  });

  it.each([
    ["completed"],
    ["dead_lettered"],
    ["cancelled"],
    ["failed"]
  ])("does not complete terminal %s jobs", async (status) => {
    const current = job({ status, locked_by: "worker-1" });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    const { completeBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      completeBackgroundJob({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "worker-1"
      })
    ).rejects.toMatchObject({ name: "BackgroundJobStateConflictError" });
    expect(repo.completeAdminBackgroundJob).not.toHaveBeenCalled();
  });

  it("schedules transient failures with safe redacted errors", async () => {
    const current = job({ attempts: 1, max_attempts: 5, status: "processing", locked_by: "worker-1" });
    const failed = job({
      attempts: 2,
      status: "retry_scheduled",
      last_error_code: "ERR_BACKGROUND_JOB_PROVIDER_001",
      last_error_message: "Background job failed with redacted sensitive details."
    });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    repo.failAdminBackgroundJob.mockResolvedValue({ data: failed, error: null });
    const { failBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await failBackgroundJob({
      organizationId: current.organization_id,
      jobId: current.id,
      workerId: "worker-1",
      errorCode: "ERR_BACKGROUND_JOB_PROVIDER_001",
      errorMessage: "provider payload with raw contract text and token should never leak",
      failureCategory: "upstream_provider_failed",
      retryable: true,
      now: "2030-01-01T00:00:00.000Z"
    });

    expect(result.status).toBe("retry_scheduled");
    expect(JSON.stringify(repo.failAdminBackgroundJob.mock.calls)).not.toContain("raw contract text");
    expect(JSON.stringify(repo.failAdminBackgroundJob.mock.calls)).not.toContain("token should never leak");
    expect(repo.insertAdminBackgroundJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retry_scheduled",
        errorCode: "ERR_BACKGROUND_JOB_PROVIDER_001",
        safeErrorMessage: "Background job failed with redacted sensitive details."
      })
    );
  });

  it("rejects stale worker failure before mutating", async () => {
    const current = job({ status: "processing", locked_by: "new-worker" });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    const { failBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      failBackgroundJob({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "old-worker",
        errorCode: "ERR_BACKGROUND_JOB_PROVIDER_001",
        retryable: true
      })
    ).rejects.toMatchObject({ name: "BackgroundJobOwnershipError" });
    expect(repo.failAdminBackgroundJob).not.toHaveBeenCalled();
  });

  it("does not fail completed jobs", async () => {
    const current = job({ status: "completed", locked_by: null });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    const { failBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      failBackgroundJob({
        organizationId: current.organization_id,
        jobId: current.id,
        workerId: "worker-1",
        errorCode: "ERR_BACKGROUND_JOB_PROVIDER_001",
        retryable: true
      })
    ).rejects.toMatchObject({ name: "BackgroundJobStateConflictError" });
    expect(repo.failAdminBackgroundJob).not.toHaveBeenCalled();
  });

  it("dead-letters retryable failures after max attempts", async () => {
    const current = job({ attempts: 2, max_attempts: 3, status: "processing", locked_by: "worker-1" });
    const failed = job({ attempts: 3, status: "dead_lettered" });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    repo.failAdminBackgroundJob.mockResolvedValue({ data: failed, error: null });
    const { failBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await failBackgroundJob({
      organizationId: current.organization_id,
      jobId: current.id,
      workerId: "worker-1",
      errorCode: "ERR_BACKGROUND_JOB_PROVIDER_001",
      errorMessage: "temporary provider outage",
      failureCategory: "upstream_provider_failed",
      retryable: true
    });

    expect(result.status).toBe("dead_lettered");
    expect(repo.failAdminBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "dead_lettered",
          dead_lettered_at: expect.any(String)
        })
      })
    );
  });
});
