import { Resend } from "resend";
import { getAppConfig } from "@/lib/config";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import {
  buildReminderEmailPayload
} from "@/lib/email/policy";

const resend = new Resend(getAppConfig().email.resendApiKey);

export async function sendReminderEmail(params: {
  organizationId: string;
  reminderId: string;
  recipientEmail: string;
  recipientIdentity: string;
  contractId: string;
  contractTitle: string;
  counterpartyName: string | null;
  remindAt: string;
  reminderType: string;
  userId?: string | null;
}) {
  const config = getAppConfig();
  const payload = buildReminderEmailPayload({
    organizationId: params.organizationId,
    recipientIdentity: params.recipientIdentity,
    contractId: params.contractId,
    reminderId: params.reminderId,
    userId: params.userId ?? null,
    contractTitle: params.contractTitle,
    counterpartyName: params.counterpartyName,
    remindAt: params.remindAt,
    reminderTypeLabel: params.reminderType.replaceAll("_", " "),
    appUrl: config.public.appUrl,
    legalDisclaimer: LEGAL_DISCLAIMER,
    replyToEmail: config.email.replyToEmail ?? undefined
  });

  return resend.emails.send({
    from: payload.from,
    to: params.recipientEmail,
    replyTo: payload.replyTo,
    subject: payload.subject,
    html: payload.html
  });
}
