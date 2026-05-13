import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type DeletionRequestRecord = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  status: string;
  evidence_json?: Record<string, unknown> | null;
};

export async function executeWorkspaceDeletionRequest(requestId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("deletion_requests")
    .select("id, organization_id, actor_user_id, status, evidence_json")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Deletion request not found.");
  }

  const request = data as DeletionRequestRecord;
  if (request.status === "completed") {
    return {
      organizationId: request.organization_id,
      status: "already_completed" as const
    };
  }

  if (!["requested", "scheduled", "executing"].includes(request.status)) {
    throw new Error("Deletion request is not executable.");
  }

  await admin
    .from("deletion_requests")
    .update({ status: "executing" })
    .eq("id", requestId);

  const [{ data: memberships }, { data: contracts }] = await Promise.all([
    admin.from("memberships").select("user_id").eq("organization_id", request.organization_id),
    admin.from("contracts").select("id").eq("organization_id", request.organization_id)
  ]);

  const contractIds = (contracts ?? []).map((row) => row.id as string);
  const userIds = (memberships ?? []).map((row) => row.user_id as string);

  let metadataIds: string[] = [];
  if (contractIds.length > 0) {
    const { data: metadata } = await admin
      .from("contract_metadata")
      .select("id")
      .in("contract_id", contractIds);
    metadataIds = (metadata ?? []).map((row) => row.id as string);
  }

  if (metadataIds.length > 0) {
    await admin
      .from("extracted_field_evidence")
      .delete()
      .in("contract_metadata_id", metadataIds);
  }

  if (contractIds.length > 0) {
    await admin.from("playbook_runs").delete().in("contract_id", contractIds);
    await admin.from("renewal_decisions").delete().in("contract_id", contractIds);
    await admin.from("notes").delete().in("contract_id", contractIds);
    await admin.from("processing_errors").delete().in("contract_id", contractIds);
    await admin.from("contract_files").delete().in("contract_id", contractIds);
    await admin.from("contract_metadata").delete().in("contract_id", contractIds);
  }

  await admin.from("notification_logs").delete().eq("organization_id", request.organization_id);
  await admin.from("reminder_runs").delete().eq("organization_id", request.organization_id);
  await admin.from("reminders").delete().eq("organization_id", request.organization_id);
  await admin.from("ocr_jobs").delete().eq("organization_id", request.organization_id);
  await admin.from("exports").delete().eq("organization_id", request.organization_id);
  await admin.from("import_jobs").delete().eq("organization_id", request.organization_id);
  await admin.from("counterparties").delete().eq("organization_id", request.organization_id);
  await admin.from("contract_templates").delete().eq("organization_id", request.organization_id);
  await admin.from("playbooks").delete().eq("organization_id", request.organization_id);
  await admin.from("support_time_logs").delete().eq("organization_id", request.organization_id);
  await admin.from("onboarding_time_logs").delete().eq("organization_id", request.organization_id);
  await admin.from("cost_usage_logs").delete().eq("organization_id", request.organization_id);
  await admin
    .from("organization_profitability_snapshots")
    .delete()
    .eq("organization_id", request.organization_id);
  await admin.from("metric_alerts").delete().eq("organization_id", request.organization_id);
  await admin.from("readiness_snapshots").delete().eq("organization_id", request.organization_id);
  await admin.from("capacity_snapshots").delete().eq("organization_id", request.organization_id);
  await admin.from("data_export_requests").delete().eq("organization_id", request.organization_id);

  if (contractIds.length > 0) {
    await admin.from("contracts").delete().in("id", contractIds);
  }

  for (const userId of userIds) {
    await admin
      .from("users")
      .update({ default_organization_id: null })
      .eq("id", userId)
      .eq("default_organization_id", request.organization_id);
  }

  await admin.from("memberships").delete().eq("organization_id", request.organization_id);

  await admin
    .from("organizations")
    .update({
      name: `Deleted workspace ${request.organization_id.slice(0, 8)}`,
      slug: `deleted-${request.organization_id.slice(0, 8)}`,
      billing_email: null,
      billing_provider: null,
      billing_customer_id: null,
      billing_subscription_id: null,
      billing_plan_code: null,
      billing_price_id: null,
      billing_subscription_status: "cancelled",
      billing_current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      plan_tier: "free",
      subscription_status: "cancelled",
      subscription_current_period_end: null,
      slack_webhook_url: null,
      slack_channel: null,
      slack_fallback_channel: null,
      teams_webhook_url: null,
      teams_fallback_channel: null,
      acquisition_source: null,
      acquisition_campaign: null
    })
    .eq("id", request.organization_id);

  await admin
    .from("deletion_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      evidence_json: {
        ...(request.evidence_json ?? {}),
        execution: {
          contract_count: contractIds.length,
          metadata_count: metadataIds.length,
          membership_count: userIds.length
        }
      }
    })
    .eq("id", requestId);

  return {
    organizationId: request.organization_id,
    status: "completed" as const,
    contractCount: contractIds.length,
    membershipCount: userIds.length
  };
}
