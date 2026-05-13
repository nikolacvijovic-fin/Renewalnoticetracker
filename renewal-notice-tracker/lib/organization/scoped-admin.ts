import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function getScopedReminderById(reminderId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
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
      ),
      organizations (
        slack_webhook_url,
        slack_channel,
        slack_fallback_channel,
        teams_webhook_url,
        teams_fallback_channel
      )
    `
    )
    .eq("id", reminderId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

export async function getScopedNotificationLogById(notificationLogId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("notification_logs")
    .select("id, reminder_id, organization_id, channel, status, recipient_email")
    .eq("id", notificationLogId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateScopedReminderById(
  reminderId: string,
  organizationId: string,
  values: Record<string, unknown>
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("reminders")
    .update(values)
    .eq("id", reminderId)
    .eq("organization_id", organizationId)
    .select("id, organization_id, status")
    .single();

  if (error) throw error;
  return data;
}

