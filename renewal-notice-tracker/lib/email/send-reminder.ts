import { Resend } from "resend";
import { env } from "@/lib/env";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import {
  buildReminderEmailPayload
} from "@/lib/email/policy";

const resend = new Resend(env.RESEND_API_KEY);

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
    appUrl: env.NEXT_PUBLIC_APP_URL,
    legalDisclaimer: LEGAL_DISCLAIMER,
    replyToEmail: env.NOTICECONTROL_REPLY_TO_EMAIL
  });

  return resend.emails.send({
    from: payload.from,
    to: params.recipientEmail,
    replyTo: payload.replyTo,
    subject: payload.subject,
    html: payload.html
  });
}
