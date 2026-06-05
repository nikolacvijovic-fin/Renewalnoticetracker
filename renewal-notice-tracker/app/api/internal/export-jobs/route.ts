import {
  createRouteHandler,
  requireInternalRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import {
  cleanupExpiredBackgroundExportArtifacts,
  processQueuedContractExportRequests
} from "@/lib/contracts/background-exports";
import { getAppConfig } from "@/lib/config";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

async function parseOptionalLimit(request: Request) {
  const defaultLimit = getAppConfig().operations.backgroundExportJobLimit;
  const text = await request.text();
  if (!text.trim()) return { limit: defaultLimit, mode: "process" as const };

  try {
    const parsed = JSON.parse(text) as { limit?: unknown; mode?: unknown };
    const limit = Number(parsed.limit ?? defaultLimit);
    const mode = parsed.mode === "cleanup_expired" ? "cleanup_expired" : "process";
    return {
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 10) : defaultLimit,
      mode
    };
  } catch {
    return { limit: defaultLimit, mode: "process" as const };
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
    const result =
      input.mode === "cleanup_expired"
        ? await cleanupExpiredBackgroundExportArtifacts({ limit: input.limit })
        : await processQueuedContractExportRequests({
            limit: input.limit
          });

    return json(result);
  }
);
