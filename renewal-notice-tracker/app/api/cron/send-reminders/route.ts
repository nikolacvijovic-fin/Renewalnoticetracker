import { addMinutes } from "date-fns";
import {
  createRouteHandler,
  requireCronSecretRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import { processDueReminders } from "@/lib/notifications/reminders";
import { logServerError } from "@/lib/observability/server-logger";

export const POST = createRouteHandler(
  {
    auth: requireCronSecretRouteAuth(),
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : error instanceof Error
        ? routeServerError(
            "Reminder processing failed.",
            "ERR_REMINDER_PROCESSING_FAILED_001"
          )
        : null,
    instrumentation: {
      onError: ({ requestId, url, normalizedError, error }) => {
        if (normalizedError.status < 500) return;
        logServerError({
          event: "reminder_dispatch_failed",
          route: url.pathname,
          requestId,
          metadata: {
            status: normalizedError.status,
            code: normalizedError.code
          },
          error
        });
      }
    }
  },
  async ({ json }) => {
    const until = addMinutes(new Date(), 15).toISOString();
    const results = await processDueReminders(until);
    return json({ results });
  }
);
