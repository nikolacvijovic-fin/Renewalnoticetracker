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
const audit = vi.hoisted(() => ({ recordEnterpriseAuditEvent: vi.fn() }));

vi.mock("@/lib/background-jobs/repositories/admin-background-jobs-repository", () => repo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => audit);

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    job_type: "trusted_reminder_delivery",
    status: "processing",
    priority: 100,
    idempotency_key: "trusted_reminder_delivery:reminder-1:2030",
    payload: { reminder_id: "reminder-1" },
    attempts: 1,
    max_attempts: 3,
    scheduled_for: "2030-01-01T00:00:00.000Z",
    locked_at: "2030-01-01T00:00:00.000Z",
    locked_by: "worker-1",
    last_error_code: null,
    last_error_message: null,
    completed_at: null,
    dead_lettered_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("background job cancellation hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    repo.insertAdminBackgroundJobAttempt.mockResolvedValue({ data: {}, error: null });
  });

  it("allows the owning worker to cancel a processing job and records worker cancellation metadata", async () => {
    const current = job();
    const cancelled = job({ status: "cancelled", locked_by: null });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    repo.cancelAdminBackgroundJob.mockResolvedValue({ data: cancelled, error: null });
    const { cancelBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    const result = await cancelBackgroundJob({
      organizationId: "org-1",
      jobId: "job-1",
      workerId: "worker-1",
      reasonCode: "worker_no_longer_needs_job"
    });

    expect(result.status).toBe("cancelled");
    expect(repo.insertAdminBackgroundJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        workerId: "worker-1",
        metadata: {
          cancellation_mode: "worker_cancelled",
          reason_code: "worker_no_longer_needs_job"
        }
      })
    );
  });

  it("rejects processing cancellation from stale workers before mutation", async () => {
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: job({ locked_by: "worker-2" }), error: null });
    const { cancelBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      cancelBackgroundJob({
        organizationId: "org-1",
        jobId: "job-1",
        workerId: "worker-1"
      })
    ).rejects.toMatchObject({ name: "BackgroundJobOwnershipError" });
    expect(repo.cancelAdminBackgroundJob).not.toHaveBeenCalled();
    expect(repo.insertAdminBackgroundJobAttempt).not.toHaveBeenCalled();
  });

  it("requires explicit admin actor and reason for admin cancellation", async () => {
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: job(), error: null });
    const { cancelBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      cancelBackgroundJob({
        organizationId: "org-1",
        jobId: "job-1",
        cancellationMode: "admin_cancelled",
        actorUserId: "admin-1"
      })
    ).rejects.toMatchObject({ name: "BackgroundJobStateConflictError" });
    expect(repo.cancelAdminBackgroundJob).not.toHaveBeenCalled();
  });

  it("allows explicit admin cancellation and writes a separate admin audit event", async () => {
    const current = job({ locked_by: "worker-2" });
    const cancelled = job({ status: "cancelled", locked_by: null });
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: current, error: null });
    repo.cancelAdminBackgroundJob.mockResolvedValue({ data: cancelled, error: null });
    const { cancelBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await cancelBackgroundJob({
      organizationId: "org-1",
      jobId: "job-1",
      cancellationMode: "admin_cancelled",
      actorUserId: "admin-1",
      reasonCode: "admin_rescue_cancel"
    });

    expect(repo.cancelAdminBackgroundJob).toHaveBeenCalled();
    expect(repo.insertAdminBackgroundJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "admin-1",
        errorCode: "admin_rescue_cancel",
        metadata: {
          cancellation_mode: "admin_cancelled",
          reason_code: "admin_rescue_cancel"
        }
      })
    );
    expect(audit.recordEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "background_job.admin_cancelled",
        actorUserId: "admin-1",
        metadata: expect.objectContaining({
          cancellationMode: "admin_cancelled",
          reasonCode: "admin_rescue_cancel"
        })
      })
    );
  });

  it("does not cancel terminal jobs", async () => {
    repo.getAdminBackgroundJobById.mockResolvedValue({ data: job({ status: "completed", locked_by: null }), error: null });
    const { cancelBackgroundJob } = await import("@/lib/background-jobs/job-queue");

    await expect(
      cancelBackgroundJob({
        organizationId: "org-1",
        jobId: "job-1",
        workerId: "worker-1"
      })
    ).rejects.toMatchObject({ name: "BackgroundJobStateConflictError" });
    expect(repo.cancelAdminBackgroundJob).not.toHaveBeenCalled();
  });
});
