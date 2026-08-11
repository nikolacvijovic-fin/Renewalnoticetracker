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
    let results: Awaited<ReturnType<typeof enqueueDueTrustedReminderDeliveryJobs>> = [];
    let renewalActionNotifications: Awaited<ReturnType<typeof processQueuedRenewalActionRequestNotifications>> = [];
    const failures: Array<{ queue: "trusted_reminders" | "renewal_action_notifications"; code: string }> = [];

    try {
      results = await enqueueDueTrustedReminderDeliveryJobs(until);
    } catch (error) {
      failures.push({ queue: "trusted_reminders", code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001" });
      logServerError({
        event: "trusted_reminder_queue_failed",
        route: "/api/cron/send-reminders",
        metadata: { code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001" },
        error
      });
      void emitOperationalEvent({
        eventName: "trusted_reminder_queue_failed",
        severity: "P1",
        sensitivity: "customer_sensitive",
        alert: true,
        route: "/api/cron/send-reminders",
        metadata: { code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001" },
        error
      });
    }

    try {
      renewalActionNotifications = await processQueuedRenewalActionRequestNotifications({ limit: 25 });
    } catch (error) {
      failures.push({
        queue: "renewal_action_notifications",
        code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001"
      });
      logServerError({
        event: "renewal_action_notification_queue_failed",
        route: "/api/cron/send-reminders",
        metadata: { code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001" },
        error
      });
      void emitOperationalEvent({
        eventName: "renewal_action_notification_queue_failed",
        severity: "P1",
        sensitivity: "customer_sensitive",
        alert: true,
        route: "/api/cron/send-reminders",
        metadata: { code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001" },
        error
      });
    }

    return json({
      results,
      renewalActionNotifications,
      status: failures.length ? "partial_failure" : "ok",
      failures
    });
  }
);
