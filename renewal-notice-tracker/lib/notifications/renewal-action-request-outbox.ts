import { sendRenewalActionRequestEmail } from "@/lib/email/send-reminder";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";
import type { Json } from "@/lib/supabase/database.types";
import {
  claimAdminRenewalActionNotification,
  getAdminNotificationUserLabel,
  getAdminRenewalActionContractContext,
  getAdminRenewalActionRequestById,
  listAdminQueuedRenewalActionNotifications,
  updateAdminRenewalActionNotification
} from "@/lib/notifications/repositories/admin-renewal-action-notifications-repository";

const MAX_ERROR_LENGTH = 180;

type RenewalActionNotificationRow = {
  id: string;
  organization_id: string;
  recipient_email: string;
  delivery_key: string | null;
  provider_payload: Json;
  status: string;
};

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
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
    providerPayload?: Record<string, Json | undefined>;
  }
) {
  return checkedPrivilegedWrite(
    updateAdminRenewalActionNotification({
      notificationId: row.id,
      organizationId: row.organization_id,
      update: {
        status: update.status,
        provider_message_id: update.providerMessageId ?? null,
        error_message: update.errorMessage ?? null,
        provider_payload: (update.providerPayload ?? {}) as Json
      }
    }),
    {
      operation: "update",
      table: "notification_logs",
      context: `renewal_action_request_notification:${row.id}:${update.status}`
    }
  );
}

export async function processRenewalActionRequestNotification(row: RenewalActionNotificationRow) {
  const requestId = getRenewalActionRequestIdFromPayload(row.provider_payload);
  if (!requestId) {
    await markNotification(row, {
      status: "failed",
      errorMessage: "Renewal action notification is missing its request id.",
      providerPayload: { failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_REQUEST_MISSING_001" }
    });
    return { id: row.id, status: "failed" as const };
  }

  try {
    const { data: requestData, error: requestError } = await getAdminRenewalActionRequestById({
      requestId,
      organizationId: row.organization_id
    });
    if (requestError) throw requestError;
    const request = requestData as RenewalActionRequestRow | null;
    if (!request || request.request_status !== "pending") {
      await markNotification(row, {
        status: "failed",
        errorMessage: "Renewal action request is no longer pending.",
        providerPayload: {
          request_id: requestId,
          failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_NOT_PENDING_001"
        }
      });
      return { id: row.id, status: "failed" as const };
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
      message: request.message
    });

    await markNotification(row, {
      status: "sent",
      providerMessageId: email.data?.id ?? null,
      providerPayload: {
        request_id: request.id,
        contract_id: request.contract_id,
        delivery_key: row.delivery_key,
        outbox_scope: "internal_owner_action_request"
      }
    });
    return { id: row.id, status: "sent" as const };
  } catch (error) {
    const safeMessage = sanitizeRenewalActionNotificationError(error);
    await markNotification(row, {
      status: "failed",
      errorMessage: safeMessage,
      providerPayload: {
        request_id: requestId,
        failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_DELIVERY_FAILED_001"
      }
    });
    return { id: row.id, status: "failed" as const, error: safeMessage };
  }
}

export async function processQueuedRenewalActionRequestNotifications(options?: { limit?: number }) {
  const { data, error } = await listAdminQueuedRenewalActionNotifications({
    limit: options?.limit ?? 25
  });
  if (error) throw error;

  const results = [];
  for (const queued of (data ?? []) as RenewalActionNotificationRow[]) {
    const claimResult = await checkedPrivilegedWrite(
      claimAdminRenewalActionNotification({
        notificationId: queued.id,
        organizationId: queued.organization_id
      }),
      {
        operation: "update",
        table: "notification_logs",
        context: `claim_renewal_action_request_notification:${queued.id}`
      }
    );
    const claimed = claimResult.data as RenewalActionNotificationRow | null;
    if (!claimed) continue;
    results.push(await processRenewalActionRequestNotification(claimed));
  }

  return results;
}
