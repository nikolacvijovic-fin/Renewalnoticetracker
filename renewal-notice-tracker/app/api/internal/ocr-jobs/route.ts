import { z } from "zod";
import {
  createRouteHandler,
  parseJsonBodyWithSchema,
  requireInternalRouteAuth
} from "@/lib/http";
import { processPendingOcrJobs } from "@/lib/ocr/jobs";

const ocrJobsRequestSchema = z.object({
  limit: z.number().int().min(1).max(25).optional().default(5)
});

export const POST = createRouteHandler(
  {
    auth: requireInternalRouteAuth("ocr_jobs"),
    parse: async ({ request }) => {
      if (!request.headers.get("content-type") && !request.headers.get("content-length")) {
        return { limit: 5 };
      }

      return parseJsonBodyWithSchema(request, ocrJobsRequestSchema, {
        message: "Invalid OCR job request.",
        code: "ERR_OCR_JOB_REQUEST_INVALID"
      });
    }
  },
  async ({ input, json }) => {
    const results = await processPendingOcrJobs(input.limit);
    return json({ results }, { status: 200 });
  }
);
