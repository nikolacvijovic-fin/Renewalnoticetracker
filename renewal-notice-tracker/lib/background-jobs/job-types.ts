import type { Json } from "@/lib/supabase/database.types";

export const BACKGROUND_JOB_TYPES = [
  "trusted_reminder_delivery",
  "contract_import_processing",
  "audit_event_flush",
  "webhook_dispatch",
  "add_on_task"
] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];

export const BACKGROUND_JOB_STATUSES = [
  "queued",
  "processing",
  "retry_scheduled",
  "completed",
  "failed",
  "dead_lettered",
  "cancelled"
] as const;

export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

export type BackgroundJobPayload = Record<string, Json | undefined>;

export type BackgroundJob = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  job_type: BackgroundJobType;
  status: BackgroundJobStatus;
  priority: number;
  idempotency_key: string;
  payload: BackgroundJobPayload;
  attempts: number;
  max_attempts: number;
  scheduled_for: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  completed_at: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BackgroundJobAttempt = {
  id: string;
  organization_id: string;
  job_id: string;
  attempt_number: number;
  status: "claimed" | "completed" | "retry_scheduled" | "failed" | "dead_lettered" | "cancelled";
  worker_id: string;
  started_at: string;
  finished_at: string | null;
  error_code: string | null;
  safe_error_message: string | null;
  metadata: BackgroundJobPayload;
};

// Attempts are operational lifecycle events, not one mutable row per retry.
// The canonical retry count remains background_jobs.attempts.

export type EnqueueBackgroundJobInput = {
  organizationId: string;
  contractId?: string | null;
  jobType: BackgroundJobType;
  idempotencyKey: string;
  payload?: BackgroundJobPayload;
  priority?: number;
  scheduledFor?: string | Date;
  maxAttempts?: number;
};

export type ClaimBackgroundJobsInput = {
  workerId: string;
  jobTypes?: BackgroundJobType[];
  limit?: number;
  now?: string | Date;
};

export type CompleteBackgroundJobInput = {
  organizationId: string;
  jobId: string;
  workerId: string;
  metadata?: BackgroundJobPayload;
};

export type FailBackgroundJobInput = {
  organizationId: string;
  jobId: string;
  workerId: string;
  errorCode: string;
  errorMessage?: string | null;
  failureCategory?: string | null;
  retryable?: boolean;
  metadata?: BackgroundJobPayload;
  now?: string | Date;
};

export type CancelBackgroundJobInput = {
  organizationId: string;
  jobId: string;
  actorUserId?: string | null;
  reasonCode?: string | null;
  workerId?: string | null;
  cancellationMode?: "worker_cancelled" | "admin_cancelled";
};

export function isBackgroundJobType(value: string): value is BackgroundJobType {
  return (BACKGROUND_JOB_TYPES as readonly string[]).includes(value);
}

export const TERMINAL_BACKGROUND_JOB_STATUSES = [
  "completed",
  "failed",
  "dead_lettered",
  "cancelled"
] as const satisfies readonly BackgroundJobStatus[];

export function isTerminalBackgroundJobStatus(status: BackgroundJobStatus) {
  return (TERMINAL_BACKGROUND_JOB_STATUSES as readonly string[]).includes(status);
}

export class BackgroundJobNotFoundError extends Error {
  constructor(message = "Background job was not found.") {
    super(message);
    this.name = "BackgroundJobNotFoundError";
  }
}

export class BackgroundJobStateConflictError extends Error {
  constructor(message = "Background job state no longer allows this transition.") {
    super(message);
    this.name = "BackgroundJobStateConflictError";
  }
}

export class BackgroundJobOwnershipError extends Error {
  constructor(message = "Background job is not owned by this worker.") {
    super(message);
    this.name = "BackgroundJobOwnershipError";
  }
}

export function assertMutableBackgroundJobStatus(status: BackgroundJobStatus) {
  if (isTerminalBackgroundJobStatus(status)) {
    throw new BackgroundJobStateConflictError("Terminal background jobs cannot be mutated.");
  }
}

export function assertWorkerOwnsJob(job: BackgroundJob, workerId: string) {
  if (job.locked_by !== workerId) {
    throw new BackgroundJobOwnershipError("Background job lock is owned by a different worker.");
  }
}
