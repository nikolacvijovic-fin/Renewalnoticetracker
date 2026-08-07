export const PHASE1_EMAIL_SENDER = "NoticeControl <notifications@noticecontrol.com>";
export const PHASE1_EMAIL_REPLY_TO_FALLBACK = "support@noticecontrol.com";

export const PHASE1_EMAIL_RELEASE_REQUIREMENTS = [
  "Use the shipped sender identity NoticeControl <notifications@noticecontrol.com>.",
  "Require a configured sending domain for SPF, DKIM, and DMARC ownership.",
  "Require a webhook signing secret for bounce and suppression handling.",
  "Record every reminder send outcome in notification_logs.",
  "Use idempotency keys so duplicate processing does not send duplicate emails.",
  "Direct users to secure in-app acknowledgment and decision links, not email replies."
] as const;

import {
  createReminderEmailActionToken,
  type Phase1EmailAction
} from "@/lib/email/action-tokens";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeSubjectText(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildSignedActionUrl(input: {
  appUrl: string;
  organizationId: string;
  recipientIdentity: string;
  contractId: string;
  reminderId: string;
  action: Phase1EmailAction;
  userId?: string | null;
}) {
  const token = createReminderEmailActionToken({
    organizationId: input.organizationId,
    recipientIdentity: input.recipientIdentity,
    contractId: input.contractId,
    reminderId: input.reminderId,
    action: input.action,
    userId: input.userId ?? null
  });

  return `${input.appUrl}/api/email-actions/${input.action}/${token}`;
}

export function buildReminderActionLinks(input: {
  appUrl: string;
  organizationId: string;
  recipientIdentity: string;
  contractId: string;
  reminderId: string;
  userId?: string | null;
}) {
  const contractUrl = `${input.appUrl}/dashboard/contracts/${input.contractId}`;
  return {
    contractUrl,
    acknowledgeUrl: buildSignedActionUrl({
      ...input,
      action: "acknowledge"
    }),
    decisionUrl: buildSignedActionUrl({
      ...input,
      action: "decision"
    })
  };
}

export function buildReminderEmailPayload(input: {
  organizationId: string;
  recipientIdentity: string;
  contractId: string;
  reminderId: string;
  userId?: string | null;
  contractTitle: string;
  counterpartyName: string | null;
  remindAt: string;
  reminderTypeLabel: string;
  noticeDeadlineDate?: string | null;
  renewalDate?: string | null;
  expirationDate?: string | null;
  daysRemaining?: number | null;
  ownerLabel?: string | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  internalReminderTone?: string | null;
  appUrl: string;
  legalDisclaimer: string;
  replyToEmail?: string | null;
}) {
  const links = buildReminderActionLinks({
    appUrl: input.appUrl,
    organizationId: input.organizationId,
    recipientIdentity: input.recipientIdentity,
    contractId: input.contractId,
    reminderId: input.reminderId,
    userId: input.userId ?? null
  });
  const replyTo = input.replyToEmail?.trim() || PHASE1_EMAIL_REPLY_TO_FALLBACK;
  const safeContractTitle = escapeHtml(input.contractTitle);
  const safeCounterpartyName = escapeHtml(input.counterpartyName ?? "Not set");
  const safeReminderTypeLabel = escapeHtml(input.reminderTypeLabel);
  const safeTone = escapeHtml(input.internalReminderTone ?? "Internal renewal deadline reminder");
  const safeNoticeDeadline = escapeHtml(input.noticeDeadlineDate ?? "Needs review");
  const safeRenewalOrExpiration = escapeHtml(input.renewalDate ?? input.expirationDate ?? "Not found");
  const safeOwner = escapeHtml(input.ownerLabel ?? "Unassigned");
  const safeSpend =
    input.contractValueAmount !== null &&
    input.contractValueAmount !== undefined &&
    Number.isFinite(input.contractValueAmount)
      ? escapeHtml(
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: input.contractValueCurrency ?? "USD",
            maximumFractionDigits: 0
          }).format(input.contractValueAmount)
        )
      : "Unknown";
  const safeDaysRemaining =
    input.daysRemaining === null || input.daysRemaining === undefined
      ? "Needs review"
      : input.daysRemaining < 0
        ? `${Math.abs(input.daysRemaining)} days past deadline`
        : input.daysRemaining === 0
          ? "Deadline today"
          : `${input.daysRemaining} days remaining`;
  const safeDisclaimer = escapeHtml(input.legalDisclaimer);
  const safeContractUrl = escapeHtml(links.contractUrl);
  const safeAcknowledgeUrl = escapeHtml(links.acknowledgeUrl);
  const safeDecisionUrl = escapeHtml(links.decisionUrl);

  return {
    from: PHASE1_EMAIL_SENDER,
    replyTo,
    subject: `${sanitizeSubjectText(input.internalReminderTone ?? "Reminder")}: ${sanitizeSubjectText(input.contractTitle)}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #132238;">
        <h2>${safeContractTitle}</h2>
        <p><strong>${safeTone}</strong></p>
        <p>This is an internal NoticeControl renewal-control reminder for your organization. It is not sent to vendors or counterparties.</p>
        <p>This is a scheduled ${safeReminderTypeLabel} reminder.</p>
        <p><strong>Counterparty:</strong> ${safeCounterpartyName}</p>
        <p><strong>Notice deadline:</strong> ${safeNoticeDeadline}</p>
        <p><strong>Renewal or expiration:</strong> ${safeRenewalOrExpiration}</p>
        <p><strong>Timing:</strong> ${safeDaysRemaining}</p>
        <p><strong>Owner:</strong> ${safeOwner}</p>
        <p><strong>Spend at risk:</strong> ${safeSpend}</p>
        <p><strong>Reminder date:</strong> ${new Date(input.remindAt).toUTCString()}</p>
        <p><a href="${safeContractUrl}">Open contract</a></p>
        <p><a href="${safeAcknowledgeUrl}">Acknowledge in NoticeControl</a></p>
        <p><a href="${safeDecisionUrl}">Record decision in NoticeControl</a></p>
        <p style="font-size: 12px; color: #52606d;">
          Replies to this email do not record acknowledgment or decisions. Use the secure NoticeControl links above.
        </p>
        <p style="font-size: 12px; color: #52606d;">${safeDisclaimer}</p>
      </div>
    `
  };
}

export function buildRenewalActionRequestEmailPayload(input: {
  organizationId: string;
  contractId: string;
  contractTitle: string;
  counterpartyName: string | null;
  requestedActionLabel: string;
  noticeDeadlineDate?: string | null;
  renewalDate?: string | null;
  expirationDate?: string | null;
  dueAt?: string | null;
  ownerLabel?: string | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  requesterLabel?: string | null;
  message?: string | null;
  appUrl: string;
  legalDisclaimer: string;
  replyToEmail?: string | null;
}) {
  const replyTo = input.replyToEmail?.trim() || PHASE1_EMAIL_REPLY_TO_FALLBACK;
  const contractUrl = `${input.appUrl}/dashboard/contracts/${input.contractId}`;
  const safeContractTitle = escapeHtml(input.contractTitle);
  const safeCounterpartyName = escapeHtml(input.counterpartyName ?? "Not set");
  const safeAction = escapeHtml(input.requestedActionLabel);
  const safeNoticeDeadline = escapeHtml(input.noticeDeadlineDate ?? "Needs review");
  const safeRenewalOrExpiration = escapeHtml(input.renewalDate ?? input.expirationDate ?? "Not found");
  const safeDueAt = escapeHtml(input.dueAt ?? "No due date set");
  const safeOwner = escapeHtml(input.ownerLabel ?? "Assigned owner");
  const safeRequester = escapeHtml(input.requesterLabel ?? "A NoticeControl operator");
  const safeMessage = input.message ? escapeHtml(input.message) : null;
  const safeSpend =
    input.contractValueAmount !== null &&
    input.contractValueAmount !== undefined &&
    Number.isFinite(input.contractValueAmount)
      ? escapeHtml(
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: input.contractValueCurrency ?? "USD",
            maximumFractionDigits: 0
          }).format(input.contractValueAmount)
        )
      : "Unknown";
  const safeContractUrl = escapeHtml(contractUrl);
  const safeDisclaimer = escapeHtml(input.legalDisclaimer);

  return {
    from: PHASE1_EMAIL_SENDER,
    replyTo,
    subject: `Renewal decision requested: ${sanitizeSubjectText(input.contractTitle)}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #132238;">
        <h2>${safeContractTitle}</h2>
        <p><strong>${safeRequester}</strong> requested an internal renewal action from ${safeOwner}.</p>
        <p>This is an internal NoticeControl workflow message. It is not sent to vendors or counterparties.</p>
        <p><strong>Requested action:</strong> ${safeAction}</p>
        <p><strong>Counterparty:</strong> ${safeCounterpartyName}</p>
        <p><strong>Notice deadline:</strong> ${safeNoticeDeadline}</p>
        <p><strong>Renewal or expiration:</strong> ${safeRenewalOrExpiration}</p>
        <p><strong>Due:</strong> ${safeDueAt}</p>
        <p><strong>Spend at risk:</strong> ${safeSpend}</p>
        ${safeMessage ? `<p><strong>Internal note:</strong> ${safeMessage}</p>` : ""}
        <p><a href="${safeContractUrl}">Open contract in NoticeControl</a></p>
        <p style="font-size: 12px; color: #52606d;">
          Use NoticeControl to complete or dismiss this request. Replies do not update workflow state.
        </p>
        <p style="font-size: 12px; color: #52606d;">${safeDisclaimer}</p>
      </div>
    `
  };
}

export function getEmailInfrastructureGateStatus(input: {
  sendingDomain?: string | null;
  fromEmail?: string | null;
  webhookSigningSecret?: string | null;
  replyToEmail?: string | null;
}) {
  const senderAddress = input.fromEmail?.trim() ?? "";
  const senderMatches = senderAddress === "notifications@noticecontrol.com";
  const sendingDomain = input.sendingDomain?.trim() ?? "";
  const replyToEmail = input.replyToEmail?.trim() ?? "";
  const webhookSigningSecret = input.webhookSigningSecret?.trim() ?? "";

  return {
    senderMatches,
    sendingDomainConfigured: sendingDomain.length > 0,
    replyToConfigured: replyToEmail.length > 0,
    webhookSigningSecretConfigured: webhookSigningSecret.length > 0,
    releaseReady:
      senderMatches &&
      sendingDomain.length > 0 &&
      replyToEmail.length > 0 &&
      webhookSigningSecret.length > 0
  };
}
