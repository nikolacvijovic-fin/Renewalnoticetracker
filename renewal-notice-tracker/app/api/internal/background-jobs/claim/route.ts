import { z } from "zod";
import { createRouteHandler, parseJsonBodyWithSchema, RouteHttpError, routeServerError } from "@/lib/http";
import { claimBackgroundJobs } from "@/lib/background-jobs/job-queue";
import { isBackgroundJobType } from "@/lib/background-jobs/job-types";
import { runClaimedBackgroundJob } from "@/lib/background-jobs/job-runner";
import { requireSignedWorkerRouteAuth } from "@/lib/background-jobs/worker-auth";

const claimRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(10),
  jobTypes: z.array(z.string().refine(isBackgroundJobType)).optional(),
  processTrustedReminders: z.boolean().optional().default(false)
});

export const POST = createRouteHandler(
  {
    auth: ({ request }) => requireSignedWorkerRouteAuth(request),
    parse: async ({ request }) =>
      parseJsonBodyWithSchema(request, claimRequestSchema, {
        message: "Invalid background job claim request.",
        code: "ERR_BACKGROUND_JOB_CLAIM_INVALID_001"
      }),
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : error instanceof Error
        ? routeServerError("Background jobs could not be claimed.", "ERR_BACKGROUND_JOB_CLAIM_FAILED_001")
        : null
  },
  async ({ auth, input, json }) => {
    const jobs = await claimBackgroundJobs({
      workerId: auth.workerId,
      jobTypes: input.jobTypes as never,
      limit: input.limit
    });
    const results = input.processTrustedReminders
      ? await Promise.all(jobs.map((job) => runClaimedBackgroundJob({ job, workerId: auth.workerId })))
      : [];

    return json({ jobs, results });
  }
);
