import { subDays } from "date-fns";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import { moveToPreviousBusinessDay } from "@/lib/contracts/phase1-pilot";
import type { ExtractedContractFields } from "@/lib/validation/contract";

export const INTERNAL_NOTICE_REMINDER_WINDOWS = [30, 14, 7, 3, 0] as const;

export type InternalRenewalReminderType =
  | "notice_deadline"
  | "internal_review_needed"
  | "missed_notice_deadline";

export type InternalRenewalReminderRecord = {
  reminder_type: InternalRenewalReminderType;
  remind_at: string;
  recipient_email: string;
  recipient_emails: string[];
  rule_name?: null;
  escalation_level: number;
  source: "system";
};

export type InternalRenewalReminderPlanStatus =
  | "scheduled"
  | "review_needed"
  | "missed_deadline"
  | "skipped_resolved"
  | "skipped_archived"
  | "skipped_no_internal_recipient";

type InternalReminderMetadata = ExtractedContractFields & {
  owner_user_id?: string | null;
  needs_review?: boolean | null;
};

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(date: string | null | undefined, now: Date) {
  const parsed = parseDateOnly(date);
  if (!parsed) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.round((target - startOfToday) / (24 * 60 * 60 * 1000));
}

function isWeakNoticeDeadline(metadata: InternalReminderMetadata) {
  if (!metadata.notice_deadline_date) return true;
  if (metadata.needs_review) return true;
  return (metadata.field_confidence.notice_deadline_date ?? 0) < LOW_CONFIDENCE_THRESHOLD;
}

function firstRecipient(recipientEmails: string[]) {
  return recipientEmails[0] ?? "";
}

function buildImmediateInternalAlert(input: {
  type: "internal_review_needed" | "missed_notice_deadline";
  recipientEmails: string[];
  now: Date;
}) {
  return {
    reminder_type: input.type,
    remind_at: input.now.toISOString(),
    recipient_email: firstRecipient(input.recipientEmails),
    recipient_emails: input.recipientEmails,
    escalation_level: 0,
    source: "system" as const
  };
}

export function buildInternalRenewalReminderPlan(input: {
  metadata: InternalReminderMetadata;
  recipientEmails: string[];
  now?: Date;
  contractStatus?: string | null;
  cycleStatus?: string | null;
  renewalDecisionStatus?: string | null;
}) {
  const now = input.now ?? new Date();
  const recipientEmails = Array.from(new Set(input.recipientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  const contractStatus = String(input.contractStatus ?? "active").toLowerCase();
  const cycleStatus = String(input.cycleStatus ?? "").toLowerCase();
  const renewalDecisionStatus = String(input.renewalDecisionStatus ?? "undecided").toLowerCase();

  if (contractStatus === "archived" || cycleStatus === "archived") {
    return { status: "skipped_archived" as const, reminders: [] };
  }

  if (["resolved", "renewed", "terminated", "not_renewing"].includes(renewalDecisionStatus) || cycleStatus === "resolved") {
    return { status: "skipped_resolved" as const, reminders: [] };
  }

  if (recipientEmails.length === 0) {
    return { status: "skipped_no_internal_recipient" as const, reminders: [] };
  }

  if (isWeakNoticeDeadline(input.metadata)) {
    return {
      status: "review_needed" as const,
      reminders: [
        buildImmediateInternalAlert({
          type: "internal_review_needed",
          recipientEmails,
          now
        })
      ]
    };
  }

  const daysLeft = daysUntil(input.metadata.notice_deadline_date, now);
  if (daysLeft !== null && daysLeft < 0) {
    return {
      status: "missed_deadline" as const,
      reminders: [
        buildImmediateInternalAlert({
          type: "missed_notice_deadline",
          recipientEmails,
          now
        })
      ]
    };
  }

  const deadline = parseDateOnly(input.metadata.notice_deadline_date);
  if (!deadline) {
    return { status: "review_needed" as const, reminders: [] };
  }

  return {
    status: "scheduled" as const,
    reminders: INTERNAL_NOTICE_REMINDER_WINDOWS.map((windowDays) => ({
      reminder_type: "notice_deadline" as const,
      remind_at: moveToPreviousBusinessDay(subDays(deadline, windowDays)).toISOString(),
      recipient_email: firstRecipient(recipientEmails),
      recipient_emails: recipientEmails,
      escalation_level: 0,
      source: "system" as const
    }))
  };
}

export function isInternalRenewalReminderType(value: string | null | undefined) {
  return value === "notice_deadline" || value === "internal_review_needed" || value === "missed_notice_deadline";
}

export function getInternalRenewalReminderTone(input: {
  reminderType: string;
  noticeDeadlineDate?: string | null;
  now?: Date;
}) {
  if (input.reminderType === "internal_review_needed") return "Review needed";
  if (input.reminderType === "missed_notice_deadline") return "Opt-out deadline missed";

  const daysLeft = daysUntil(input.noticeDeadlineDate, input.now ?? new Date());
  if (daysLeft === 30) return "Review renewal decision";
  if (daysLeft === 14) return "Decision needed soon";
  if (daysLeft === 7) return "Urgent renewal action needed";
  if (daysLeft === 3) return "Critical opt-out deadline approaching";
  if (daysLeft === 0) return "Deadline today";
  if (daysLeft !== null && daysLeft < 0) return "Opt-out deadline missed";
  return "Internal renewal deadline reminder";
}
