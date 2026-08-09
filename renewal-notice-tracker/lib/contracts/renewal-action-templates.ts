export const RENEWAL_MANUAL_TEMPLATE_TYPES = [
  "cancellation_notice",
  "renegotiation_request"
] as const;

export type RenewalManualTemplateType = (typeof RENEWAL_MANUAL_TEMPLATE_TYPES)[number];

export const RENEWAL_MANUAL_TEMPLATE_TONES = ["standard", "firm", "friendly"] as const;

export type RenewalManualTemplateTone = (typeof RENEWAL_MANUAL_TEMPLATE_TONES)[number];

export type RenewalManualTemplateInput = {
  templateType: RenewalManualTemplateType;
  tone?: RenewalManualTemplateTone;
  contractTitle?: string | null;
  counterpartyName?: string | null;
  renewalDate?: string | null;
  expirationDate?: string | null;
  noticeDeadlineDate?: string | null;
  accountReference?: string | null;
  senderOrganizationName?: string | null;
};

export type RenewalManualTemplate = {
  templateType: RenewalManualTemplateType;
  tone: RenewalManualTemplateTone;
  subject: string;
  body: string;
  boundaryNotice: string;
  safeMetadataUsed: {
    hasNoticeDeadline: boolean;
    hasRenewalDate: boolean;
    hasExpirationDate: boolean;
    hasAccountReference: boolean;
    hasSenderOrganizationName: boolean;
  };
};

const TEMPLATE_BOUNDARY_NOTICE =
  "NoticeControl does not send this to the vendor. Copy and send manually through your own email.";

function cleanTemplateValue(value: string | null | undefined, fallback: string, maxLength = 120) {
  const normalized = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLength) || fallback;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
    ? normalized
    : null;
}

function dateLine(label: string, value: string | null) {
  return value ? `${label}: ${value}` : `${label}: not available in NoticeControl`;
}

function subjectPrefix(tone: RenewalManualTemplateTone) {
  switch (tone) {
    case "firm":
      return "Action required";
    case "friendly":
      return "Renewal follow-up";
    case "standard":
      return "Renewal notice";
  }
}

export function buildRenewalManualActionTemplate(input: RenewalManualTemplateInput): RenewalManualTemplate {
  const tone = input.tone ?? "standard";
  const contractTitle = cleanTemplateValue(input.contractTitle, "the contract");
  const counterpartyName = cleanTemplateValue(input.counterpartyName, "your team");
  const senderOrganizationName = cleanTemplateValue(
    input.senderOrganizationName,
    "[Sender organization]"
  );
  const accountReference = input.accountReference
    ? cleanTemplateValue(input.accountReference, "[Account/customer reference]")
    : null;
  const renewalDate = parseDateOnly(input.renewalDate);
  const expirationDate = parseDateOnly(input.expirationDate);
  const noticeDeadlineDate = parseDateOnly(input.noticeDeadlineDate);

  const sharedContext = [
    `Contract: ${contractTitle}`,
    `Vendor/counterparty: ${counterpartyName}`,
    accountReference ? `Account/customer reference: ${accountReference}` : null,
    dateLine("Renewal date", renewalDate),
    dateLine("Expiration date", expirationDate),
    dateLine("Notice deadline", noticeDeadlineDate)
  ].filter(Boolean);

  if (input.templateType === "cancellation_notice") {
    return {
      templateType: "cancellation_notice",
      tone,
      subject: `${subjectPrefix(tone)}: cancellation / opt-out for ${contractTitle}`,
      body: [
        `Hello ${counterpartyName},`,
        "",
        `We are writing on behalf of ${senderOrganizationName} regarding ${contractTitle}.`,
        "Please treat this message as our notice that we do not intend to renew this agreement, or that we are opting out of auto-renewal where applicable.",
        "",
        ...sharedContext,
        "",
        "Please confirm in writing that this notice has been received and that the agreement will not renew without our further written approval.",
        "",
        "Regards,",
        "[Sender name]",
        "[Sender title]"
      ].join("\n"),
      boundaryNotice: TEMPLATE_BOUNDARY_NOTICE,
      safeMetadataUsed: {
        hasNoticeDeadline: Boolean(noticeDeadlineDate),
        hasRenewalDate: Boolean(renewalDate),
        hasExpirationDate: Boolean(expirationDate),
        hasAccountReference: Boolean(accountReference),
        hasSenderOrganizationName: Boolean(input.senderOrganizationName)
      }
    };
  }

  return {
    templateType: "renegotiation_request",
    tone,
    subject: `${subjectPrefix(tone)}: renewal discussion for ${contractTitle}`,
    body: [
      `Hello ${counterpartyName},`,
      "",
      `We are reviewing ${contractTitle} on behalf of ${senderOrganizationName}.`,
      "Before we make a renewal decision, we would like to discuss pricing, terms, and any available options for the next term.",
      "",
      ...sharedContext,
      "",
      "Please send an updated proposal or suggest times to discuss before the notice deadline shown above, if available.",
      "",
      "Regards,",
      "[Sender name]",
      "[Sender title]"
    ].join("\n"),
    boundaryNotice: TEMPLATE_BOUNDARY_NOTICE,
    safeMetadataUsed: {
      hasNoticeDeadline: Boolean(noticeDeadlineDate),
      hasRenewalDate: Boolean(renewalDate),
      hasExpirationDate: Boolean(expirationDate),
      hasAccountReference: Boolean(accountReference),
      hasSenderOrganizationName: Boolean(input.senderOrganizationName)
    }
  };
}
