import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  BackgroundJob,
  BackgroundJobAttempt,
  BackgroundJobPayload,
  BackgroundJobStatus,
  BackgroundJobType
} from "@/lib/background-jobs/job-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function upsertAdminBackgroundJob(input: {
  organizationId: string;
  contractId: string | null;
  jobType: BackgroundJobType;
  idempotencyKey: string;
  payload: BackgroundJobPayload;
  priority: number;
  scheduledFor: string;
  maxAttempts: number;
}) {
  return admin()
    .from("background_jobs")
    .upsert(
      {
        organization_id: input.organizationId,
        contract_id: input.contractId,
        job_type: input.jobType,
        idempotency_key: input.idempotencyKey,
        payload: input.payload,
        priority: input.priority,
        scheduled_for: input.scheduledFor,
        max_attempts: input.maxAttempts,
        updated_at: new Date().toISOString()
      } as never,
      { onConflict: "organization_id,idempotency_key", ignoreDuplicates: false }
    )
    .select("*")
    .single() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function insertAdminBackgroundJob(input: {
  organizationId: string;
  contractId: string | null;
  jobType: BackgroundJobType;
  idempotencyKey: string;
  payload: BackgroundJobPayload;
  priority: number;
  scheduledFor: string;
  maxAttempts: number;
}) {
  return admin()
    .from("background_jobs")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      job_type: input.jobType,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
      priority: input.priority,
      scheduled_for: input.scheduledFor,
      max_attempts: input.maxAttempts
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function getAdminBackgroundJobByIdempotencyKey(input: {
  organizationId: string;
  idempotencyKey: string;
}) {
  return admin()
    .from("background_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function listAdminClaimableBackgroundJobs(input: {
  jobTypes?: BackgroundJobType[];
  limit: number;
  nowIso: string;
}) {
  let query = admin()
    .from("background_jobs")
    .select("*")
    .in("status", ["queued", "retry_scheduled"])
    .lte("scheduled_for", input.nowIso)
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true })
    .order("id", { ascending: true })
    .limit(input.limit);

  if (input.jobTypes?.length) {
    query = query.in("job_type", input.jobTypes);
  }

  return query as unknown as Promise<{ data: BackgroundJob[] | null; error: Error | null }>;
}

export async function claimAdminBackgroundJob(input: {
  organizationId: string;
  jobId: string;
  workerId: string;
  nowIso: string;
}) {
  return admin()
    .from("background_jobs")
    .update({
      status: "processing",
      locked_at: input.nowIso,
      locked_by: input.workerId,
      updated_at: input.nowIso
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .in("status", ["queued", "retry_scheduled"])
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function updateAdminBackgroundJobState(input: {
  organizationId: string;
  jobId: string;
  update: Record<string, unknown>;
}) {
  return admin()
    .from("background_jobs")
    .update(input.update as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .select("*")
    .single() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function completeAdminBackgroundJob(input: {
  organizationId: string;
  jobId: string;
  workerId: string;
  nowIso: string;
}) {
  return admin()
    .from("background_jobs")
    .update({
      status: "completed",
      completed_at: input.nowIso,
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: input.nowIso
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .eq("status", "processing")
    .eq("locked_by", input.workerId)
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function failAdminBackgroundJob(input: {
  organizationId: string;
  jobId: string;
  workerId: string;
  update: Record<string, unknown>;
}) {
  return admin()
    .from("background_jobs")
    .update(input.update as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .eq("status", "processing")
    .eq("locked_by", input.workerId)
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function cancelAdminBackgroundJob(input: {
  organizationId: string;
  jobId: string;
  update: Record<string, unknown>;
  allowedStatuses: BackgroundJobStatus[];
}) {
  return admin()
    .from("background_jobs")
    .update(input.update as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .in("status", input.allowedStatuses)
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function insertAdminBackgroundJobAttempt(input: {
  organizationId: string;
  jobId: string;
  attemptNumber: number;
  status: BackgroundJobAttempt["status"];
  workerId: string;
  finishedAt?: string | null;
  errorCode?: string | null;
  safeErrorMessage?: string | null;
  metadata?: BackgroundJobPayload;
}) {
  return admin()
    .from("background_job_attempts")
    .insert({
      organization_id: input.organizationId,
      job_id: input.jobId,
      attempt_number: input.attemptNumber,
      status: input.status,
      worker_id: input.workerId,
      finished_at: input.finishedAt ?? null,
      error_code: input.errorCode ?? null,
      safe_error_message: input.safeErrorMessage ?? null,
      metadata: input.metadata ?? {}
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: BackgroundJobAttempt | null; error: Error | null }>;
}

export async function getAdminBackgroundJobById(input: {
  organizationId: string;
  jobId: string;
}) {
  return admin()
    .from("background_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.jobId)
    .maybeSingle() as unknown as Promise<{ data: BackgroundJob | null; error: Error | null }>;
}

export async function getAdminBackgroundJobHealthSnapshot(input: {
  organizationId: string;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const client = admin();
  const [jobs, attempts] = await Promise.all([
    client
      .from("background_jobs")
      .select("*")
      .eq("organization_id", input.organizationId)
      .in("status", ["queued", "processing", "retry_scheduled", "dead_lettered"])
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("background_job_attempts")
      .select("*")
      .eq("organization_id", input.organizationId)
      .order("started_at", { ascending: false })
      .limit(limit)
  ]);

  return {
    jobs: jobs as { data: BackgroundJob[] | null; error: Error | null },
    attempts: attempts as { data: BackgroundJobAttempt[] | null; error: Error | null }
  };
}

export function assertBackgroundJobStatus(value: string): asserts value is BackgroundJobStatus {
  const allowed = new Set(["queued", "processing", "retry_scheduled", "completed", "failed", "dead_lettered", "cancelled"]);
  if (!allowed.has(value)) {
    throw new Error("Unsupported background job status.");
  }
}
