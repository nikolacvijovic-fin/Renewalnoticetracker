import { addMinutes } from "date-fns";
import {
  createRouteHandler,
  requireCronSecretRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";
import { processDueReminders } from "@/lib/notifications/reminders";

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
        : null
  },
  async ({ json }) => {
    const until = addMinutes(new Date(), 15).toISOString();
    const results = await processDueReminders(until);
    return json({ results });
  }
);
