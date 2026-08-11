import { createHash, randomUUID } from "node:crypto";
import {
  buildRenewalActionRequestEmailProviderRequest,
  sendRenewalActionRequestEmailProviderRequest,
  type RenewalActionRequestEmailProviderRequest
} from "@/lib/email/send-reminder";
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
import {
  createAdminRenewalActionNotificationPayload,
  deleteAdminRenewalActionNotificationPayload,
  getAdminRenewalActionNotificationPayload,
  listAdminExpiredRenewalActionNotificationPayloads,
  type AdminRenewalActionNotificationPayloadRow
} from "@/lib/notifications/repositories/admin-renewal-action-notification-payloads-repository";

const MAX_ERROR_LENGTH = 180;
const DEFAULT_OUTBOX_LIMIT = 25;
const STALE_CLAIM_MINUTES = 10;
const MAX_RETRY_DELAY_MINUTES = 60;
const EMAIL_PAYLOAD_TEMPLATE_VERSION = "renewal_action_request_email.v2";
const LEGACY_EMAIL_PAYLOAD_TEMPLATE_VERSION = "renewal_action_request_email.v1_protected";
const EMAIL_PAYLOAD_RETENTION_HOURS = 48;

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

type ContractMetadataRow = {
  contract_title: string | null;
  counterparty_name: string | null;
  notice_deadline_date: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  contract_value_amount: number | null;
  contract_value_currency: string | null;
};

type RenewalActionEmailSnapshot = {
  version: "renewal_action_request_email.v1";
  providerRequest: RenewalActionRequestEmailProviderRequest;
  requestId: string;
  contractId: string;
  requestedAction: string;
};

type StructuredRenewalActionDeliveryPayload = {
  kind: "structured_renewal_action_request";
  recipientEmail: string;
  from: string;
  replyTo?: string | null;
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
};

type LegacyProviderRequestDeliveryPayload = {
  kind: "legacy_provider_request";
  providerRequest: RenewalActionRequestEmailProviderRequest;
};

type RenewalActionDeliveryPayload =
  | StructuredRenewalActionDeliveryPayload
  | LegacyProviderRequestDeliveryPayload;

type DeliveryErrorClassification = {
  failureCode: string;
  failureCategory: string;
  permanent: boolean;
  retryable: boolean;
  alert: boolean;
};

type ContractContextRow = {
  id: string;
  owner_user_id: string | null;
  contract_metadata: ContractMetadataRow | ContractMetadataRow[] | null;
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

function sanitizeEmailSnapshotText(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? fallback).replace(/\s+/g, " ").trim() || fallback;
  return normalized
    .replace(/raw contract text[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/ocr output[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/extracted clauses?[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/private notes?[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/provider payload[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/provider response[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/secret[^,.;\n<]*/gi, "[REDACTED]")
    .replace(/token[^,.;\n<]*/gi, "[REDACTED]")
    .slice(0, 500);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprintPayload(payload: RenewalActionDeliveryPayload) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function payloadExpiresAt(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setUTCHours(expiresAt.getUTCHours() + EMAIL_PAYLOAD_RETENTION_HOURS);
  return expiresAt.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getProviderPayloadRecord(payload: Json): Record<string, Json | undefined> {
  return isRecord(payload) ? (payload as Record<string, Json | undefined>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readProviderRequest(value: unknown): RenewalActionRequestEmailProviderRequest | null {
  if (!isRecord(value)) return null;
  const from = readString(value.from);
  const to = readString(value.to);
  const subject = readString(value.subject);
  const html = readString(value.html);
  const replyTo = readString(value.replyTo);
  if (!from || !to || !subject || !html) return null;
  return {
    from,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html
  };
}

function getEmailSnapshotFromPayload(payload: Json): RenewalActionEmailSnapshot | null {
  const record = getProviderPayloadRecord(payload);
  const snapshot = record.email_delivery_snapshot;
  if (!isRecord(snapshot) || snapshot.version !== "renewal_action_request_email.v1") return null;
  const providerRequest = readProviderRequest(snapshot.providerRequest);
  const requestId = readString(snapshot.requestId);
  const contractId = readString(snapshot.contractId);
  const requestedAction = readString(snapshot.requestedAction);
  if (!providerRequest || !requestId || !contractId || !requestedAction) return null;
  return {
    version: "renewal_action_request_email.v1",
    providerRequest,
    requestId,
    contractId,
    requestedAction
  };
}

function buildSafeProviderPayload(input: {
  row: RenewalActionNotificationRow;
  requestId: string | null;
  contractId?: string | null;
  requestedAction?: string | null;
  payload?: AdminRenewalActionNotificationPayloadRow | null;
  extra?: Record<string, Json | undefined>;
}) {
  return {
    request_id: input.requestId ?? undefined,
    contract_id: input.contractId ?? undefined,
    requested_action: input.requestedAction ?? undefined,
    outbox_scope: "internal_owner_action_request",
    delivery_payload_ref: input.payload?.id,
    payload_template_version: input.payload?.template_version,
    payload_fingerprint: input.payload?.payload_fingerprint ?? undefined,
    ...input.extra
  } as Record<string, Json | undefined>;
}

function buildStructuredDeliveryPayload(input: {
  row: RenewalActionNotificationRow;
  request: RenewalActionRequestRow;
  metadata: ContractMetadataRow | null;
  requester: { full_name?: string | null; notification_email?: string | null } | null;
  recipient: { full_name?: string | null; notification_email?: string | null } | null;
}): StructuredRenewalActionDeliveryPayload {
  const recipientEmail = input.recipient?.notification_email ?? input.row.recipient_email;
  const providerRequest = buildRenewalActionRequestEmailProviderRequest({
    organizationId: input.row.organization_id,
    recipientEmail,
    contractId: input.request.contract_id,
    contractTitle: sanitizeEmailSnapshotText(input.metadata?.contract_title, "Untitled contract"),
    counterpartyName: input.metadata?.counterparty_name
      ? sanitizeEmailSnapshotText(input.metadata.counterparty_name, "Not set")
      : null,
    requestedActionLabel: sanitizeEmailSnapshotText(input.request.requested_action.replaceAll("_", " "), "renewal action"),
    noticeDeadlineDate: input.metadata?.notice_deadline_date ?? null,
    renewalDate: input.metadata?.renewal_date ?? null,
    expirationDate: input.metadata?.expiration_date ?? null,
    dueAt: input.request.due_date ?? input.request.due_at,
    ownerLabel: "Assigned owner",
    contractValueAmount: input.metadata?.contract_value_amount ?? null,
    contractValueCurrency: input.metadata?.contract_value_currency ?? null,
    requesterLabel: sanitizeEmailSnapshotText(safeUserLabel(input.requester), "NoticeControl operator"),
    message: null
  });

  return {
    kind: "structured_renewal_action_request",
    recipientEmail,
    from: String(providerRequest.from),
    replyTo: typeof providerRequest.replyTo === "string" ? providerRequest.replyTo : null,
    organizationId: input.row.organization_id,
    contractId: input.request.contract_id,
    contractTitle: sanitizeEmailSnapshotText(input.metadata?.contract_title, "Untitled contract"),
    counterpartyName: input.metadata?.counterparty_name
      ? sanitizeEmailSnapshotText(input.metadata.counterparty_name, "Not set")
      : null,
    requestedActionLabel: sanitizeEmailSnapshotText(input.request.requested_action.replaceAll("_", " "), "renewal action"),
    noticeDeadlineDate: input.metadata?.notice_deadline_date ?? null,
    renewalDate: input.metadata?.renewal_date ?? null,
    expirationDate: input.metadata?.expiration_date ?? null,
    dueAt: input.request.due_date ?? input.request.due_at,
    ownerLabel: "Assigned owner",
    contractValueAmount: input.metadata?.contract_value_amount ?? null,
    contractValueCurrency: input.metadata?.contract_value_currency ?? null,
    requesterLabel: sanitizeEmailSnapshotText(safeUserLabel(input.requester), "NoticeControl operator")
  };
}

function readDeliveryPayload(value: Json): RenewalActionDeliveryPayload | null {
  if (!isRecord(value)) return null;
  if (value.kind === "legacy_provider_request") {
    const providerRequest = readProviderRequest(value.providerRequest);
    return providerRequest ? { kind: "legacy_provider_request", providerRequest } : null;
  }
  if (value.kind !== "structured_renewal_action_request") return null;
  const recipientEmail = readString(value.recipientEmail);
  const from = readString(value.from);
  const organizationId = readString(value.organizationId);
  const contractId = readString(value.contractId);
  const contractTitle = readString(value.contractTitle);
  const requestedActionLabel = readString(value.requestedActionLabel);
  if (!recipientEmail || !from || !organizationId || !contractId || !contractTitle || !requestedActionLabel) return null;
  return {
    kind: "structured_renewal_action_request",
    recipientEmail,
    from,
    replyTo: readString(value.replyTo),
    organizationId,
    contractId,
    contractTitle,
    counterpartyName: readString(value.counterpartyName),
    requestedActionLabel,
    noticeDeadlineDate: readString(value.noticeDeadlineDate),
    renewalDate: readString(value.renewalDate),
    expirationDate: readString(value.expirationDate),
    dueAt: readString(value.dueAt),
    ownerLabel: readString(value.ownerLabel),
    contractValueAmount: typeof value.contractValueAmount === "number" ? value.contractValueAmount : null,
    contractValueCurrency: readString(value.contractValueCurrency),
    requesterLabel: readString(value.requesterLabel)
  };
}

function renderProviderRequestFromDeliveryPayload(payload: RenewalActionDeliveryPayload) {
  if (payload.kind === "legacy_provider_request") return payload.providerRequest;
  const rendered = buildRenewalActionRequestEmailProviderRequest({
    organizationId: payload.organizationId,
    recipientEmail: payload.recipientEmail,
    contractId: payload.contractId,
    contractTitle: payload.contractTitle,
    counterpartyName: payload.counterpartyName,
    requestedActionLabel: payload.requestedActionLabel,
    noticeDeadlineDate: payload.noticeDeadlineDate,
    renewalDate: payload.renewalDate,
    expirationDate: payload.expirationDate,
    dueAt: payload.dueAt,
    ownerLabel: payload.ownerLabel,
    contractValueAmount: payload.contractValueAmount,
    contractValueCurrency: payload.contractValueCurrency,
    requesterLabel: payload.requesterLabel,
    message: null
  });
  return {
    ...rendered,
    from: payload.from,
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {})
  };
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

function buildSafeOutboxMetadata(row: RenewalActionNotificationRow, extra?: Record<string, unknown>) {
  return {
    notification_id: row.id,
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

async function markProtectedPayloadReference(input: {
  row: RenewalActionNotificationRow;
  request: RenewalActionRequestRow;
  payload: AdminRenewalActionNotificationPayloadRow;
}) {
  return checkedPrivilegedWrite(
    updateAdminRenewalActionNotification({
      notificationId: input.row.id,
      organizationId: input.row.organization_id,
      processingToken: input.row.processing_token ?? "",
      update: {
        status: "processing",
        recipient_email: "protected-recipient@noticecontrol.internal",
        destination: null,
        provider_payload: buildSafeProviderPayload({
          row: input.row,
          requestId: input.request.id,
          contractId: input.request.contract_id,
          requestedAction: input.request.requested_action,
          payload: input.payload
        }) as Json
      }
    }),
    {
      operation: "update",
      table: "notification_logs",
      context: `renewal_action_request_notification:${input.row.id}:payload_reference`
    }
  );
}

async function ensureProtectedDeliveryPayload(
  row: RenewalActionNotificationRow,
  request: RenewalActionRequestRow
) {
  if (!row.processing_token) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claim_lost",
      row,
      severity: "P2",
      metadata: {
        claim_lost_reason: "missing_processing_token_before_snapshot"
      }
    });
    return { claimLost: true as const };
  }

  const existing = await getAdminRenewalActionNotificationPayload({
    notificationId: row.id,
    organizationId: row.organization_id
  });
  if (existing.error) throw existing.error;
  if (existing.data) {
    const payload = existing.data as AdminRenewalActionNotificationPayloadRow;
    const referenceResult = await markProtectedPayloadReference({ row, request, payload });
    if (!referenceResult.data) {
      emitRenewalActionOutboxEvent({
        eventName: "renewal_action_notification_claim_lost",
        row,
        severity: "P2",
        metadata: {
          claim_lost_reason: "processing_token_mismatch_before_payload_reference"
        }
      });
      return { claimLost: true as const };
    }
    return { claimLost: false as const, payload };
  }

  const legacySnapshot = getEmailSnapshotFromPayload(row.provider_payload);
  let deliveryPayload: RenewalActionDeliveryPayload;
  if (legacySnapshot) {
    deliveryPayload = {
      kind: "legacy_provider_request",
      providerRequest: legacySnapshot.providerRequest
    };
  } else {
    const [
      { data: contractData, error: contractError },
      { data: requesterData },
      { data: recipientData }
    ] = await Promise.all([
      getAdminRenewalActionContractContext({
        contractId: request.contract_id,
        organizationId: row.organization_id
      }),
      getAdminNotificationUserLabel(request.requested_by_user_id),
      getAdminNotificationUserLabel(request.requested_to_user_id)
    ]);
    if (contractError) throw contractError;

    const contract = contractData as unknown as ContractContextRow | null;
    const metadata = firstValue(contract?.contract_metadata);
    deliveryPayload = buildStructuredDeliveryPayload({
      row,
      request,
      metadata,
      requester: requesterData as { full_name?: string | null; notification_email?: string | null } | null,
      recipient: recipientData as { full_name?: string | null; notification_email?: string | null } | null
    });
  }

  const deliveryKey = row.delivery_key ?? buildRenewalActionRequestNotificationDeliveryKey(request.id);
  const created = await checkedPrivilegedWrite(
    createAdminRenewalActionNotificationPayload({
      organizationId: row.organization_id,
      notificationId: row.id,
      requestId: request.id,
      contractId: request.contract_id,
      deliveryKey,
      templateVersion: deliveryPayload.kind === "legacy_provider_request" ? LEGACY_EMAIL_PAYLOAD_TEMPLATE_VERSION : EMAIL_PAYLOAD_TEMPLATE_VERSION,
      deliveryPayload: deliveryPayload as unknown as Json,
      payloadFingerprint: fingerprintPayload(deliveryPayload),
      expiresAt: payloadExpiresAt()
    }),
    {
      operation: "insert",
      table: "renewal_action_notification_payloads",
      context: `renewal_action_request_notification:${row.id}:payload`
    }
  );

  let payload = created.data as AdminRenewalActionNotificationPayloadRow | null;
  if (!payload) {
    const reread = await getAdminRenewalActionNotificationPayload({
      notificationId: row.id,
      organizationId: row.organization_id
    });
    if (reread.error) throw reread.error;
    payload = reread.data as AdminRenewalActionNotificationPayloadRow | null;
  }

  if (!payload) {
    throw new Error("Protected renewal-action delivery payload could not be created or found.");
  }

  const referenceResult = await markProtectedPayloadReference({ row, request, payload });
  if (!referenceResult.data) {
    emitRenewalActionOutboxEvent({
      eventName: "renewal_action_notification_claim_lost",
      row,
      severity: "P2",
      metadata: {
        claim_lost_reason: "processing_token_mismatch_before_snapshot"
      }
    });
    return { claimLost: true as const };
  }

  return { claimLost: false as const, payload };
}

function getErrorName(error: unknown) {
  if (isRecord(error)) {
    const name = readString(error.name) ?? readString(error.code);
    if (name) return name;
    if (isRecord(error.error)) {
      return readString(error.error.name) ?? readString(error.error.code);
    }
  }
  return null;
}

function getErrorStatus(error: unknown) {
  if (!isRecord(error)) return null;
  const status = error.statusCode ?? error.status ?? error.responseStatus;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export function classifyRenewalActionNotificationDeliveryError(error: unknown): DeliveryErrorClassification {
  const name = getErrorName(error);
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : isRecord(error) ? readString(error.message) ?? "" : String(error ?? "");

  if (name === "invalid_idempotency_key") {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_INVALID_IDEMPOTENCY_KEY_001",
      failureCategory: "provider_idempotency_configuration_failure",
      permanent: true,
      retryable: false,
      alert: true
    };
  }

  if (name === "invalid_idempotent_request") {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_IDEMPOTENCY_PAYLOAD_MISMATCH_001",
      failureCategory: "provider_idempotency_payload_mismatch",
      permanent: true,
      retryable: false,
      alert: true
    };
  }

  if (name === "concurrent_idempotent_requests") {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_CONCURRENT_IDEMPOTENT_REQUEST_001",
      failureCategory: "provider_idempotency_concurrent_request",
      permanent: false,
      retryable: true,
      alert: false
    };
  }

  if (status === 429 || /rate.?limit/i.test(name ?? "") || /rate.?limit/i.test(message)) {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_RATE_LIMITED_001",
      failureCategory: "provider_rate_limited",
      permanent: false,
      retryable: true,
      alert: false
    };
  }

  if (
    /invalid.*recipient|suppressed|unsubscribed|hard bounce|blocked recipient|recipient.*invalid/i.test(
      `${name ?? ""} ${message}`
    )
  ) {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_PERMANENT_RECIPIENT_FAILURE_001",
      failureCategory: "permanent_recipient_failure",
      permanent: true,
      retryable: false,
      alert: true
    };
  }

  if (status !== null && status >= 500) {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_PROVIDER_5XX_001",
      failureCategory: "upstream_provider_failed",
      permanent: false,
      retryable: true,
      alert: false
    };
  }

  if (/timeout|network|fetch|ECONNRESET|ETIMEDOUT|temporar/i.test(message) || name === "application_error") {
    return {
      failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_TRANSIENT_PROVIDER_FAILURE_001",
      failureCategory: /timeout/i.test(message) ? "timeout" : "transient_provider_failure",
      permanent: false,
      retryable: true,
      alert: false
    };
  }

  return {
    failureCode: "ERR_RENEWAL_ACTION_NOTIFICATION_DELIVERY_FAILED_001",
    failureCategory: "unknown_provider_failure",
    permanent: false,
    retryable: true,
    alert: false
  };
}

async function markRetryOrTerminalFailure(input: {
  row: RenewalActionNotificationRow;
  requestId: string | null;
  payload?: AdminRenewalActionNotificationPayloadRow | null;
  error: unknown;
}) {
  const attemptCount = (input.row.attempt_count ?? 0) + 1;
  const maxAttempts = Math.max(input.row.max_attempts ?? 4, 1);
  const classification = classifyRenewalActionNotificationDeliveryError(input.error);
  const terminal = classification.permanent || attemptCount >= maxAttempts;
  const safeMessage = sanitizeRenewalActionNotificationError(input.error);
  const retryAt = terminal ? null : nextRetryAt(attemptCount);

  const markResult = await markNotification(input.row, {
    status: terminal ? "failed_terminal" : "retry_pending",
    errorMessage: safeMessage,
    attemptCount,
    nextRetryAt: retryAt,
    providerPayload: buildSafeProviderPayload({
      row: input.row,
      requestId: input.requestId,
      payload: input.payload ?? null,
      extra: {
        failure_code: classification.failureCode,
        failure_category: terminal && !classification.permanent ? "retry_exhausted" : classification.failureCategory,
        attempt_count: attemptCount,
        max_attempts: maxAttempts
      }
    })
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
    severity: classification.alert ? "P1" : terminal ? "P2" : "P3",
    alert: classification.alert || terminal,
    metadata: {
      failure_code: classification.failureCode,
      failure_category: terminal && !classification.permanent ? "retry_exhausted" : classification.failureCategory,
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
      providerPayload: buildSafeProviderPayload({
        row,
        requestId: null,
        extra: { failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_REQUEST_MISSING_001" }
      })
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

  let activeProtectedPayload: AdminRenewalActionNotificationPayloadRow | null = null;

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
        providerPayload: buildSafeProviderPayload({
          row,
          requestId,
          extra: {
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_NOT_PENDING_001"
          }
        })
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

    const payloadResult = await ensureProtectedDeliveryPayload(row, request);
    if (payloadResult.claimLost) return { id: row.id, status: "claim_lost" as const };
    const protectedPayload = payloadResult.payload;
    activeProtectedPayload = protectedPayload;
    const deliveryPayload = readDeliveryPayload(protectedPayload.delivery_payload);
    if (!deliveryPayload) {
      throw new Error("Protected renewal-action delivery payload is invalid.");
    }

    const deliveryKey = row.delivery_key ?? buildRenewalActionRequestNotificationDeliveryKey(request.id);
    const email = await sendRenewalActionRequestEmailProviderRequest({
      providerRequest: renderProviderRequestFromDeliveryPayload(deliveryPayload),
      deliveryKey
    });
    if (email.error) throw email.error;

    const markResult = await markNotification(row, {
      status: "sent",
      providerMessageId: email.data?.id ?? null,
      attemptCount: (row.attempt_count ?? 0) + 1,
      providerPayload: buildSafeProviderPayload({
        row,
        requestId: request.id,
        contractId: request.contract_id,
        requestedAction: request.requested_action,
        payload: protectedPayload
      })
    });
    if (markResult.claimLost) return { id: row.id, status: "claim_lost" as const };
    try {
      await checkedPrivilegedWrite(
        deleteAdminRenewalActionNotificationPayload({
          payloadId: protectedPayload.id,
          organizationId: row.organization_id
        }),
        {
          operation: "delete",
          table: "renewal_action_notification_payloads",
          context: `renewal_action_request_notification:${row.id}:payload_purge_after_sent`
        }
      );
    } catch {
      emitRenewalActionOutboxEvent({
        eventName: "renewal_action_notification_payload_purge_failed",
        row,
        severity: "P3",
        metadata: {
          delivery_payload_ref: protectedPayload.id,
          purge_state: "deferred_cleanup_required"
        }
      });
    }
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
      payload: activeProtectedPayload,
      error
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

export async function cleanupExpiredRenewalActionNotificationPayloads(options?: {
  limit?: number;
  now?: Date;
}) {
  const now = options?.now ?? new Date();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_OUTBOX_LIMIT, 1), 100);
  const { data, error } = await listAdminExpiredRenewalActionNotificationPayloads({
    nowIso: now.toISOString(),
    limit
  });
  if (error) throw error;

  let deletedCount = 0;
  for (const payload of (data ?? []) as AdminRenewalActionNotificationPayloadRow[]) {
    const result = await checkedPrivilegedWrite(
      deleteAdminRenewalActionNotificationPayload({
        payloadId: payload.id,
        organizationId: payload.organization_id
      }),
      {
        operation: "delete",
        table: "renewal_action_notification_payloads",
        context: `renewal_action_request_notification_payload:${payload.id}:retention_cleanup`
      }
    );
    if (result.data) deletedCount += 1;
  }

  void emitOperationalEvent({
    eventName: "renewal_action_notification_payload_cleanup_completed",
    severity: "P3",
    sensitivity: "internal",
    alert: false,
    action: "renewal_action_request_notification_payload_cleanup",
    metadata: {
      scanned_count: (data ?? []).length,
      deleted_count: deletedCount,
      limit,
      cleanup_state: "completed"
    }
  });

  return {
    scannedCount: (data ?? []).length,
    deletedCount
  };
}
