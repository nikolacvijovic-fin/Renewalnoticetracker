import {
  createRouteHandler,
  requireInternalRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import { processQueuedContractExportRequests } from "@/lib/contracts/background-exports";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

async function parseOptionalLimit(request: Request) {
  const text = await request.text();
  if (!text.trim()) return { limit: 3 };

  try {
    const parsed = JSON.parse(text) as { limit?: unknown };
    const limit = Number(parsed.limit ?? 3);
    return {
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 10) : 3
    };
  } catch {
    return { limit: 3 };
  }
}

export const POST = createRouteHandler(
  {
    auth: requireInternalRouteAuth("operations"),
    parse: ({ request }) => parseOptionalLimit(request),
    mapError: (error) => {
      if (error instanceof RouteHttpError) return error;
      if (error instanceof Error) {
        return routeServerError(
          "Background export jobs could not be processed.",
          "ERR_EXPORT_JOBS_FAILED_001"
        );
      }
      return null;
    },
    instrumentation: {
      onError: async ({ requestId, normalizedError }) => {
        await emitOperationalEvent({
          eventName: "export_jobs_route_failed",
          severity: "P2",
          sensitivity: "internal",
          alert: true,
          route: "/api/internal/export-jobs",
          requestId,
          metadata: {
            code: normalizedError.code,
            status: normalizedError.status
          }
        });
      }
    }
  },
  async ({ input, json }) => {
    const result = await processQueuedContractExportRequests({
      limit: input.limit
    });

    return json({
      ok: result.ok,
      requestedLimit: result.requestedLimit,
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed,
      skipped: result.skipped
    });
  }
);
