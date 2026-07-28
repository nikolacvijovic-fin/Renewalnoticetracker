import { z } from "zod";
import { failBackgroundJob, mapBackgroundJobError } from "@/lib/background-jobs/job-queue";
import { requireSignedWorkerRouteAuth } from "@/lib/background-jobs/worker-auth";
import {
  createRouteHandler,
  parseJsonBodyWithSchema,
  RouteHttpError,
  routeConflictError,
  routeNotFoundError,
  routeServerError
} from "@/lib/http";

const failRequestSchema = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  errorCode: z.string().min(1).max(120),
  errorMessage: z.string().max(240).optional().nullable(),
  failureCategory: z.string().max(80).optional().nullable(),
  retryable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const POST = createRouteHandler(
  {
    auth: ({ request }) => requireSignedWorkerRouteAuth(request),
    parse: ({ request }) =>
      parseJsonBodyWithSchema(request, failRequestSchema, {
        message: "Invalid background job failure request.",
        code: "ERR_BACKGROUND_JOB_FAIL_INVALID_001"
      }),
    mapError: (error) => {
      const backgroundJobError = mapBackgroundJobError(error);
      if (backgroundJobError.notFound) {
        return routeNotFoundError("Background job was not found.", "ERR_BACKGROUND_JOB_NOT_FOUND_001");
      }
      if (backgroundJobError.conflict) {
        return routeConflictError("Background job cannot be failed from its current state.", "ERR_BACKGROUND_JOB_STATE_CONFLICT_001");
      }
      return error instanceof RouteHttpError
        ? null
        : routeServerError("Background job failure could not be recorded.", "ERR_BACKGROUND_JOB_FAIL_FAILED_001");
    }
  },
  async ({ auth, input, json }) => {
    const job = await failBackgroundJob({
      organizationId: input.organizationId,
      jobId: input.jobId,
      workerId: auth.workerId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      failureCategory: input.failureCategory as never,
      retryable: input.retryable,
      metadata: input.metadata as never
    });

    return json({ job });
  }
);
