import {
  createRouteHandler,
  routeValidationError
} from "@/lib/http";
import { handleWebhook } from "@/lib/billing/provider";
import { persistBillingWebhookUpdate } from "@/lib/billing/service";
import { logServerError, sanitizeOperationalError } from "@/lib/observability/server-logger";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

export const POST = createRouteHandler(
  {
    parse: async ({ request }) => ({
      body: await request.text(),
      headers: request.headers
    }),
    mapError: () =>
      routeValidationError("Invalid webhook", "ERR_WEBHOOK_INVALID_001"),
    instrumentation: {
      onError: ({ requestId, url, normalizedError, error }) => {
        const safeError = sanitizeOperationalError(error);
        logServerError({
          event: "billing_webhook_failed",
          route: url.pathname,
          requestId,
          metadata: {
            provider: "paddle",
            status: normalizedError.status,
            code: normalizedError.code
          },
          error: safeError
        });
        void emitOperationalEvent({
          eventName: "billing_webhook_failed",
          severity: "P1",
          sensitivity: "restricted",
          alert: true,
          route: url.pathname,
          requestId,
          metadata: {
            provider: "paddle",
            status: normalizedError.status,
            code: normalizedError.code
          },
          error: safeError
        });
      }
    }
  },
  async ({ input, json, requestId, url }) => {
    const result = await handleWebhook("paddle", {
      body: input.body,
      headers: input.headers
    });
    void emitOperationalEvent({
      eventName: "billing_webhook_received",
      severity: "P3",
      sensitivity: "restricted",
      alert: false,
      route: url.pathname,
      requestId,
      organizationId: result.organizationId ?? null,
      metadata: {
        provider: "paddle",
        event_type: result.eventType,
        organization_resolved: Boolean(result.organizationId)
      }
    });
    const persisted = await persistBillingWebhookUpdate(result);
    const duplicate = "duplicate" in persisted ? Boolean(persisted.duplicate) : false;
    const ignoredOutOfOrder =
      "ignoredOutOfOrder" in persisted ? Boolean(persisted.ignoredOutOfOrder) : false;
    const persistedOrganizationId =
      "organizationId" in persisted ? persisted.organizationId ?? null : null;
    void emitOperationalEvent({
      eventName: duplicate ? "billing_webhook_replayed" : "billing_webhook_succeeded",
      severity: "P3",
      sensitivity: "restricted",
      alert: false,
      route: url.pathname,
      requestId,
      organizationId: persistedOrganizationId ?? result.organizationId ?? null,
      metadata: {
        provider: "paddle",
        event_type: result.eventType,
        updated: Boolean(persisted.updated),
        duplicate,
        ignored_out_of_order: ignoredOutOfOrder
      }
    });
    return json({ received: true });
  }
);
