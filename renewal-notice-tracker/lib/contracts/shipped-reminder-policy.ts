import { subDays } from "date-fns";
import type { ExtractedContractFields } from "@/lib/validation/contract";
import { z } from "zod";
import {
  INTERNAL_NOTICE_REMINDER_WINDOWS,
  buildInternalRenewalReminderPlan
} from "@/lib/contracts/internal-renewal-reminders";
import {
  PHASE1_ACKNOWLEDGMENT_BUSINESS_DAYS,
  PHASE1_DECISION_REQUEST_FALLBACK_DAYS,
  PHASE1_DECISION_REQUEST_NOTICE_DAYS,
  PHASE1_REMINDER_DAY_OFFSETS,
  addBusinessDays,
  moveToPreviousBusinessDay
} from "@/lib/contracts/phase1-pilot";

export const SHIPPED_REMINDER_TYPES = [
  "notice_deadline",
  "renewal",
  "expiration",
  "decision_request",
  "acknowledgment_request",
  "internal_review_needed",
  "missed_notice_deadline"
] as const;

export type ShippedReminderType = (typeof SHIPPED_REMINDER_TYPES)[number];

export const SHIPPED_REMINDER_RUNTIME_STATUSES = [
  "pending",
  "processing",
  "sent",
  "retry_pending",
  "failed_terminal",
  "cancelled",
  "superseded"
] as const;

export type ShippedReminderRuntimeStatus = (typeof SHIPPED_REMINDER_RUNTIME_STATUSES)[number];

export type ReminderActivationState =
  | "blocked_by_review"
  | "blocked_by_missing_owner"
  | "blocked_by_missing_p0"
  | "scheduled"
  | "failed"
  | "superseded";

export const SHIPPED_REMINDER_DAY_OFFSETS = {
  notice_deadline: [...INTERNAL_NOTICE_REMINDER_WINDOWS],
  renewal: [...PHASE1_REMINDER_DAY_OFFSETS.renewal_date],
  expiration: [...PHASE1_REMINDER_DAY_OFFSETS.expiration_date]
} as const;

const LEGACY_REMINDER_TYPE_ALIASES = {
  renewal_date: "renewal",
  expiration_date: "expiration"
} as const;

type ShippedScheduleMetadata = ExtractedContractFields & {
  owner_user_id?: string | null;
};

const shippedReminderRecordSchema = z.object({
  reminder_type: z.enum(SHIPPED_REMINDER_TYPES),
  remind_at: z.string().min(1),
  recipient_email: z.string().email(),
  recipient_emails: z.array(z.string().email()).min(1),
  rule_name: z.literal(null).nullable().optional(),
  escalation_level: z.number().int().min(0).default(0),
  delivery_key: z.string().nullable().optional(),
  ical_uid: z.string().nullable().optional(),
  source: z.enum(["system", "manual"]).default("manual")
});

type ReminderInput = z.infer<typeof shippedReminderRecordSchema>;

export function normalizeReminderType(value: string | null | undefined): ShippedReminderType {
  if (!value) {
    return "notice_deadline";
  }

  if ((SHIPPED_REMINDER_TYPES as readonly string[]).includes(value)) {
    return value as ShippedReminderType;
  }

  if (value in LEGACY_REMINDER_TYPE_ALIASES) {
    return LEGACY_REMINDER_TYPE_ALIASES[value as keyof typeof LEGACY_REMINDER_TYPE_ALIASES];
  }

  return "notice_deadline";
}

export function formatReminderTypeLabel(value: string | null | undefined) {
  return normalizeReminderType(value).replaceAll("_", " ");
}

export function formatReminderRuntimeStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "pending":
      return "Scheduled";
    case "processing":
      return "Sending now";
    case "sent":
      return "Sent";
    case "retry_pending":
      return "Retrying";
    case "failed_terminal":
      return "Terminal failure";
    case "cancelled":
      return "Cancelled";
    case "superseded":
      return "Superseded";
    default:
      return "Unknown";
  }
}

export function getReminderActivationState(input: {
  needsReview?: boolean | null;
  ownerUserId?: string | null;
  noticeDeadlineDate?: string | null;
  renewalDate?: string | null;
  expirationDate?: string | null;
  recipientCount?: number;
}): ReminderActivationState {
  if (input.needsReview) {
    return "blocked_by_review";
  }

  if (!input.ownerUserId) {
    return "blocked_by_missing_owner";
  }

  if (!input.noticeDeadlineDate && !input.renewalDate && !input.expirationDate) {
    return "blocked_by_missing_p0";
  }

  return "scheduled";
}

export function buildShippedReminderSchedule(
  metadata: ShippedScheduleMetadata,
  recipientEmails: string[],
  options?: {
    organizationId?: string | null;
    contractId?: string | null;
    contractStatus?: string | null;
    cycleStatus?: string | null;
    renewalDecisionStatus?: string | null;
  }
): ReminderInput[] {
  const reminders: ReminderInput[] = [];
  const internalNoticePlan = buildInternalRenewalReminderPlan({
    metadata,
    recipientEmails,
    organizationId: options?.organizationId,
    contractId: options?.contractId,
    contractStatus: options?.contractStatus,
    cycleStatus: options?.cycleStatus,
    renewalDecisionStatus: options?.renewalDecisionStatus
  });

  reminders.push(
    ...internalNoticePlan.reminders.map((reminder) => shippedReminderRecordSchema.parse(reminder))
  );

  if (internalNoticePlan.status !== "scheduled") return reminders;
  reminders.push(
    ...buildDateReminders(
      metadata.renewal_date,
      recipientEmails,
      "renewal",
      SHIPPED_REMINDER_DAY_OFFSETS.renewal
    )
  );
  reminders.push(
    ...buildDateReminders(
      metadata.expiration_date,
      recipientEmails,
      "expiration",
      SHIPPED_REMINDER_DAY_OFFSETS.expiration
    )
  );

  const decisionAnchor = metadata.notice_deadline_date
    ? subDays(new Date(metadata.notice_deadline_date), PHASE1_DECISION_REQUEST_NOTICE_DAYS)
    : metadata.renewal_date
      ? subDays(new Date(metadata.renewal_date), PHASE1_DECISION_REQUEST_FALLBACK_DAYS)
      : metadata.expiration_date
        ? subDays(new Date(metadata.expiration_date), PHASE1_DECISION_REQUEST_FALLBACK_DAYS)
        : null;

  if (decisionAnchor && !Number.isNaN(decisionAnchor.getTime())) {
    reminders.push(
      shippedReminderRecordSchema.parse({
        reminder_type: "decision_request",
        remind_at: moveToPreviousBusinessDay(decisionAnchor).toISOString(),
        recipient_email: recipientEmails[0] ?? "",
        recipient_emails: recipientEmails,
        escalation_level: 0,
        source: "system"
      })
    );
  }

  const highRiskReminder = reminders.find((reminder) => reminder.reminder_type === "notice_deadline");
  if (highRiskReminder) {
    reminders.push(
      shippedReminderRecordSchema.parse({
        reminder_type: "acknowledgment_request",
        remind_at: addBusinessDays(
          new Date(highRiskReminder.remind_at),
          PHASE1_ACKNOWLEDGMENT_BUSINESS_DAYS
        ).toISOString(),
        recipient_email: recipientEmails[0] ?? "",
        recipient_emails: recipientEmails,
        escalation_level: 0,
        source: "system"
      })
    );
  }

  return Array.from(
    new Map(
      reminders.map((reminder) => [
        `${reminder.reminder_type}-${reminder.remind_at}-${reminder.recipient_email}`,
        reminder
      ])
    ).values()
  );
}

function buildDateReminders(
  isoDate: string | null,
  recipientEmails: string[],
  reminderType: ShippedReminderType,
  offsets: readonly number[]
) {
  if (!isoDate) return [];
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return [];

  return offsets.map((offsetDays) =>
    shippedReminderRecordSchema.parse({
      reminder_type: reminderType,
      remind_at: moveToPreviousBusinessDay(subDays(date, offsetDays)).toISOString(),
      recipient_email: recipientEmails[0] ?? "",
      recipient_emails: recipientEmails,
      escalation_level: 0,
      source: "system"
    })
  );
}
