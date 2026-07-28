import { z } from "zod";
import { cancelBackgroundJob, mapBackgroundJobError } from "@/lib/background-jobs/job-queue";
import { requireSignedWorkerRouteAuth } from "@/lib/background-jobs/worker-auth";
import {
  createRouteHandler,
  parseJsonBodyWithSchema,
  RouteHttpError,
  routeConflictError,
  routeNotFoundError,
  routeServerError
} from "@/lib/http";

const cancelRequestSchema = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  reasonCode: z.string().max(120).optional().nullable()
});

export const POST = createRouteHandler(
  {
    auth: ({ request }) => requireSignedWorkerRouteAuth(request),
    parse: ({ request }) =>
      parseJsonBodyWithSchema(request, cancelRequestSchema, {
        message: "Invalid background job cancellation request.",
        code: "ERR_BACKGROUND_JOB_CANCEL_INVALID_001"
      }),
    mapError: (error) => {
      const backgroundJobError = mapBackgroundJobError(error);
      if (backgroundJobError.notFound) {
        return routeNotFoundError("Background job was not found.", "ERR_BACKGROUND_JOB_NOT_FOUND_001");
      }
      if (backgroundJobError.conflict) {
        return routeConflictError("Background job cannot be cancelled from its current state.", "ERR_BACKGROUND_JOB_STATE_CONFLICT_001");
      }
      return error instanceof RouteHttpError
        ? null
        : routeServerError("Background job could not be cancelled.", "ERR_BACKGROUND_JOB_CANCEL_FAILED_001");
    }
  },
  async ({ auth, input, json }) => {
    const job = await cancelBackgroundJob({
      organizationId: input.organizationId,
      jobId: input.jobId,
      workerId: auth.workerId,
      reasonCode: input.reasonCode
    });

    return json({ job });
  }
);
