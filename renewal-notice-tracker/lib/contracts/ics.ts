import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { RenewalCommandContractInput } from "@/lib/dashboard/renewal-command-center";
import type { UrgentRenewalItem } from "@/lib/dashboard/urgent-renewal-items";
import type { SaasOptOutClockItem } from "@/lib/saas/queries";

export const ICS_REMINDER_ALARM_OFFSETS_DAYS = [30, 14, 7, 3, 0] as const;

export type CalendarEventType =
  | "notice_deadline"
  | "renewal_date"
  | "expiration_date"
  | "opt_out_deadline";

export type IcsEvent = {
  uid: string;
  start?: string;
  startDate?: string;
  summary: string;
  description: string;
  alarms?: readonly number[];
};

export type ContractCalendarMetadata = {
  contract_title?: string | null;
  counterparty_name?: string | null;
  renewal_date?: string | null;
  expiration_date?: string | null;
  notice_deadline_date?: string | null;
  needs_review?: boolean | null;
  has_weak_evidence?: boolean | null;
  field_confidence?: Record<string, number> | null;
  contract_value_amount?: number | null;
  contract_value_currency?: string | null;
};

export type ContractCalendarInput = {
  contractId: string;
  contractTitle?: string | null;
  counterpartyName?: string | null;
  ownerLabel?: string | null;
  metadata: ContractCalendarMetadata | null;
  appUrl: string;
  includeTentativeNoticeDeadline?: boolean;
};

const textEncoder = new TextEncoder();
const ICS_CONTENT_LINE_OCTET_LIMIT = 75;
const ICS_CONTINUATION_PREFIX = " ";
const ICS_UID_DOMAIN = "noticecontrol.app";

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const [inputYear, inputMonth, inputDay] = normalized.split("-").map(Number);
  return year === inputYear && month === inputMonth && day === inputDay ? normalized : null;
}

function toUtcStamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toIcsDate(value: string) {
  return value.replaceAll("-", "");
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function utf8ByteLength(value: string) {
  return textEncoder.encode(value).length;
}

function foldContentLine(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let chunkLimit = ICS_CONTENT_LINE_OCTET_LIMIT;

  for (const codePoint of Array.from(line)) {
    const next = `${chunk}${codePoint}`;
    if (chunk && utf8ByteLength(next) > chunkLimit) {
      chunks.push(chunk);
      chunk = codePoint;
      chunkLimit = ICS_CONTENT_LINE_OCTET_LIMIT - utf8ByteLength(ICS_CONTINUATION_PREFIX);
    } else {
      chunk = next;
    }
  }

  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks
    .map((part, index) => (index === 0 ? part : `${ICS_CONTINUATION_PREFIX}${part}`))
    .join("\r\n");
}

function cleanText(value: string | null | undefined, fallback: string, maxLength = 180) {
  const normalized = String(value ?? fallback)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLength) || fallback;
}

function cleanDescriptionText(value: string | null | undefined, fallback: string, maxLength = 1200) {
  const normalized = String(value ?? fallback)
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.slice(0, maxLength) || fallback;
}

function normalizeAppUrl(value: string) {
  return value.replace(/\/$/, "");
}

function normalizeUid(value: string, fallback: string) {
  const base = cleanText(value, fallback, 220)
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:@-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) return `${fallback}@${ICS_UID_DOMAIN}`;
  return base.includes("@") ? base : `${base}@${ICS_UID_DOMAIN}`;
}

function eventTypeLabel(type: CalendarEventType) {
  switch (type) {
    case "notice_deadline":
      return "Notice deadline";
    case "renewal_date":
      return "Renewal date";
    case "expiration_date":
      return "Expiration date";
    case "opt_out_deadline":
      return "Opt-out deadline";
  }
}

function isWeakNoticeDeadline(metadata: ContractCalendarMetadata | null) {
  if (!metadata?.notice_deadline_date) return true;
  if (metadata.needs_review || metadata.has_weak_evidence) return true;
  return (metadata.field_confidence?.notice_deadline_date ?? 0) < LOW_CONFIDENCE_THRESHOLD;
}

function buildSafeDescription(input: {
  type: CalendarEventType;
  contractTitle: string;
  counterpartyName: string;
  date: string;
  href: string;
  reviewNeeded?: boolean;
}) {
  return [
    "NoticeControl calendar export.",
    `Type: ${eventTypeLabel(input.type)}.`,
    `Contract: ${input.contractTitle}.`,
    `Vendor/counterparty: ${input.counterpartyName}.`,
    `Date: ${input.date}.`,
    input.reviewNeeded ? "Trust status: Needs review before this date should be treated as operational truth." : null,
    `Open in NoticeControl: ${input.href}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDateEvent(input: {
  contractId: string;
  type: CalendarEventType;
  date: string | null | undefined;
  contractTitle: string;
  counterpartyName: string;
  ownerLabel?: string | null;
  amount?: number | null;
  currency?: string | null;
  appUrl: string;
  href?: string;
  reviewNeeded?: boolean;
}): IcsEvent | null {
  const date = parseDateOnly(input.date);
  if (!date) return null;

  const label = eventTypeLabel(input.type);
  const safeTitle = cleanText(input.contractTitle, "Untitled contract");
  const safeCounterparty = cleanText(input.counterpartyName, "Unknown vendor");
  const href = input.href ?? `${normalizeAppUrl(input.appUrl)}/dashboard/contracts/${input.contractId}`;
  const reviewPrefix = input.reviewNeeded ? "Needs review: " : "";
  const displayName = safeTitle.toLowerCase().includes(safeCounterparty.toLowerCase())
    ? safeTitle
    : `${safeCounterparty} - ${safeTitle}`;

  return {
    uid: `noticecontrol-${input.contractId}-${input.type}-${date}`,
    startDate: date,
    summary: `${reviewPrefix}${label}: ${displayName}`,
    description: buildSafeDescription({
      type: input.type,
      contractTitle: safeTitle,
      counterpartyName: safeCounterparty,
      date,
      href,
      reviewNeeded: input.reviewNeeded
    }),
    alarms: ICS_REMINDER_ALARM_OFFSETS_DAYS
  };
}

export function buildContractDateCalendarEvents(input: ContractCalendarInput): IcsEvent[] {
  const metadata = input.metadata;
  const title = input.contractTitle ?? metadata?.contract_title ?? "Untitled contract";
  const counterparty = input.counterpartyName ?? metadata?.counterparty_name ?? "Unknown vendor";
  const weakNoticeDeadline = isWeakNoticeDeadline(metadata);
  const includeTentativeNoticeDeadline = input.includeTentativeNoticeDeadline ?? true;
  const common = {
    contractId: input.contractId,
    contractTitle: title,
    counterpartyName: counterparty,
    ownerLabel: input.ownerLabel,
    amount: metadata?.contract_value_amount ?? null,
    currency: metadata?.contract_value_currency ?? null,
    appUrl: input.appUrl
  };

  return [
    !weakNoticeDeadline || includeTentativeNoticeDeadline
      ? buildDateEvent({
          ...common,
          type: "notice_deadline",
          date: metadata?.notice_deadline_date,
          reviewNeeded: weakNoticeDeadline
        })
      : null,
    buildDateEvent({
      ...common,
      type: "renewal_date",
      date: metadata?.renewal_date
    }),
    buildDateEvent({
      ...common,
      type: "expiration_date",
      date: metadata?.expiration_date
    })
  ].filter((event): event is IcsEvent => Boolean(event));
}

export function buildTrustedUpcomingContractCalendarEvents(input: {
  contracts: RenewalCommandContractInput[];
  appUrl: string;
  now?: Date;
  maxDays?: number;
}) {
  const now = input.now ?? new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return input.contracts.flatMap((contract) => {
    if (isInactiveContract(contract.status, contract.statusTag, contract.cycleStatus)) return [];
    const date = parseDateOnly(contract.noticeDeadlineDate);
    if (!date) return [];
    const target = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10))
    );
    const daysLeft = Math.round((target - startOfToday) / (24 * 60 * 60 * 1000));
    const trusted = (contract.fieldConfidence?.notice_deadline_date ?? 0) >= LOW_CONFIDENCE_THRESHOLD;
    if (!trusted || contract.needsReview || contract.hasWeakEvidence || daysLeft < 0) return [];
    if (input.maxDays !== undefined && daysLeft > input.maxDays) return [];

    const event = buildDateEvent({
      contractId: contract.id,
      contractTitle: contract.title,
      counterpartyName: contract.counterpartyName ?? "Unknown vendor",
      ownerLabel: contract.ownerName,
      amount: contract.contractValueAmount,
      currency: contract.contractValueCurrency,
      appUrl: input.appUrl,
      type: "notice_deadline",
      date
    });
    return event ? [event] : [];
  });
}

function isInactiveContract(
  status: string | null | undefined,
  statusTag: string | null | undefined,
  cycleStatus: string | null | undefined
) {
  const inactive = new Set(["archived", "resolved", "cancelled", "canceled", "deleted", "ignored"]);
  return [status, statusTag, cycleStatus].some((value) => inactive.has(String(value ?? "").toLowerCase()));
}

export function buildUrgentRenewalCalendarEvents(input: {
  items: UrgentRenewalItem[];
  appUrl: string;
}) {
  return input.items.flatMap((item) => {
    if (item.trustStatus !== "trusted" || item.daysLeft === null || item.daysLeft < 0 || item.daysLeft > 30) return [];
    const event = buildDateEvent({
      contractId: item.contractId,
      contractTitle: item.contractTitle,
      counterpartyName: item.counterpartyName,
      ownerLabel: item.ownerName,
      amount: item.contractValueAmount,
      currency: item.contractValueCurrency,
      appUrl: input.appUrl,
      type: "notice_deadline",
      date: item.noticeDeadlineDate
    });
    return event ? [event] : [];
  });
}

export function buildSaasOptOutCalendarEvents(input: {
  items: SaasOptOutClockItem[];
  appUrl: string;
}) {
  return input.items.flatMap((item) => {
    if (!item.effectiveOptOutDeadline) return [];
    if (["resolved", "ignored", "archived"].includes(item.workflowStatus)) return [];

    const event = buildDateEvent({
      contractId: item.contractId ?? item.software.id,
      contractTitle: item.software.name,
      counterpartyName: item.software.vendor_name ?? item.software.name,
      ownerLabel: item.ownerLabel,
      amount: item.spendAtRiskAmount,
      currency: item.spendAtRiskCurrency,
      appUrl: input.appUrl,
      href: `${normalizeAppUrl(input.appUrl)}/dashboard/saas-opt-out-clock`,
      type: "opt_out_deadline",
      date: item.effectiveOptOutDeadline,
      reviewNeeded: item.metadataConflicts.length > 0
    });
    return event ? [event] : [];
  });
}

export function buildCalendar(events: IcsEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NoticeControl//Renewal Calendar//EN",
    "CALSCALE:GREGORIAN"
  ];

  const now = new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const [index, event] of events.entries()) {
    const startDate = event.startDate ? parseDateOnly(event.startDate) : null;
    const startStamp = event.start ? toUtcStamp(event.start) : null;
    if ((event.startDate && !startDate) || (event.start && !startStamp) || (!startDate && !startStamp)) continue;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(normalizeUid(event.uid, `noticecontrol-event-${index}`))}`,
      `DTSTAMP:${toUtcStamp(now.toISOString()) ?? ""}`
    );
    if (startDate) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startDate)}`, `DTEND;VALUE=DATE:${toIcsDate(addDays(startDate, 1))}`);
    } else if (startStamp) {
      lines.push(`DTSTART:${startStamp}`);
    }
    lines.push(
      `SUMMARY:${escapeText(cleanText(event.summary, "NoticeControl deadline"))}`,
      `DESCRIPTION:${escapeText(cleanDescriptionText(event.description, "Open NoticeControl for deadline details."))}`
    );
    const eventIsHistorical = startDate
      ? Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, Number(startDate.slice(8, 10))) < startOfToday
      : false;
    for (const offset of eventIsHistorical ? [] : event.alarms ?? []) {
      lines.push(
        "BEGIN:VALARM",
        `TRIGGER:${offset === 0 ? "PT0S" : `-P${offset}D`}`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(cleanText(event.summary, "NoticeControl deadline"))}`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldContentLine).join("\r\n")}\r\n`;
}
