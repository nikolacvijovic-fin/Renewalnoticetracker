import {
  createRouteHandler,
  routeValidationError
} from "@/lib/http";
import { handleWebhook } from "@/lib/billing/provider";
import { persistBillingWebhookUpdate } from "@/lib/billing/service";

export const POST = createRouteHandler(
  {
    parse: async ({ request }) => ({
      body: await request.text(),
      headers: request.headers
    }),
    mapError: () =>
      routeValidationError("Invalid webhook", "ERR_WEBHOOK_INVALID_001")
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
