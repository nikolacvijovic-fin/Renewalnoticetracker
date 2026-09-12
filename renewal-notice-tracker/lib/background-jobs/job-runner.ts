import type { BackgroundJob } from "@/lib/background-jobs/job-types";
import { completeBackgroundJob, failBackgroundJob } from "@/lib/background-jobs/job-queue";
import { processTrustedReminderDeliveryBackgroundJob } from "@/lib/background-jobs/trusted-reminder-delivery";
import {
  markContractPdfExtractionTerminalFailure,
  PdfExtractionJobError,
  processContractPdfExtractionBackgroundJob
} from "@/lib/contracts/pdf-extraction-job";

export type BackgroundJobRunResult = {
  jobId: string;
  status: "completed" | "retry_scheduled" | "failed" | "dead_lettered" | "unsupported";
  code?: string;
};

export async function runClaimedBackgroundJob(input: {
  job: BackgroundJob;
  workerId: string;
}): Promise<BackgroundJobRunResult> {
  if (input.job.job_type === "contract_pdf_extraction") {
    try {
      const result = await processContractPdfExtractionBackgroundJob(input);
      const completed = await completeBackgroundJob({
        organizationId: input.job.organization_id,
        jobId: input.job.id,
        workerId: input.workerId,
        metadata: {
          contract_id: result.contractId,
          contract_file_id: result.contractFileId,
          upload_attempt_id: result.uploadAttemptId,
          status: result.status
        }
      });
      return { jobId: completed.id, status: "completed" };
    } catch (error) {
      const retryable = error instanceof PdfExtractionJobError ? error.retryable : true;
      const code = error instanceof PdfExtractionJobError
        ? error.code
        : "ERR_PDF_EXTRACTION_BACKGROUND_001";
      const failed = await failBackgroundJob({
        organizationId: input.job.organization_id,
        jobId: input.job.id,
        workerId: input.workerId,
        errorCode: code,
        errorMessage: error instanceof PdfExtractionJobError
          ? error.message
          : "PDF extraction failed before review data was ready.",
        failureCategory: retryable ? "upstream_provider_failed" : "background_job_failed",
        retryable
      });
      if (["failed", "dead_lettered"].includes(failed.status)) {
        await markContractPdfExtractionTerminalFailure({ job: input.job, failureCode: code });
      }
      return {
        jobId: failed.id,
        status: failed.status as BackgroundJobRunResult["status"],
        code: failed.last_error_code ?? code
      };
    }
  }

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
