import { type NextRequest } from "next/server";
import {
  ReminderEmailActionAccessError,
  ReminderEmailActionTokenError,
  executeReminderEmailAction
} from "@/lib/email/actions";
import { PHASE1_EMAIL_ACTIONS, type Phase1EmailAction } from "@/lib/email/action-tokens";

function isEmailAction(value: string): value is Phase1EmailAction {
  return (PHASE1_EMAIL_ACTIONS as readonly string[]).includes(value);
}

export async function GET(
  _request: NextRequest,
  context: { params: { action: string; token: string } }
) {
  const action = context.params.action;
  if (!isEmailAction(action)) {
    return new Response("Email action could not be completed.", { status: 404 });
  }

  try {
    const result = await executeReminderEmailAction(context.params.token, action);
    return Response.redirect(result.contractUrl, 303);
  } catch (error) {
    if (error instanceof ReminderEmailActionTokenError) {
      return new Response("Email action could not be completed.", {
        status: error.code === "expired" ? 410 : 403
      });
    }

    if (error instanceof ReminderEmailActionAccessError) {
      return new Response("Email action could not be completed.", { status: error.status });
    }

    return new Response("Email action could not be completed.", { status: 400 });
  }
}
