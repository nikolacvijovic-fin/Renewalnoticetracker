import { z } from "zod";
import { completeBackgroundJob, mapBackgroundJobError } from "@/lib/background-jobs/job-queue";
import { requireSignedWorkerRouteAuth } from "@/lib/background-jobs/worker-auth";
import {
  createRouteHandler,
  parseJsonBodyWithSchema,
  RouteHttpError,
  routeConflictError,
  routeNotFoundError,
  routeServerError
} from "@/lib/http";

const completeRequestSchema = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  metadata: z.record(z.unknown()).optional()
});

export const POST = createRouteHandler(
  {
    auth: ({ request }) => requireSignedWorkerRouteAuth(request),
    parse: ({ request }) =>
      parseJsonBodyWithSchema(request, completeRequestSchema, {
        message: "Invalid background job completion request.",
        code: "ERR_BACKGROUND_JOB_COMPLETE_INVALID_001"
      }),
    mapError: (error) => {
      const backgroundJobError = mapBackgroundJobError(error);
      if (backgroundJobError.notFound) {
        return routeNotFoundError("Background job was not found.", "ERR_BACKGROUND_JOB_NOT_FOUND_001");
      }
      if (backgroundJobError.conflict) {
        return routeConflictError("Background job cannot be completed from its current state.", "ERR_BACKGROUND_JOB_STATE_CONFLICT_001");
      }
      return error instanceof RouteHttpError
        ? null
        : routeServerError("Background job could not be completed.", "ERR_BACKGROUND_JOB_COMPLETE_FAILED_001");
    }
  },
  async ({ auth, input, json }) => {
    const job = await completeBackgroundJob({
      organizationId: input.organizationId,
      jobId: input.jobId,
      workerId: auth.workerId,
      metadata: input.metadata as never
    });

    return json({ job });
  }
);
