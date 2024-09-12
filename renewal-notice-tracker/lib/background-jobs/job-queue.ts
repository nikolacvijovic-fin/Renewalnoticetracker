import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import type {
  BackgroundJob,
  BackgroundJobPayload,
  ClaimBackgroundJobsInput,
  CompleteBackgroundJobInput,
  EnqueueBackgroundJobInput,
  FailBackgroundJobInput,
  CancelBackgroundJobInput
} from "@/lib/background-jobs/job-types";
import {
  claimAdminBackgroundJob,
  getAdminBackgroundJobById,
  insertAdminBackgroundJobAttempt,
  listAdminClaimableBackgroundJobs,
  updateAdminBackgroundJobState,
  upsertAdminBackgroundJob
} from "@/lib/background-jobs/repositories/admin-background-jobs-repository";
import {
  classifyJobFailure,
  computeNextRetryAt,
  sanitizeJobErrorMessage
} from "@/lib/background-jobs/retry-policy";

const DEFAULT_PRIORITY = 100;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CLAIM_LIMIT = 10;

function iso(value: string | Date | undefined, fallback = new Date()) {
  if (!value) return fallback.toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function reminderAuditEventForJob(job: BackgroundJob, eventType: string, metadata?: BackgroundJobPayload) {
  if (job.job_type !== "trusted_reminder_delivery") return Promise.resolve();
  return recordEnterpriseAuditEvent({
    organizationId: job.organization_id,
    contractId: job.contract_id,
    eventType,
    eventCategory: "trusted_reminder",
    eventSource: "trusted_reminder_delivery",
    severity: eventType.includes("dead_lettered") || eventType.includes("blocked") ? "warning" : "info",
    metadata: {
      jobId: job.id,
      jobType: job.job_type,
      status: job.status,
      attempts: job.attempts,
      idempotencyKey: job.idempotency_key,
      ...metadata
    },
    mode: "best_effort"
  });
}

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput) {
  const organizationId = requireNonEmpty(input.organizationId, "organizationId");
  const idempotencyKey = requireNonEmpty(input.idempotencyKey, "idempotencyKey");
  const { data, error } = await upsertAdminBackgroundJob({
    organizationId,
    contractId: input.contractId ?? null,
    jobType: input.jobType,
    idempotencyKey,
    payload: input.payload ?? {},
    priority: input.priority ?? DEFAULT_PRIORITY,
    scheduledFor: iso(input.scheduledFor),
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  });

  if (error) throw error;
  if (!data) throw new Error("Background job enqueue returned no row.");

  await reminderAuditEventForJob(data, "trusted_reminder_delivery.enqueued");
  return data;
}

export function enqueueTrustedReminderDeliveryJob(input: {
  organizationId: string;
  contractId: string;
  reminderId: string;
  remindAt: string;
  scheduledFor?: string | Date;
}) {
  return enqueueBackgroundJob({
    organizationId: input.organizationId,
    contractId: input.contractId,
    jobType: "trusted_reminder_delivery",
    idempotencyKey: `trusted_reminder_delivery:${input.reminderId}:${input.remindAt}`,
    payload: {
      reminder_id: input.reminderId,
      contract_id: input.contractId,
      remind_at: input.remindAt
    },
    scheduledFor: input.scheduledFor
  });
}

export async function claimBackgroundJobs(input: ClaimBackgroundJobsInput) {
  const workerId = requireNonEmpty(input.workerId, "workerId");
  const nowIso = iso(input.now);
  const { data, error } = await listAdminClaimableBackgroundJobs({
    jobTypes: input.jobTypes,
    limit: Math.min(Math.max(input.limit ?? DEFAULT_CLAIM_LIMIT, 1), 50),
    nowIso
  });
  if (error) throw error;

  const claimed: BackgroundJob[] = [];
  for (const job of data ?? []) {
    const result = await claimAdminBackgroundJob({
      organizationId: job.organization_id,
      jobId: job.id,
      workerId,
      nowIso
    });
    if (result.error) throw result.error;
    if (!result.data) continue;
    const attemptNumber = result.data.attempts + 1;
    await insertAdminBackgroundJobAttempt({
      organizationId: result.data.organization_id,
      jobId: result.data.id,
      attemptNumber,
      status: "claimed",
      workerId,
      metadata: { locked_at: nowIso }
    });
    await reminderAuditEventForJob(result.data, "trusted_reminder_delivery.claimed", {
      workerId,
      attemptNumber
    });
    claimed.push(result.data);
  }

  return claimed;
}

export async function completeBackgroundJob(input: CompleteBackgroundJobInput) {
  const nowIso = new Date().toISOString();
  const current = await getRequiredJob(input.organizationId, input.jobId);
  const { data, error } = await updateAdminBackgroundJobState({
    organizationId: input.organizationId,
    jobId: input.jobId,
    update: {
      status: "completed",
      completed_at: nowIso,
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: nowIso
    }
  });
  if (error) throw error;
  if (!data) throw new Error("Background job completion returned no row.");

  await insertAdminBackgroundJobAttempt({
    organizationId: input.organizationId,
    jobId: input.jobId,
    attemptNumber: current.attempts + 1,
    status: "completed",
    workerId: input.workerId,
    finishedAt: nowIso,
    metadata: input.metadata ?? {}
  });
  await reminderAuditEventForJob(data, "trusted_reminder_delivery.sent", input.metadata);
  return data;
}

export async function failBackgroundJob(input: FailBackgroundJobInput) {
  const now = input.now instanceof Date ? input.now : input.now ? new Date(input.now) : new Date();
  const nowIso = now.toISOString();
  const current = await getRequiredJob(input.organizationId, input.jobId);
  const attemptNumber = current.attempts + 1;
  const classified = classifyJobFailure({
    error: input.errorMessage ?? input.errorCode,
    code: input.errorCode,
    category: input.failureCategory as never,
    retryable: input.retryable
  });
  const retryable = classified.retryable && attemptNumber < current.max_attempts;
  const exhausted = classified.retryable && attemptNumber >= current.max_attempts;
  const status = retryable ? "retry_scheduled" : exhausted ? "dead_lettered" : "failed";
  const nextRetryAt = retryable ? computeNextRetryAt({ attemptNumber, now }) : null;
  const safeErrorMessage = sanitizeJobErrorMessage(input.errorMessage ?? classified.safeMessage);

  const { data, error } = await updateAdminBackgroundJobState({
    organizationId: input.organizationId,
    jobId: input.jobId,
    update: {
      status,
      attempts: attemptNumber,
      scheduled_for: nextRetryAt ?? current.scheduled_for,
      locked_at: null,
      locked_by: null,
      last_error_code: classified.code,
      last_error_message: safeErrorMessage,
      dead_lettered_at: status === "dead_lettered" ? nowIso : current.dead_lettered_at,
      updated_at: nowIso
    }
  });
  if (error) throw error;
  if (!data) throw new Error("Background job failure returned no row.");

  await insertAdminBackgroundJobAttempt({
    organizationId: input.organizationId,
    jobId: input.jobId,
    attemptNumber,
    status: status === "retry_scheduled" ? "retry_scheduled" : status,
    workerId: input.workerId,
    finishedAt: nowIso,
    errorCode: classified.code,
    safeErrorMessage,
    metadata: {
      failure_category: classified.category,
      next_retry_at: nextRetryAt,
      ...(input.metadata ?? {})
    }
  });

  await reminderAuditEventForJob(
    data,
    status === "retry_scheduled"
      ? "trusted_reminder_delivery.retry_scheduled"
      : status === "dead_lettered"
        ? "trusted_reminder_delivery.dead_lettered"
        : classified.category === "trusted_gate_blocked"
          ? "trusted_reminder_delivery.blocked_by_gate"
          : "trusted_reminder_delivery.failed",
    {
      failureCode: classified.code,
      failureCategory: classified.category,
      nextRetryAt,
      attemptNumber
    }
  );

  return data;
}

export async function cancelBackgroundJob(input: CancelBackgroundJobInput) {
  const nowIso = new Date().toISOString();
  const { data, error } = await updateAdminBackgroundJobState({
    organizationId: input.organizationId,
    jobId: input.jobId,
    update: {
      status: "cancelled",
      locked_at: null,
      locked_by: null,
      last_error_code: input.reasonCode ?? "ERR_BACKGROUND_JOB_CANCELLED_001",
      last_error_message: "Background job was cancelled.",
      updated_at: nowIso
    }
  });
  if (error) throw error;
  if (!data) throw new Error("Background job cancellation returned no row.");

  await insertAdminBackgroundJobAttempt({
    organizationId: input.organizationId,
    jobId: input.jobId,
    attemptNumber: data.attempts + 1,
    status: "cancelled",
    workerId: input.workerId ?? input.actorUserId ?? "internal",
    finishedAt: nowIso,
    errorCode: input.reasonCode ?? "ERR_BACKGROUND_JOB_CANCELLED_001",
    safeErrorMessage: "Background job was cancelled."
  });
  await reminderAuditEventForJob(data, "trusted_reminder_delivery.cancelled", {
    reasonCode: input.reasonCode ?? "cancelled"
  });
  return data;
}

async function getRequiredJob(organizationId: string, jobId: string) {
  const { data, error } = await getAdminBackgroundJobById({ organizationId, jobId });
  if (error) throw error;
  if (!data) throw new Error("Background job not found.");
  return data;
}
