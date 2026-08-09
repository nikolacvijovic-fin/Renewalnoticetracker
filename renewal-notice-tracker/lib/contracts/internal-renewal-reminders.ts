import { subDays } from "date-fns";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import { moveToPreviousBusinessDay } from "@/lib/contracts/phase1-pilot";
import type { ExtractedContractFields } from "@/lib/validation/contract";

export const INTERNAL_NOTICE_REMINDER_WINDOWS = [30, 14, 7, 3, 0] as const;

export type InternalRenewalEscalationLabel =
  | "review"
  | "follow_up"
  | "urgent"
  | "critical"
  | "deadline_today"
  | "missed"
  | "review_needed";

export const INTERNAL_NOTICE_REMINDER_ESCALATIONS: Record<
  (typeof INTERNAL_NOTICE_REMINDER_WINDOWS)[number],
  {
    escalationLevel: number;
    escalationLabel: InternalRenewalEscalationLabel;
    subjectToneLabel: string;
    recommendedAction: string;
    recipientRule: "owner_or_internal_fallback";
  }
> = {
  30: {
    escalationLevel: 1,
    escalationLabel: "review",
    subjectToneLabel: "Review renewal decision",
    recommendedAction: "Review the opt-out deadline and confirm the renewal owner has enough evidence.",
    recipientRule: "owner_or_internal_fallback"
  },
  14: {
    escalationLevel: 2,
    escalationLabel: "follow_up",
    subjectToneLabel: "Decision needed soon",
    recommendedAction: "Decide whether to renew, cancel, renegotiate, or defer before the notice window tightens.",
    recipientRule: "owner_or_internal_fallback"
  },
  7: {
    escalationLevel: 3,
    escalationLabel: "urgent",
    subjectToneLabel: "Urgent renewal action needed",
    recommendedAction: "Confirm the renewal decision this week or escalate internally.",
    recipientRule: "owner_or_internal_fallback"
  },
  3: {
    escalationLevel: 4,
    escalationLabel: "critical",
    subjectToneLabel: "Critical opt-out deadline approaching",
    recommendedAction: "Make the renewal decision now; the opt-out window is nearly closed.",
    recipientRule: "owner_or_internal_fallback"
  },
  0: {
    escalationLevel: 5,
    escalationLabel: "deadline_today",
    subjectToneLabel: "Deadline today",
    recommendedAction: "Act today or mark the missed-window risk explicitly.",
    recipientRule: "owner_or_internal_fallback"
  }
} as const;

export type InternalRenewalReminderType =
  | "notice_deadline"
  | "internal_review_needed"
  | "late_activation_action_required"
  | "missed_notice_deadline";

export type InternalRenewalReminderRecord = {
  reminder_type: InternalRenewalReminderType;
  remind_at: string;
  recipient_email: string;
  recipient_emails: string[];
  rule_name?: null;
  escalation_level: number;
  delivery_key?: string | null;
  source: "system";
};

export type InternalRenewalReminderMember = {
  user_id?: string | null;
  role?: string | null;
  user?: {
    notification_email?: string | null;
  } | null;
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

function normalizeEmailList(emails: Array<string | null | undefined>) {
  return Array.from(new Set(emails.map((email) => email?.trim().toLowerCase()).filter(Boolean))) as string[];
}

export function selectInternalRenewalReminderRecipients(input: {
  ownerUserId?: string | null;
  members: InternalRenewalReminderMember[];
  fallbackRecipients?: string[];
}) {
  const ownerRecipient = input.ownerUserId
    ? input.members.find((member) => member.user_id === input.ownerUserId)?.user?.notification_email ?? null
    : null;

  if (ownerRecipient) return normalizeEmailList([ownerRecipient]);

  const internalFallbackRecipients = input.members
    .filter((member) => ["owner", "admin", "operator"].includes(member.role ?? ""))
    .map((member) => member.user?.notification_email ?? null);

  return normalizeEmailList([...internalFallbackRecipients, ...(input.fallbackRecipients ?? [])]);
}

function buildImmediateInternalAlert(input: {
  type: "internal_review_needed" | "late_activation_action_required" | "missed_notice_deadline";
  recipientEmails: string[];
  now: Date;
  organizationId?: string | null;
  contractId?: string | null;
  noticeDeadlineDate?: string | null;
}) {
  const isMissed = input.type === "missed_notice_deadline";
  const isLateActivation = input.type === "late_activation_action_required";
  return {
    reminder_type: input.type,
    remind_at: input.now.toISOString(),
    recipient_email: firstRecipient(input.recipientEmails),
    recipient_emails: input.recipientEmails,
    rule_name: null,
    escalation_level: isMissed ? 6 : isLateActivation ? 1 : 0,
    delivery_key:
      input.organizationId && input.contractId
        ? buildRenewalReminderDeliveryKey({
            organizationId: input.organizationId,
            contractId: input.contractId,
            windowLabel: isMissed ? "missed" : isLateActivation ? "late_activation" : "review_needed",
            noticeDeadlineDate: input.noticeDeadlineDate ?? "missing"
          })
        : null,
    source: "system" as const
  };
}

export function buildRenewalReminderDeliveryKey(input: {
  organizationId: string;
  contractId: string;
  windowLabel: InternalRenewalEscalationLabel | "late_activation" | `${number}d`;
  noticeDeadlineDate: string;
}) {
  return `renewal-deadline:${input.organizationId}:${input.contractId}:${input.windowLabel}:${input.noticeDeadlineDate.slice(0, 10)}`;
}

function dateOnlyTime(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function isActionableReminderDate(remindAt: Date, now: Date) {
  return dateOnlyTime(remindAt) >= dateOnlyTime(now);
}

export function getInternalRenewalEscalationForWindow(windowDays: number) {
  return INTERNAL_NOTICE_REMINDER_ESCALATIONS[
    windowDays as keyof typeof INTERNAL_NOTICE_REMINDER_ESCALATIONS
  ] ?? null;
}

export function buildInternalRenewalReminderPlan(input: {
  metadata: InternalReminderMetadata;
  recipientEmails: string[];
  now?: Date;
  contractStatus?: string | null;
  cycleStatus?: string | null;
  renewalDecisionStatus?: string | null;
  organizationId?: string | null;
  contractId?: string | null;
}) {
  const now = input.now ?? new Date();
  const recipientEmails = normalizeEmailList(input.recipientEmails);
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
          now,
          organizationId: input.organizationId,
          contractId: input.contractId,
          noticeDeadlineDate: input.metadata.notice_deadline_date
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
          now,
          organizationId: input.organizationId,
          contractId: input.contractId,
          noticeDeadlineDate: input.metadata.notice_deadline_date
        })
      ]
    };
  }

  const deadline = parseDateOnly(input.metadata.notice_deadline_date);
  if (!deadline) {
    return { status: "review_needed" as const, reminders: [] };
  }

  const scheduledWindowReminders = INTERNAL_NOTICE_REMINDER_WINDOWS.flatMap((windowDays) => {
    const escalation = INTERNAL_NOTICE_REMINDER_ESCALATIONS[windowDays];
    const remindAt = moveToPreviousBusinessDay(subDays(deadline, windowDays));
    if (!isActionableReminderDate(remindAt, now)) return [];
    return [
      {
        reminder_type: "notice_deadline" as const,
        remind_at: remindAt.toISOString(),
        recipient_email: firstRecipient(recipientEmails),
        recipient_emails: recipientEmails,
        rule_name: null,
        escalation_level: escalation.escalationLevel,
        delivery_key:
          input.organizationId && input.contractId
            ? buildRenewalReminderDeliveryKey({
                organizationId: input.organizationId,
                contractId: input.contractId,
                windowLabel: `${windowDays}d`,
                noticeDeadlineDate: input.metadata.notice_deadline_date!
              })
            : null,
        source: "system" as const
      }
    ];
  });

  const missedWindowCount = INTERNAL_NOTICE_REMINDER_WINDOWS.length - scheduledWindowReminders.length;
  const needsLateActivationAlert = missedWindowCount > 0 && (daysLeft ?? 0) >= 0;

  return {
    status: "scheduled" as const,
    reminders: [
      ...(needsLateActivationAlert
        ? [
            buildImmediateInternalAlert({
              type: "late_activation_action_required",
              recipientEmails,
              now,
              organizationId: input.organizationId,
              contractId: input.contractId,
              noticeDeadlineDate: input.metadata.notice_deadline_date
            })
          ]
        : []),
      ...scheduledWindowReminders
    ]
  };
}

export function isInternalRenewalReminderType(value: string | null | undefined) {
  return (
    value === "notice_deadline" ||
    value === "internal_review_needed" ||
    value === "late_activation_action_required" ||
    value === "missed_notice_deadline"
  );
}

export function getInternalRenewalReminderTone(input: {
  reminderType: string;
  noticeDeadlineDate?: string | null;
  escalationLevel?: number | null;
  now?: Date;
}) {
  if (input.reminderType === "internal_review_needed") return "Review needed";
  if (input.reminderType === "late_activation_action_required") return "Renewal action required";
  if (input.reminderType === "missed_notice_deadline") return "Opt-out deadline missed";
  const escalationByLevel = Object.values(INTERNAL_NOTICE_REMINDER_ESCALATIONS).find(
    (item) => item.escalationLevel === input.escalationLevel
  );
  if (escalationByLevel) return escalationByLevel.subjectToneLabel;

  const daysLeft = daysUntil(input.noticeDeadlineDate, input.now ?? new Date());
  if (daysLeft === 30) return "Review renewal decision";
  if (daysLeft === 14) return "Decision needed soon";
  if (daysLeft === 7) return "Urgent renewal action needed";
  if (daysLeft === 3) return "Critical opt-out deadline approaching";
  if (daysLeft === 0) return "Deadline today";
  if (daysLeft !== null && daysLeft < 0) return "Opt-out deadline missed";
  return "Internal renewal deadline reminder";
}

export function buildInternalRenewalReminderContent(input: {
  contractId: string;
  contractTitle: string;
  counterpartyName?: string | null;
  reminderType: string;
  noticeDeadlineDate?: string | null;
  daysRemaining?: number | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  ownerLabel?: string | null;
  appUrl: string;
  escalationLevel?: number | null;
}) {
  const tone = getInternalRenewalReminderTone({
    reminderType: input.reminderType,
    noticeDeadlineDate: input.noticeDeadlineDate,
    escalationLevel: input.escalationLevel
  });
  const escalation = Object.values(INTERNAL_NOTICE_REMINDER_ESCALATIONS).find(
    (item) => item.escalationLevel === input.escalationLevel
  );
  const spend =
    input.contractValueAmount !== null &&
    input.contractValueAmount !== undefined &&
    Number.isFinite(input.contractValueAmount)
      ? `${input.contractValueCurrency ?? "USD"} ${Math.round(input.contractValueAmount)}`
      : "Unknown";

  return {
    subject: `${tone}: ${input.contractTitle}`,
    previewText: `${input.counterpartyName ?? "Counterparty not set"} | Notice deadline ${
      input.noticeDeadlineDate ?? "needs review"
    }`,
    urgencyLabel:
      escalation?.escalationLabel ??
      (input.reminderType === "missed_notice_deadline"
        ? "missed"
        : input.reminderType === "late_activation_action_required"
          ? "late_activation"
          : "review_needed"),
    contractTitle: input.contractTitle,
    counterpartyName: input.counterpartyName ?? "Counterparty not set",
    deadlineDate: input.noticeDeadlineDate ?? null,
    daysRemaining: input.daysRemaining ?? null,
    spendAtRisk: spend,
    ownerLabel: input.ownerLabel ?? "Unassigned",
    actionUrl: `${input.appUrl}/dashboard/contracts/${input.contractId}`,
    recommendedManualAction:
      escalation?.recommendedAction ??
      (input.reminderType === "missed_notice_deadline"
        ? "Review the missed opt-out window and record the business decision."
        : input.reminderType === "late_activation_action_required"
          ? "Review the already-missed reminder windows and confirm the renewal decision path."
        : "Review the missing or weak notice deadline before trusting the reminder schedule.")
  };
}
