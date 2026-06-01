import {
  createRouteHandler,
  routeValidationError
} from "@/lib/http";
import { handleWebhook } from "@/lib/billing/provider";
import { persistBillingWebhookUpdate } from "@/lib/billing/service";
import { logServerError } from "@/lib/observability/server-logger";
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
        logServerError({
          event: "billing_webhook_failed",
          route: url.pathname,
          requestId,
          metadata: {
            provider: "paddle",
            status: normalizedError.status,
            code: normalizedError.code
          },
          error
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
          error
        });
      }
    }
  },
  async ({ input, json }) => {
    const result = await handleWebhook("paddle", {
      body: input.body,
      headers: input.headers
    });
    await persistBillingWebhookUpdate(result);
    return json({ received: true });
  }
);
