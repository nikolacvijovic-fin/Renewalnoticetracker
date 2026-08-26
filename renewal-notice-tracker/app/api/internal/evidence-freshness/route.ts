import { z } from "zod";
import { createRouteHandler, parseJsonBodyWithSchema, requireInternalRouteAuth } from "@/lib/http";
import { invalidateStaleEvidenceReadiness } from "@/lib/evidence-readiness/freshness-invalidation";

const requestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  staleHours: z.number().int().min(1).max(168).default(24)
});

export const POST = createRouteHandler(
  {
    auth: requireInternalRouteAuth("operations"),
    parse: ({ request }) => parseJsonBodyWithSchema(request, requestSchema, {
      message: "Invalid evidence freshness request.",
      code: "ERR_EVIDENCE_FRESHNESS_REQUEST_INVALID"
    })
  },
  async ({ input, json }) => {
    const staleBefore = new Date(Date.now() - input.staleHours * 60 * 60 * 1000).toISOString();
    const summary = await invalidateStaleEvidenceReadiness({ limit: input.limit, staleBefore });
    return json({ summary }, { status: 200 });
  }
);
