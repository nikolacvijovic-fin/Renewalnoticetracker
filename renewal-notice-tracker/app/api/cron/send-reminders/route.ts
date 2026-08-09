import { addMinutes } from "date-fns";
import {
  createRouteHandler,
  requireCronSecretRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import { enqueueDueTrustedReminderDeliveryJobs } from "@/lib/notifications/reminders";
import { processQueuedRenewalActionRequestNotifications } from "@/lib/notifications/renewal-action-request-outbox";
import { logServerError } from "@/lib/observability/server-logger";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

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
        void emitOperationalEvent({
          eventName: "reminder_dispatch_failed",
          severity: "P1",
          sensitivity: "customer_sensitive",
          alert: true,
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
    const results = await enqueueDueTrustedReminderDeliveryJobs(until);
    const renewalActionNotifications = await processQueuedRenewalActionRequestNotifications({ limit: 25 });
    return json({ results, renewalActionNotifications });
  }
);
