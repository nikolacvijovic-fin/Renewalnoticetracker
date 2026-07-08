import {
  createRouteHandler,
  parseJsonBody,
  requireShippedActionRouteAuth,
  routeServerError,
  routeValidationError
} from "@/lib/http";
import { generateReminderRecommendations } from "@/lib/contracts/reminders";
import { splitEmails } from "@/lib/utils";
import { extractedFieldSchema, type ExtractedContractFields } from "@/lib/validation/contract";
import type { ActiveOrganizationContext } from "@/lib/auth";

type ReminderPreviewInput = {
  metadata: ExtractedContractFields;
  recipientEmails: string[];
};

export const POST = createRouteHandler<ActiveOrganizationContext, ReminderPreviewInput>(
  {
    auth: requireShippedActionRouteAuth("preview_reminders", {
      deniedAuditAction: "reminders.preview_denied",
      deniedEntityType: "reminder_preview",
      deniedDetails: () => ({
        source: "api_reminders"
      })
    }),
    parse: async ({ request }) => {
      const typedBody = await parseJsonBody<
        | {
            metadata?: unknown;
            recipientEmail?: unknown;
            recipientEmails?: unknown;
          }
        | null
      >(
        request,
        {
          code: "ERR_REMINDER_PREVIEW_REQUEST_001"
        }
      );
      const parsed = extractedFieldSchema.safeParse(typedBody?.metadata);
      if (!parsed.success) {
        throw routeValidationError(
          "Invalid request.",
          "ERR_REMINDER_PREVIEW_REQUEST_001"
        );
      }

      const recipientEmail = String(typedBody?.recipientEmail ?? "");
      const recipientEmails =
        Array.isArray(typedBody?.recipientEmails) && typedBody.recipientEmails.length > 0
          ? typedBody.recipientEmails.map(String)
          : splitEmails(recipientEmail);

      return {
        metadata: parsed.data,
        recipientEmails
      };
    }
  },
  async ({ auth: context, input, audit, json }) => {
    try {
      await audit({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        action: "reminders.preview_requested",
        entityType: "reminder_preview",
        details: {
          source: "api_reminders",
          recipient_count: input.recipientEmails.length
        }
      });

      return json({
        reminders:
          input.recipientEmails.length > 0
            ? generateReminderRecommendations(input.metadata, input.recipientEmails)
            : []
      });
    } catch {
      throw routeServerError(
        "Reminder preview failed.",
        "ERR_REMINDER_PREVIEW_FAILED_001"
      );
    }
  }
);
