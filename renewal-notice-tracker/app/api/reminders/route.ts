import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { generateReminderRecommendations } from "@/lib/contracts/reminders";
import { splitEmails } from "@/lib/utils";
import { extractedFieldSchema } from "@/lib/validation/contract";

export async function POST(request: Request) {
  const auth = await getActiveOrganizationContextOrNull();
  let context;
  try {
    context = await assertCanUseShippedAction(auth, "preview_reminders", {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "reminders.preview_denied",
          entityType: "reminder_preview",
          details: {
            source: "api_reminders",
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const typedBody = body as
    | {
        metadata?: unknown;
        recipientEmail?: unknown;
        recipientEmails?: unknown;
      }
    | null;
  const parsed = extractedFieldSchema.safeParse(typedBody?.metadata);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const recipientEmail = String(typedBody?.recipientEmail ?? "");
  const recipientEmails =
    Array.isArray(typedBody?.recipientEmails) && typedBody.recipientEmails.length > 0
      ? typedBody.recipientEmails.map(String)
      : splitEmails(recipientEmail);
  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "reminders.preview_requested",
    entityType: "reminder_preview",
    details: {
      source: "api_reminders",
      recipient_count: recipientEmails.length
    }
  });
  return NextResponse.json({
    reminders:
      recipientEmails.length > 0
        ? generateReminderRecommendations(parsed.data, recipientEmails)
        : []
  });
}
