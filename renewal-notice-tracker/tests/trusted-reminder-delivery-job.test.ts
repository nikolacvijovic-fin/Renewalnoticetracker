import { beforeEach, describe, expect, it, vi } from "vitest";

const processTrustedReminderDeliveryJob = vi.fn();

vi.mock("@/lib/notifications/reminders", () => ({
  processTrustedReminderDeliveryJob
}));

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    contract_id: "33333333-3333-4333-8333-333333333333",
    job_type: "trusted_reminder_delivery",
    status: "processing",
    priority: 100,
    idempotency_key: "trusted_reminder_delivery:reminder-1:2030",
    payload: {
      reminder_id: "reminder-1",
      contract_id: "33333333-3333-4333-8333-333333333333",
      remind_at: "2030-01-01T00:00:00.000Z"
    },
    attempts: 0,
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

describe("trusted reminder delivery background job processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processTrustedReminderDeliveryJob.mockResolvedValue({
      status: "sent",
      reminderId: "reminder-1",
      deliveryCount: 1,
      duplicateSuppressedCount: 0
    });
  });

  it("rejects the wrong job type before delivery", async () => {
    const { processTrustedReminderDeliveryBackgroundJob } = await import(
      "@/lib/background-jobs/trusted-reminder-delivery"
    );

    await expect(
      processTrustedReminderDeliveryBackgroundJob({
        job: job({ job_type: "contract_import_processing" }) as never,
        workerId: "worker-1"
      })
    ).rejects.toThrow("unsupported job type");
    expect(processTrustedReminderDeliveryJob).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads before delivery", async () => {
    const { processTrustedReminderDeliveryBackgroundJob } = await import(
      "@/lib/background-jobs/trusted-reminder-delivery"
    );

    await expect(
      processTrustedReminderDeliveryBackgroundJob({
        job: job({ payload: { contract_id: "contract-1", remind_at: "2030-01-01T00:00:00.000Z" } }) as never,
        workerId: "worker-1"
      })
    ).rejects.toThrow("missing reminder_id");
    expect(processTrustedReminderDeliveryJob).not.toHaveBeenCalled();
  });

  it("passes valid jobs to the existing org-scoped reminder delivery path", async () => {
    const { processTrustedReminderDeliveryBackgroundJob } = await import(
      "@/lib/background-jobs/trusted-reminder-delivery"
    );

    const result = await processTrustedReminderDeliveryBackgroundJob({
      job: job() as never,
      workerId: "worker-1"
    });

    expect(processTrustedReminderDeliveryJob).toHaveBeenCalledWith({
      organizationId: "22222222-2222-4222-8222-222222222222",
      reminderId: "reminder-1",
      workerId: "worker-1"
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: "sent",
        contractId: "33333333-3333-4333-8333-333333333333",
        remindAt: "2030-01-01T00:00:00.000Z"
      })
    );
  });
});
