import type { BackgroundJob } from "@/lib/background-jobs/job-types";
import { completeBackgroundJob, failBackgroundJob } from "@/lib/background-jobs/job-queue";
import { processTrustedReminderDeliveryBackgroundJob } from "@/lib/background-jobs/trusted-reminder-delivery";

export type BackgroundJobRunResult = {
  jobId: string;
  status: "completed" | "retry_scheduled" | "failed" | "dead_lettered" | "unsupported";
  code?: string;
};

export async function runClaimedBackgroundJob(input: {
  job: BackgroundJob;
  workerId: string;
}): Promise<BackgroundJobRunResult> {
  if (input.job.job_type !== "trusted_reminder_delivery") {
    const failed = await failBackgroundJob({
      organizationId: input.job.organization_id,
      jobId: input.job.id,
      workerId: input.workerId,
      errorCode: "ERR_BACKGROUND_JOB_UNSUPPORTED_TYPE_001",
      errorMessage: "Unsupported background job type.",
      failureCategory: "validation_failed",
      retryable: false
    });
    return { jobId: failed.id, status: failed.status as BackgroundJobRunResult["status"], code: failed.last_error_code ?? undefined };
  }

  try {
    const result = await processTrustedReminderDeliveryBackgroundJob({
      job: input.job,
      workerId: input.workerId
    });

    if (result.status === "blocked_by_gate") {
      const failed = await failBackgroundJob({
        organizationId: input.job.organization_id,
        jobId: input.job.id,
        workerId: input.workerId,
        errorCode: "ERR_TRUSTED_REMINDER_GATE_BLOCKED_001",
        errorMessage: result.safeMessage,
        failureCategory: "trusted_gate_blocked",
        retryable: false,
        metadata: {
          reminder_id: result.reminderId,
          blocker_code: result.blockerCode
        }
      });
      return { jobId: failed.id, status: failed.status as BackgroundJobRunResult["status"], code: failed.last_error_code ?? undefined };
    }

    const completed = await completeBackgroundJob({
      organizationId: input.job.organization_id,
      jobId: input.job.id,
      workerId: input.workerId,
      metadata: {
        reminder_id: result.reminderId,
        delivery_count: result.deliveryCount,
        duplicate_suppressed_count: result.duplicateSuppressedCount
      }
    });
    return { jobId: completed.id, status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reminder delivery failed.";
    const retryable = /timeout|temporar|unavailable|rate|429|500|502|503|504/i.test(message);
    const failed = await failBackgroundJob({
      organizationId: input.job.organization_id,
      jobId: input.job.id,
      workerId: input.workerId,
      errorCode: retryable
        ? "ERR_TRUSTED_REMINDER_DELIVERY_TRANSIENT_001"
        : "ERR_TRUSTED_REMINDER_DELIVERY_PERMANENT_001",
      errorMessage: message,
      failureCategory: retryable ? "upstream_provider_failed" : "background_job_failed",
      retryable
    });
    return { jobId: failed.id, status: failed.status as BackgroundJobRunResult["status"], code: failed.last_error_code ?? undefined };
  }
}
