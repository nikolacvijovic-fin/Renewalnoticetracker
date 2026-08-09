import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type NotificationUpdate = {
  status: string;
  provider_message_id?: string | null;
  error_message?: string | null;
  provider_payload?: Json;
};

function adminClient() {
  return createAdminSupabaseClient();
}

export function listAdminQueuedRenewalActionNotifications(input: { limit: number }) {
  return adminClient()
    .from("notification_logs")
    .select("id, organization_id, recipient_email, delivery_key, provider_payload, status")
    .eq("notification_kind", "renewal_action_request")
    .in("status", ["queued", "failed"])
    .order("sent_at", { ascending: true })
    .limit(Math.min(Math.max(input.limit, 1), 50));
}

export function claimAdminRenewalActionNotification(input: {
  notificationId: string;
  organizationId: string;
}) {
  return adminClient()
    .from("notification_logs")
    .update({ status: "processing" })
    .eq("id", input.notificationId)
    .eq("organization_id", input.organizationId)
    .eq("notification_kind", "renewal_action_request")
    .in("status", ["queued", "failed"])
    .select("id, organization_id, recipient_email, delivery_key, provider_payload, status")
    .maybeSingle();
}

export function updateAdminRenewalActionNotification(input: {
  notificationId: string;
  organizationId: string;
  update: NotificationUpdate;
}) {
  return adminClient()
    .from("notification_logs")
    .update(input.update)
    .eq("id", input.notificationId)
    .eq("organization_id", input.organizationId)
    .eq("notification_kind", "renewal_action_request")
    .select("id, organization_id, status, delivery_key, provider_message_id, error_message")
    .single();
}

export function getAdminRenewalActionRequestById(input: {
  requestId: string;
  organizationId: string;
}) {
  return adminClient()
    .from("renewal_action_requests")
    .select(
      "id, contract_id, organization_id, requested_to_user_id, requested_action, request_status, due_date, due_at, message, requested_by_user_id"
    )
    .eq("id", input.requestId)
    .eq("organization_id", input.organizationId)
    .single();
}

export function getAdminRenewalActionContractContext(input: {
  contractId: string;
  organizationId: string;
}) {
  return adminClient()
    .from("contracts")
    .select(
      `
      id,
      organization_id,
      owner_user_id,
      contract_metadata (
        contract_title,
        counterparty_name,
        notice_deadline_date,
        renewal_date,
        expiration_date,
        contract_value_amount,
        contract_value_currency
      )
    `
    )
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .single();
}

export function getAdminNotificationUserLabel(userId: string | null | undefined) {
  if (!userId) return Promise.resolve({ data: null, error: null });
  return adminClient()
    .from("users")
    .select("id, full_name, notification_email")
    .eq("id", userId)
    .maybeSingle();
}
