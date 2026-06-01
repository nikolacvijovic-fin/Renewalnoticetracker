import {
  ReminderEmailActionAccessError,
  ReminderEmailActionTokenError,
  executeReminderEmailAction
} from "@/lib/email/actions";
import { PHASE1_EMAIL_ACTIONS, type Phase1EmailAction } from "@/lib/email/action-tokens";
import {
  createRouteHandler,
  routeNotFoundError,
  RouteHttpError
} from "@/lib/http";

function isEmailAction(value: string): value is Phase1EmailAction {
  return (PHASE1_EMAIL_ACTIONS as readonly string[]).includes(value);
}

function mapEmailActionError(error: unknown) {
  if (error instanceof ReminderEmailActionTokenError) {
    return new RouteHttpError("Email action could not be completed.", {
      code: error.code === "expired" ? "ERR_EMAIL_ACTION_EXPIRED" : "ERR_EMAIL_ACTION_INVALID",
      status: error.code === "expired" ? 410 : 403
    });
  }

  if (error instanceof ReminderEmailActionAccessError) {
    return new RouteHttpError("Email action could not be completed.", {
      code: "ERR_EMAIL_ACTION_ACCESS_DENIED",
      status: error.status
    });
  }

  return null;
}

export const GET = createRouteHandler<
  undefined,
  { action: Phase1EmailAction; token: string },
  { params: { action: string; token: string } }
>(
  {
    parse: ({ routeContext }) => {
      const action = routeContext?.params.action ?? "";
      if (!isEmailAction(action)) {
        throw routeNotFoundError(
          "Email action could not be completed.",
          "ERR_EMAIL_ACTION_NOT_FOUND"
        );
      }

      return {
        action,
        token: routeContext?.params.token ?? ""
      };
    },
    mapError: mapEmailActionError
  },
  async ({ input, redirect }) => {
    const result = await executeReminderEmailAction(input.token, input.action);
    return redirect(result.contractUrl, 303);
  }
);
