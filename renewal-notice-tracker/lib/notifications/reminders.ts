import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendReminderEmail } from "@/lib/email/send-reminder";
import type { Json } from "@/lib/supabase/database.types";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";
import {
  buildDeliveryKey,
  isTerminalAttempt,
  nextRetryForAttempt
} from "@/lib/notifications/policy";
import { normalizeReminderType } from "@/lib/contracts/shipped-reminder-policy";
import {
  getScopedNotificationLogById,
  getScopedReminderById,
  updateScopedReminderById
} from "@/lib/organization/scoped-admin";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getAppConfig } from "@/lib/config";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

export const REMINDER_PROCESSING_LEASE_MS = 15 * 60 * 1000;
export const REMINDER_DISPATCH_BATCH_LIMIT = 50;
const STALE_REMINDER_RESCUE_MESSAGE =
  "Reminder processing lease expired. Returned to retry_pending for rescue.";

type ReminderRecord = {
  id: string;
  organization_id: string;
  contract_id: string;
  remind_at: string;
  reminder_type: string;
  recipient_email: string;
  recipient_emails: unknown;
  status: string;
  attempt_count: number;
  max_attempts: number;
};

type DeliveryContract = {
  id: string;
  contract_metadata:
    | {
        contract_title: string | null;
        counterparty_name: string | null;
      }
    | Array<{
        contract_title: string | null;
        counterparty_name: string | null;
      }>
    | null;
};

type JoinedReminderRecord = ReminderRecord & {
  contracts: DeliveryContract;
};

function getReminderProcessingLeaseMs() {
  return getAppConfig().operations.reminderProcessingLeaseMinutes * 60 * 1000;
}

function emitReminderLifecycleEvent(input: {
  eventName: string;
  organizationId: string;
  reminderId: string;
  contractId?: string | null;
  severity?: "P2" | "P3";
  alert?: boolean;
  metadata?: Record<string, unknown>;
}) {
  void emitOperationalEvent({
    eventName: input.eventName,
    severity: input.severity ?? "P3",
    sensitivity: "customer_sensitive",
    alert: input.alert ?? false,
    organizationId: input.organizationId,
    action: "reminder_dispatch",
    metadata: {
      reminder_id: input.reminderId,
      contract_id: input.contractId ?? null,
      ...input.metadata
    }
  });
}

function checkedReminderWrite<TData>(
  write: PromiseLike<{ data?: TData | null; error: unknown | null }>,
  input: {
    operation: "insert" | "update" | "delete" | "upsert";
    table: string;
    context: string;
  }
) {
  return checkedPrivilegedWrite(write, input);
}

export async function processDueReminders(untilIso: string) {
  const admin = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - getReminderProcessingLeaseMs()).toISOString();

  await rescueStaleReminderClaims(nowIso, staleBeforeIso);

  const { data: reminders, error } = await admin
    .from("reminders")
    .select(
      `
      *,
      contracts (
        id,
        contract_metadata (
          contract_title,
          counterparty_name
        )
      )
    `
    )
    .in("status", ["pending", "retry_pending"])
    .or(`next_retry_at.lte.${untilIso},and(next_retry_at.is.null,remind_at.lte.${untilIso})`)
    .order("next_retry_at", { ascending: true })
    .limit(REMINDER_DISPATCH_BATCH_LIMIT);

  if (error) throw error;

  const results: Array<{
    id: string;
    status: string;
    error?: string;
    duplicateSuppressedCount?: number;
    deliveryCount?: number;
  }> = [];

  for (const reminder of (reminders ?? []) as JoinedReminderRecord[]) {
    const claim = await claimReminder(reminder.id, reminder.organization_id);
    if (!claim) continue;

    try {
      const result = await deliverReminder({
        reminder: claim,
        contract: claim.contracts as DeliveryContract
      });

      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected reminder error";
      await markReminderFailure(reminder.id, reminder.organization_id, message);
      results.push({
        id: reminder.id,
        status: "failed",
        error: message
      });
    }
  }

  return results;
}

export async function resendNotificationByLogId(notificationLogId: string, organizationId: string) {
  const log = await getScopedNotificationLogById(notificationLogId, organizationId);
  if (!log.reminder_id) throw new Error("Notification log is not linked to a reminder.");

  const typedReminder = (await getScopedReminderById(
    log.reminder_id,
    organizationId
  )) as JoinedReminderRecord;

  return deliverReminder({
    reminder: typedReminder,
    contract: typedReminder.contracts,
    bypassDuplicateCheck: true
  });
}

export async function rerunReminderJob(reminderId: string, organizationId: string) {
  return updateScopedReminderById(reminderId, organizationId, {
    status: "retry_pending",
    next_retry_at: new Date().toISOString(),
    processing_started_at: null,
    processing_token: null
  });
}

async function rescueStaleReminderClaims(nowIso: string, staleBeforeIso: string) {
  const admin = createAdminSupabaseClient();
  const result = await checkedReminderWrite<
    Array<{ id: string; organization_id: string; contract_id: string | null }>
  >(
    admin
      .from("reminders")
      .update({
        status: "retry_pending",
        next_retry_at: nowIso,
        last_error: STALE_REMINDER_RESCUE_MESSAGE,
        processing_started_at: null,
        processing_token: null
      })
      .eq("status", "processing")
      .lt("processing_started_at", staleBeforeIso)
      .select("id, organization_id, contract_id"),
    {
      operation: "update",
      table: "reminders",
      context: "rescue_stale_reminder_claims"
    }
  );

  for (const reminder of ((result.data ?? []) as Array<{
    id: string;
    organization_id: string;
    contract_id: string | null;
  }>).slice(0, REMINDER_DISPATCH_BATCH_LIMIT)) {
    emitReminderLifecycleEvent({
      eventName: "reminder_stale_rescued",
      organizationId: reminder.organization_id,
      reminderId: reminder.id,
      contractId: reminder.contract_id,
      metadata: {
        rescue_state: "retry_pending",
        lease_expired_before: staleBeforeIso
      }
    });
  }
}

async function claimReminder(
  reminderId: string,
  organizationId: string
): Promise<JoinedReminderRecord | null> {
  const admin = createAdminSupabaseClient();
  const token = crypto.randomUUID();
  const result = await checkedReminderWrite<JoinedReminderRecord | null>(
    admin
      .from("reminders")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        processing_token: token
      })
      .eq("id", reminderId)
      .eq("organization_id", organizationId)
      .in("status", ["pending", "retry_pending"])
      .select(
        `
        *,
        contracts (
          id,
          contract_metadata (
            contract_title,
            counterparty_name
          )
        )
      `
      )
      .maybeSingle(),
    {
      operation: "update",
      table: "reminders",
      context: `claim_reminder:${reminderId}`
    }
  );

  const claimed = result.data ?? null;
  if (claimed) {
    emitReminderLifecycleEvent({
      eventName: "reminder_claimed",
      organizationId,
      reminderId,
      contractId: claimed.contract_id,
      metadata: {
        status: "processing"
      }
    });
  }

  return claimed;
}

async function deliverReminder(input: {
  reminder: ReminderRecord & Record<string, unknown>;
  contract: DeliveryContract;
  bypassDuplicateCheck?: boolean;
}) {
  const admin = createAdminSupabaseClient();
  const metadata = Array.isArray(input.contract?.contract_metadata)
    ? input.contract.contract_metadata[0]
    : input.contract?.contract_metadata;
  const recipients = Array.isArray(input.reminder.recipient_emails)
    ? input.reminder.recipient_emails.map(String)
    : [input.reminder.recipient_email];
  const title = reminderTitle(
    input.reminder.reminder_type,
    metadata?.contract_title ?? "Untitled contract"
  );
  const body = `Counterparty: ${metadata?.counterparty_name ?? "Not set"} | Reminder date: ${new Date(
    input.reminder.remind_at
  ).toUTCString()}`;
  const runKey = buildDeliveryKey([
    input.reminder.id,
    "run",
    String(input.reminder.attempt_count + 1),
    input.reminder.remind_at
  ]);

  await checkedReminderWrite(
    admin.from("reminder_runs").insert({
      reminder_id: input.reminder.id,
      organization_id: input.reminder.organization_id,
      idempotency_key: runKey,
      status: "started"
    }),
    {
      operation: "insert",
      table: "reminder_runs",
      context: `deliver_reminder:${input.reminder.id}:start_run`
    }
  );

  let duplicateSuppressedCount = 0;
  let deliveryCount = 0;
  for (const recipientEmail of recipients) {
    const outcome = await sendEmailOnce({
      reminder: input.reminder,
      recipientEmail,
      title,
      body,
      contractTitle: metadata?.contract_title ?? "Untitled contract",
      counterpartyName: metadata?.counterparty_name ?? null,
      bypassDuplicateCheck: input.bypassDuplicateCheck
    });
    if (outcome === "duplicate_suppressed") duplicateSuppressedCount += 1;
    if (outcome === "sent") deliveryCount += 1;
  }

  await checkedReminderWrite(
    admin
      .from("reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        attempt_count: input.reminder.attempt_count + 1,
        last_error: null,
        processing_started_at: null,
        processing_token: null
      })
      .eq("id", input.reminder.id)
      .eq("organization_id", input.reminder.organization_id),
    {
      operation: "update",
      table: "reminders",
      context: `deliver_reminder:${input.reminder.id}:mark_sent`
    }
  );

  await checkedReminderWrite(
    admin
      .from("reminder_runs")
      .update({
        status:
          duplicateSuppressedCount > 0 ? "sent_with_duplicate_suppression" : "sent"
      })
      .eq("idempotency_key", runKey),
    {
      operation: "update",
      table: "reminder_runs",
      context: `deliver_reminder:${input.reminder.id}:finalize_run`
    }
  );

  await trackServerAnalyticsEvent({
    organizationId: input.reminder.organization_id,
    eventName: "reminder_sent",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `reminder_sent:${input.reminder.id}:${input.reminder.attempt_count + 1}`,
    properties: {
      contract_id: input.reminder.contract_id,
      reminder_id: input.reminder.id,
      delivery_count: deliveryCount,
      duplicate_suppressed_count: duplicateSuppressedCount
    }
  });

  emitReminderLifecycleEvent({
    eventName: "reminder_sent",
    organizationId: input.reminder.organization_id,
    reminderId: input.reminder.id,
    contractId: input.reminder.contract_id,
    metadata: {
      delivery_count: deliveryCount,
      duplicate_suppressed_count: duplicateSuppressedCount,
      attempt_count: input.reminder.attempt_count + 1
    }
  });

  return {
    id: input.reminder.id,
    status: "sent",
    duplicateSuppressedCount,
    deliveryCount
  };
}

async function sendEmailOnce(params: {
  reminder: ReminderRecord;
  recipientEmail: string;
  title: string;
  body: string;
  contractTitle: string;
  counterpartyName: string | null;
  bypassDuplicateCheck?: boolean;
}) {
  const deliveryKey = buildDeliveryKey([params.reminder.id, "email", params.recipientEmail]);
  const exists = params.bypassDuplicateCheck ? false : await notificationExists(deliveryKey);
  if (exists) {
    await logNotification({
      reminderId: params.reminder.id,
      organizationId: params.reminder.organization_id,
      recipientEmail: params.recipientEmail,
      channel: "email",
      status: "duplicate_suppressed",
      destination: params.recipientEmail,
      providerPayload: { suppressed_delivery_key: deliveryKey }
    });
    return "duplicate_suppressed" as const;
  }

  const email = await sendReminderEmail({
    organizationId: params.reminder.organization_id,
    reminderId: params.reminder.id,
    recipientEmail: params.recipientEmail,
    recipientIdentity: params.recipientEmail,
    contractId: params.reminder.contract_id,
    contractTitle: params.contractTitle,
    counterpartyName: params.counterpartyName,
    remindAt: params.reminder.remind_at,
    reminderType: params.reminder.reminder_type,
    userId: null
  });

  await logNotification({
    reminderId: params.reminder.id,
    organizationId: params.reminder.organization_id,
    recipientEmail: params.recipientEmail,
    channel: "email",
    status: "sent",
    providerMessageId: email.data?.id ?? null,
    destination: params.recipientEmail,
    deliveryKey,
    providerPayload: { title: params.title, body: params.body }
  });
  return "sent" as const;
}

export async function markReminderFailure(reminderId: string, organizationId: string, message: string) {
  const admin = createAdminSupabaseClient();
  const { data: reminder, error } = await admin
    .from("reminders")
    .select("attempt_count, max_attempts, recipient_email, contract_id")
    .eq("id", reminderId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;

  const attemptCount = reminder.attempt_count + 1;
  const terminal = isTerminalAttempt(attemptCount, reminder.max_attempts);
  const nextRetryAt = terminal ? null : nextRetryForAttempt(attemptCount);

  await checkedReminderWrite(
    admin
      .from("reminders")
      .update({
        status: terminal ? "failed_terminal" : "retry_pending",
        attempt_count: attemptCount,
        next_retry_at: nextRetryAt,
        last_attempt_at: new Date().toISOString(),
        last_error: message,
        processing_started_at: null,
        processing_token: null
      })
      .eq("id", reminderId)
      .eq("organization_id", organizationId),
    {
      operation: "update",
      table: "reminders",
      context: `mark_reminder_failure:${reminderId}`
    }
  );

  await checkedReminderWrite(
    admin
      .from("reminder_runs")
      .upsert(
        {
          reminder_id: reminderId,
          organization_id: organizationId,
          idempotency_key: buildDeliveryKey([reminderId, "run", String(attemptCount)]),
          status: terminal ? "failed_terminal" : "retry_pending",
          error_message: message
        },
        {
          onConflict: "idempotency_key"
        }
      ),
    {
      operation: "upsert",
      table: "reminder_runs",
      context: `mark_reminder_failure:${reminderId}:upsert_run`
    }
  );

  await logNotification({
    reminderId,
    organizationId,
    recipientEmail: reminder.recipient_email,
    channel: "email",
    status: "failed",
    errorMessage: message,
    deliveryKey: buildDeliveryKey([reminderId, "failure", String(attemptCount)]),
    providerPayload: {
      classification: terminal ? "terminal_failure" : "retry_scheduled",
      terminal,
      nextRetryAt
    }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    eventName: "reminder_failed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `reminder_failed:${reminderId}:${attemptCount}`,
    properties: {
      reminder_id: reminderId,
      attempt_count: attemptCount,
      terminal,
      next_retry_at: nextRetryAt
    }
  });

  emitReminderLifecycleEvent({
    eventName: terminal ? "reminder_terminal_failed" : "reminder_retry_scheduled",
    organizationId,
    reminderId,
    contractId: reminder.contract_id,
    severity: terminal ? "P2" : "P3",
    alert: terminal,
    metadata: {
      status: terminal ? "failed_terminal" : "retry_pending",
      attempt_count: attemptCount,
      max_attempts: reminder.max_attempts,
      next_retry_at: nextRetryAt,
      failure_code: terminal
        ? "ERR_REMINDER_TERMINAL_FAILURE_001"
        : "ERR_REMINDER_RETRY_SCHEDULED_001"
    }
  });
}

async function notificationExists(deliveryKey: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("notification_logs")
    .select("id")
    .eq("delivery_key", deliveryKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function logNotification(params: {
  reminderId: string | null;
  organizationId: string;
  recipientEmail: string;
  channel: "email";
  status: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  destination?: string | null;
  deliveryKey?: string | null;
  providerPayload?: Record<string, unknown>;
}) {
  const admin = createAdminSupabaseClient();
  await checkedReminderWrite(
    admin.from("notification_logs").insert({
      reminder_id: params.reminderId,
      organization_id: params.organizationId,
      recipient_email: params.recipientEmail,
      channel: params.channel,
      status: params.status,
      provider_message_id: params.providerMessageId ?? null,
      error_message: params.errorMessage ?? null,
      notification_kind: "reminder",
      destination: params.destination ?? null,
      delivery_key: params.deliveryKey ?? null,
      provider_payload: (params.providerPayload ?? {}) as Json
    }),
    {
      operation: "insert",
      table: "notification_logs",
      context: `log_notification:${params.reminderId ?? "none"}:${params.status}`
    }
  );
}

function reminderTitle(reminderType: string, contractTitle: string) {
  const normalized = normalizeReminderType(reminderType);
  const base =
    normalized === "notice_deadline"
      ? "Upcoming notice deadline"
      : normalized === "renewal"
        ? "Upcoming renewal date"
        : normalized === "expiration"
          ? "Upcoming expiration date"
          : normalized === "decision_request"
            ? "Decision needed"
            : "Acknowledgment needed";
  return `${base} - ${contractTitle}`;
}
