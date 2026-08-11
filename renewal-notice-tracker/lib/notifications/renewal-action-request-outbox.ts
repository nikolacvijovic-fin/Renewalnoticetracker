import { randomUUID } from "node:crypto";
import { sendRenewalActionRequestEmail } from "@/lib/email/send-reminder";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";
import type { Json } from "@/lib/supabase/database.types";
import {
  claimAdminRenewalActionNotification,
  getAdminNotificationUserLabel,
  getAdminRenewalActionContractContext,
  getAdminRenewalActionRequestById,
  listAdminQueuedRenewalActionNotifications,
  rescueAdminStaleRenewalActionNotifications,
  updateAdminRenewalActionNotification
} from "@/lib/notifications/repositories/admin-renewal-action-notifications-repository";

const MAX_ERROR_LENGTH = 180;
const DEFAULT_OUTBOX_LIMIT = 25;
const STALE_CLAIM_MINUTES = 10;
const MAX_RETRY_DELAY_MINUTES = 60;

type RenewalActionNotificationRow = {
  id: string;
  organization_id: string;
  recipient_email: string;
  delivery_key: string | null;
  provider_payload: Json;
  status: string;
  attempt_count?: number;
  max_attempts?: number;
  provider_message_id?: string | null;
  processing_token?: string | null;
};

type NotificationTerminalStatus = "sent" | "retry_pending" | "failed_terminal" | "skipped";

type RenewalActionRequestRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_to_user_id: string;
  requested_by_user_id: string | null;
  requested_action: string;
  request_status: string;
  due_date: string | null;
  due_at: string | null;
  message: string | null;
};

type ContractContextRow = {
  id: string;
  owner_user_id: string | null;
  contract_metadata:
    | {
        contract_title: string | null;
        counterparty_name: string | null;
        notice_deadline_date: string | null;
        renewal_date: string | null;
        expiration_date: string | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }
    | Array<{
        contract_title: string | null;
        counterparty_name: string | null;
        notice_deadline_date: string | null;
        renewal_date: string | null;
        expiration_date: string | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }>
    | null;
};

export function buildRenewalActionRequestNotificationDeliveryKey(requestId: string) {
  return `renewal_action_request:${requestId}:email`;
}

export function getRenewalActionRequestIdFromPayload(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, Json | undefined>).request_id;
  return typeof value === "string" && value.trim() ? value : null;
}

export function sanitizeRenewalActionNotificationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Renewal action notification delivery failed.";
  return message
    .replace(/raw contract text[^,.;\n]*/gi, "[REDACTED]")
    .replace(/private notes?[^,.;\n]*/gi, "[REDACTED]")
    .replace(/provider response[^,.;\n]*/gi, "[REDACTED]")
    .replace(/secret[^,.;\n]*/gi, "[REDACTED]")
    .replace(/token[^,.;\n]*/gi, "[REDACTED]")
    .replace(/payload[^,.;\n]*/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, MAX_ERROR_LENGTH);
}

function firstValue<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safeUserLabel(user: { full_name?: string | null; notification_email?: string | null } | null) {
  return user?.full_name ?? user?.notification_email ?? "NoticeControl operator";
}

async function markNotification(
  row: RenewalActionNotificationRow,
  update: {
    status: NotificationTerminalStatus;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    providerPayload?: Record<string, Json | undefined>;
    nextRetryAt?: string | null;
    attemptCount?: number;
  }
) {
  if (!row.processing_token) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claim_lost",
      row,
      severity: "P2",
      metadata: {
        transition_status: update.status,
        claim_lost_reason: "missing_processing_token"
      }
    });
    return { claimLost: true as const, data: null };
  }

  const result = await checkedPrivilegedWrite(
    updateAdminRenewalActionNotification({
      notificationId: row.id,
      organizationId: row.organization_id,
      processingToken: row.processing_token,
      update: {
        status: update.status,
        provider_message_id: update.providerMessageId ?? null,
        error_message: update.errorMessage ?? null,
        provider_payload: (update.providerPayload ?? {}) as Json,
        attempt_count: update.attemptCount,
        next_retry_at: update.nextRetryAt ?? null,
        processing_started_at: null,
        processing_token: null,
        sent_at: update.status === "sent" ? new Date().toISOString() : undefined
      }
    }),
    {
      operation: "update",
      table: "notification_logs",
      context: `renewal_action_request_notification:${row.id}:${update.status}`
    }
  );

  if (!result.data) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claim_lost",
      row,
      severity: "P2",
      metadata: {
        transition_status: update.status,
        claim_lost_reason: "processing_token_mismatch_or_status_changed"
      }
    });
    return { claimLost: true as const, data: null };
  }

  return { claimLost: false as const, data: result.data };
}

function nextRetryAt(attemptCount: number, now = new Date()) {
  const delayMinutes = Math.min(2 ** Math.max(attemptCount - 1, 0), MAX_RETRY_DELAY_MINUTES);
  const next = new Date(now);
  next.setUTCMinutes(next.getUTCMinutes() + delayMinutes);
  return next.toISOString();
}

function isPermanentDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /permanent|invalid recipient|suppressed|unsubscribed|hard bounce|blocked recipient/i.test(message);
}

function buildSafeOutboxMetadata(row: RenewalActionNotificationRow, extra?: Record<string, unknown>) {
  return {
    notification_id: row.id,
    delivery_key: row.delivery_key,
    attempt_count: row.attempt_count ?? 0,
    max_attempts: row.max_attempts ?? 4,
    ...extra
  };
}

function emitRenewalActionOutboxEvent(input: {
  eventName: string;
  row: RenewalActionNotificationRow;
  severity?: "P1" | "P2" | "P3";
  alert?: boolean;
  metadata?: Record<string, unknown>;
}) {
  void emitOperationalEvent({
    eventName: input.eventName,
    severity: input.severity ?? "P3",
    sensitivity: "customer_sensitive",
    alert: input.alert ?? false,
    organizationId: input.row.organization_id,
    action: "renewal_action_request_notification",
    metadata: buildSafeOutboxMetadata(input.row, input.metadata)
  });
}

async function markRetryOrTerminalFailure(input: {
  row: RenewalActionNotificationRow;
  requestId: string | null;
  error: unknown;
  failureCode: string;
  permanent?: boolean;
}) {
  const attemptCount = (input.row.attempt_count ?? 0) + 1;
  const maxAttempts = Math.max(input.row.max_attempts ?? 4, 1);
  const permanent = input.permanent ?? isPermanentDeliveryError(input.error);
  const terminal = permanent || attemptCount >= maxAttempts;
  const safeMessage = sanitizeRenewalActionNotificationError(input.error);
  const retryAt = terminal ? null : nextRetryAt(attemptCount);

  const markResult = await markNotification(input.row, {
    status: terminal ? "failed_terminal" : "retry_pending",
    errorMessage: safeMessage,
    attemptCount,
    nextRetryAt: retryAt,
    providerPayload: {
      request_id: input.requestId ?? undefined,
      failure_code: input.failureCode,
      failure_category: terminal ? "retry_exhausted_or_permanent_failure" : "transient_provider_failure",
      attempt_count: attemptCount,
      max_attempts: maxAttempts
    }
  });

  if (markResult.claimLost) {
    return {
      id: input.row.id,
      status: "claim_lost" as const,
      error: "Renewal action notification processing claim was lost before completion."
    };
  }

  emitRenewalActionOutboxEvent({
    eventName: terminal ? "renewal_action_notification_terminal_failed" : "renewal_action_notification_retry_scheduled",
    row: input.row,
    severity: terminal ? "P2" : "P3",
    alert: terminal,
    metadata: {
      failure_code: input.failureCode,
      failure_category: terminal ? "retry_exhausted_or_permanent_failure" : "transient_provider_failure",
      attempt_count: attemptCount,
      max_attempts: maxAttempts
    }
  });

  return {
    id: input.row.id,
    status: terminal ? ("failed_terminal" as const) : ("retry_pending" as const),
    error: safeMessage,
    attemptCount,
    nextRetryAt: retryAt
  };
}

export async function processRenewalActionRequestNotification(row: RenewalActionNotificationRow) {
  if (row.status === "sent" || row.provider_message_id) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_duplicate_suppressed",
      row,
      metadata: { duplicate_suppressed: true }
    });
    return { id: row.id, status: "duplicate_suppressed" as const };
  }

  if (row.status !== "processing" || !row.processing_token) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claim_lost",
      row,
      severity: "P2",
      metadata: {
        claim_lost_reason: row.processing_token ? "status_not_processing" : "missing_processing_token"
      }
    });
    return { id: row.id, status: "claim_lost" as const };
  }

  const requestId = getRenewalActionRequestIdFromPayload(row.provider_payload);
  if (!requestId) {
    const markResult = await markNotification(row, {
      status: "failed_terminal",
      errorMessage: "Renewal action notification is missing its request id.",
      providerPayload: { failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_REQUEST_MISSING_001" }
    });
    if (markResult.claimLost) return { id: row.id, status: "claim_lost" as const };
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_terminal_failed",
      row,
      severity: "P2",
      alert: true,
      metadata: { failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_REQUEST_MISSING_001" }
    });
    return { id: row.id, status: "failed_terminal" as const };
  }

  try {
    const { data: requestData, error: requestError } = await getAdminRenewalActionRequestById({
      requestId,
      organizationId: row.organization_id
    });
    if (requestError) throw requestError;
    const request = requestData as RenewalActionRequestRow | null;
    if (!request || request.request_status !== "pending") {
      const markResult = await markNotification(row, {
        status: "skipped",
        errorMessage: "Renewal action request is no longer pending.",
        providerPayload: {
          request_id: requestId,
          failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_NOT_PENDING_001"
        }
      });
      if (markResult.claimLost) return { id: row.id, status: "claim_lost" as const };
      emitRenewalActionOutboxEvent({
        eventName: "renewal_action_notification_skipped_not_pending",
        row,
        metadata: {
          request_id: requestId,
          failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_NOT_PENDING_001"
        }
      });
      return { id: row.id, status: "skipped" as const };
    }

    const [{ data: contractData, error: contractError }, { data: requesterData }] = await Promise.all([
      getAdminRenewalActionContractContext({
        contractId: request.contract_id,
        organizationId: row.organization_id
      }),
      getAdminNotificationUserLabel(request.requested_by_user_id)
    ]);
    if (contractError) throw contractError;

    const contract = contractData as unknown as ContractContextRow | null;
    const metadata = firstValue(contract?.contract_metadata);
    const email = await sendRenewalActionRequestEmail({
      organizationId: row.organization_id,
      recipientEmail: row.recipient_email,
      contractId: request.contract_id,
      contractTitle: metadata?.contract_title ?? "Untitled contract",
      counterpartyName: metadata?.counterparty_name ?? null,
      requestedActionLabel: request.requested_action.replaceAll("_", " "),
      noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
      renewalDate: metadata?.renewal_date ?? null,
      expirationDate: metadata?.expiration_date ?? null,
      dueAt: request.due_date ?? request.due_at,
      ownerLabel: row.recipient_email,
      contractValueAmount: metadata?.contract_value_amount ?? null,
      contractValueCurrency: metadata?.contract_value_currency ?? null,
      requesterLabel: safeUserLabel(requesterData as { full_name?: string | null; notification_email?: string | null } | null),
      message: request.message,
      deliveryKey: row.delivery_key ?? buildRenewalActionRequestNotificationDeliveryKey(request.id)
    });

    const markResult = await markNotification(row, {
      status: "sent",
      providerMessageId: email.data?.id ?? null,
      attemptCount: (row.attempt_count ?? 0) + 1,
      providerPayload: {
        request_id: request.id,
        contract_id: request.contract_id,
        delivery_key: row.delivery_key,
        outbox_scope: "internal_owner_action_request"
      }
    });
    if (markResult.claimLost) return { id: row.id, status: "claim_lost" as const };
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_sent",
      row,
      metadata: {
        request_id: request.id,
        contract_id: request.contract_id,
        delivery_state: "sent"
      }
    });
    return { id: row.id, status: "sent" as const };
  } catch (error) {
    return markRetryOrTerminalFailure({
      row,
      requestId,
      error,
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_DELIVERY_FAILED_001"
    });
  }
}

export async function rescueStaleRenewalActionRequestNotifications(now = new Date()) {
  const staleBefore = new Date(now);
  staleBefore.setUTCMinutes(staleBefore.getUTCMinutes() - STALE_CLAIM_MINUTES);
  const nextRetry = nextRetryAt(1, now);
  const { data, error } = await rescueAdminStaleRenewalActionNotifications({
    staleBeforeIso: staleBefore.toISOString(),
    nextRetryAt: nextRetry,
    limit: DEFAULT_OUTBOX_LIMIT
  });
  if (error) throw error;

  for (const row of (data ?? []) as RenewalActionNotificationRow[]) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_stale_rescued",
      row,
      severity: "P3",
      metadata: {
        rescue_state: "retry_pending"
      }
    });
  }

  return (data ?? []).map((row) => ({ id: (row as { id: string }).id, status: "retry_pending" as const }));
}

export async function processQueuedRenewalActionRequestNotifications(options?: { limit?: number; now?: Date }) {
  const now = options?.now ?? new Date();
  await rescueStaleRenewalActionRequestNotifications(now);
  const { data, error } = await listAdminQueuedRenewalActionNotifications({
    limit: options?.limit ?? DEFAULT_OUTBOX_LIMIT,
    nowIso: now.toISOString()
  });
  if (error) throw error;

  const results = [];
  for (const queued of (data ?? []) as RenewalActionNotificationRow[]) {
    const processingToken = randomUUID();
    const claimResult = await checkedPrivilegedWrite(
      claimAdminRenewalActionNotification({
        notificationId: queued.id,
        organizationId: queued.organization_id,
        processingToken,
        nowIso: now.toISOString()
      }),
      {
        operation: "update",
        table: "notification_logs",
        context: `claim_renewal_action_request_notification:${queued.id}`
      }
    );
    const claimed = claimResult.data as RenewalActionNotificationRow | null;
    if (!claimed) continue;
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claimed",
      row: claimed,
      metadata: {
        claim_state: "processing"
      }
    });
    results.push(await processRenewalActionRequestNotification(claimed));
  }

  return results;
}
