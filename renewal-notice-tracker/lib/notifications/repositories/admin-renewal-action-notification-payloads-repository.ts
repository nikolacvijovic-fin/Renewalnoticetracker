import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type AdminRenewalActionNotificationPayloadRow = {
  id: string;
  organization_id: string;
  notification_log_id: string;
  request_id: string;
  contract_id: string;
  delivery_key: string;
  template_version: string;
  delivery_payload: Json;
  payload_fingerprint: string | null;
  created_at: string;
  expires_at: string;
};

function adminClient() {
  return createAdminSupabaseClient();
}

const PAYLOAD_SELECT =
  "id, organization_id, notification_log_id, request_id, contract_id, delivery_key, template_version, delivery_payload, payload_fingerprint, created_at, expires_at";

export function getAdminRenewalActionNotificationPayload(input: {
  notificationId: string;
  organizationId: string;
}) {
  return adminClient()
    .from("renewal_action_notification_payloads")
    .select(PAYLOAD_SELECT)
    .eq("notification_log_id", input.notificationId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
}

export function createAdminRenewalActionNotificationPayload(input: {
  organizationId: string;
  notificationId: string;
  requestId: string;
  contractId: string;
  deliveryKey: string;
  templateVersion: string;
  deliveryPayload: Json;
  payloadFingerprint: string;
  expiresAt: string;
}) {
  return adminClient()
    .from("renewal_action_notification_payloads")
    .upsert(
      {
        organization_id: input.organizationId,
        notification_log_id: input.notificationId,
        request_id: input.requestId,
        contract_id: input.contractId,
        delivery_key: input.deliveryKey,
        template_version: input.templateVersion,
        delivery_payload: input.deliveryPayload,
        payload_fingerprint: input.payloadFingerprint,
        expires_at: input.expiresAt
      },
      {
        onConflict: "notification_log_id",
        ignoreDuplicates: true
      }
    )
    .select(PAYLOAD_SELECT)
    .maybeSingle();
}

export function deleteAdminRenewalActionNotificationPayload(input: {
  payloadId: string;
  organizationId: string;
}) {
  return adminClient()
    .from("renewal_action_notification_payloads")
    .delete()
    .eq("id", input.payloadId)
    .eq("organization_id", input.organizationId)
    .select("id")
    .maybeSingle();
}

export function listAdminExpiredRenewalActionNotificationPayloads(input: {
  nowIso: string;
  limit: number;
}) {
  return adminClient()
    .from("renewal_action_notification_payloads")
    .select(
      `${PAYLOAD_SELECT}, notification_logs!inner(id, organization_id, notification_kind, status)`
    )
    .lte("expires_at", input.nowIso)
    .eq("notification_logs.notification_kind", "renewal_action_request")
    .in("notification_logs.status", ["sent", "failed_terminal", "skipped"])
    .order("expires_at", { ascending: true })
    .limit(Math.min(Math.max(input.limit, 1), 100));
}
