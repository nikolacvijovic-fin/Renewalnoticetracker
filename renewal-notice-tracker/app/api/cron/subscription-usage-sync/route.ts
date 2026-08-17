import {
  createRouteHandler,
  requireCronSecretRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import { processDueSubscriptionUsageConnections } from "@/lib/subscription-usage/scheduled-sync";

export const POST = createRouteHandler(
  {
    auth: requireCronSecretRouteAuth(),
    mapError: (error) => error instanceof RouteHttpError
      ? null
      : routeServerError("Subscription usage synchronization failed.", "ERR_SUBSCRIPTION_USAGE_SYNC_FAILED_001")
  },
  async ({ json }) => json(await processDueSubscriptionUsageConnections())
);
