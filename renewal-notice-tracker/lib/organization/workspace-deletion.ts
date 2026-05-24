import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  PrivilegedWriteError,
  checkedPrivilegedWrite
} from "@/lib/supabase/checked-write";

type DeletionRequestRecord = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  status: string;
  evidence_json?: Record<string, unknown> | null;
};

type DeletionStage =
  | "mark_request_executing"
  | "load_scope"
  | "delete_extracted_field_evidence"
  | "delete_contract_linked_records"
  | "delete_org_scoped_records"
  | "delete_contracts"
  | "clear_user_defaults"
  | "delete_memberships"
  | "tombstone_organization"
  | "mark_request_completed";

export class WorkspaceDeletionExecutionError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly organizationId: string,
    public readonly failedStage: DeletionStage,
    public readonly completedStages: DeletionStage[],
    public readonly failureStatePersisted: boolean,
    public readonly cause: unknown,
    public readonly failureStatusError?: unknown
  ) {
    super("Workspace deletion execution failed.");
    this.name = "WorkspaceDeletionExecutionError";
  }
}

function buildDeletionFailureEvidence(input: {
  existingEvidence: Record<string, unknown> | null | undefined;
  failedStage: DeletionStage;
  completedStages: DeletionStage[];
  error: unknown;
}) {
  return {
    ...(input.existingEvidence ?? {}),
    failure: {
      failed_at: new Date().toISOString(),
      failed_stage: input.failedStage,
      completed_stages: input.completedStages,
      error:
        input.error instanceof PrivilegedWriteError
          ? {
              type: input.error.name,
              table: input.error.table,
              operation: input.error.operation,
              context: input.error.context ?? null,
              message: input.error.message
            }
          : {
              type: input.error instanceof Error ? input.error.name : "UnknownError",
              message:
                input.error instanceof Error
                  ? input.error.message
                  : "Workspace deletion failed."
            }
    }
  };
}

async function recordDeletionFailure(input: {
  admin: ReturnType<typeof createAdminSupabaseClient>;
  requestId: string;
  request: DeletionRequestRecord;
  failedStage: DeletionStage;
  completedStages: DeletionStage[];
  error: unknown;
}) {
  const failureEvidence = buildDeletionFailureEvidence({
    existingEvidence: input.request.evidence_json,
    failedStage: input.failedStage,
    completedStages: input.completedStages,
    error: input.error
  });

  await checkedPrivilegedWrite(
    input.admin
      .from("deletion_requests")
      .update({
        status: "failed",
        completed_at: null,
        evidence_json: failureEvidence
      })
      .eq("id", input.requestId),
    {
      operation: "update",
      table: "deletion_requests",
      context: `workspace_deletion:${input.requestId}:mark_failed`
    }
  );
}

export async function executeWorkspaceDeletionRequest(requestId: string) {
  const admin = createAdminSupabaseClient();
  const context = `workspace_deletion:${requestId}`;
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

  const completedStages: DeletionStage[] = [];
  let currentStage: DeletionStage = "mark_request_executing";
  const markStageComplete = (stage: DeletionStage) => {
    completedStages.push(stage);
  };
  const runWriteStep = async (
    stage: DeletionStage,
    operation: "insert" | "update" | "delete" | "upsert",
    table: string,
    write: Parameters<typeof checkedPrivilegedWrite>[0]
  ) => {
    currentStage = stage;
    await checkedPrivilegedWrite(write, {
      operation,
      table,
      context: `${context}:${stage}`
    });
    markStageComplete(stage);
  };

  try {
    await runWriteStep(
      "mark_request_executing",
      "update",
      "deletion_requests",
      admin.from("deletion_requests").update({ status: "executing" }).eq("id", requestId)
    );

    currentStage = "load_scope";
    const [
      { data: memberships, error: membershipsError },
      { data: contracts, error: contractsError }
    ] = await Promise.all([
      admin.from("memberships").select("user_id").eq("organization_id", request.organization_id),
      admin.from("contracts").select("id").eq("organization_id", request.organization_id)
    ]);

    if (membershipsError) throw membershipsError;
    if (contractsError) throw contractsError;
    markStageComplete("load_scope");

    const contractIds = (contracts ?? []).map((row) => row.id as string);
    const userIds = (memberships ?? []).map((row) => row.user_id as string);

    let metadataIds: string[] = [];
    if (contractIds.length > 0) {
      const { data: metadata, error: metadataError } = await admin
        .from("contract_metadata")
        .select("id")
        .in("contract_id", contractIds);
      if (metadataError) throw metadataError;
      metadataIds = (metadata ?? []).map((row) => row.id as string);
    }

    if (metadataIds.length > 0) {
      await runWriteStep(
        "delete_extracted_field_evidence",
        "delete",
        "extracted_field_evidence",
        admin.from("extracted_field_evidence").delete().in("contract_metadata_id", metadataIds)
      );
    }

    if (contractIds.length > 0) {
      currentStage = "delete_contract_linked_records";
      await checkedPrivilegedWrite(
        admin.from("playbook_runs").delete().in("contract_id", contractIds),
        { operation: "delete", table: "playbook_runs", context: `${context}:${currentStage}` }
      );
      await checkedPrivilegedWrite(
        admin.from("renewal_decisions").delete().in("contract_id", contractIds),
        { operation: "delete", table: "renewal_decisions", context: `${context}:${currentStage}` }
      );
      await checkedPrivilegedWrite(admin.from("notes").delete().in("contract_id", contractIds), {
        operation: "delete",
        table: "notes",
        context: `${context}:${currentStage}`
      });
      await checkedPrivilegedWrite(
        admin.from("processing_errors").delete().in("contract_id", contractIds),
        { operation: "delete", table: "processing_errors", context: `${context}:${currentStage}` }
      );
      await checkedPrivilegedWrite(
        admin.from("contract_files").delete().in("contract_id", contractIds),
        { operation: "delete", table: "contract_files", context: `${context}:${currentStage}` }
      );
      await checkedPrivilegedWrite(
        admin.from("contract_metadata").delete().in("contract_id", contractIds),
        { operation: "delete", table: "contract_metadata", context: `${context}:${currentStage}` }
      );
      markStageComplete("delete_contract_linked_records");
    }

    currentStage = "delete_org_scoped_records";
    await checkedPrivilegedWrite(
      admin.from("notification_logs").delete().eq("organization_id", request.organization_id),
      {
        operation: "delete",
        table: "notification_logs",
        context: `${context}:${currentStage}`
      }
    );
    await checkedPrivilegedWrite(
      admin.from("reminder_runs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "reminder_runs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("reminders").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "reminders", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("ocr_jobs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "ocr_jobs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("exports").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "exports", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("import_jobs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "import_jobs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("counterparties").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "counterparties", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("contract_templates").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "contract_templates", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("playbooks").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "playbooks", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("support_time_logs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "support_time_logs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("onboarding_time_logs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "onboarding_time_logs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("cost_usage_logs").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "cost_usage_logs", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin
        .from("organization_profitability_snapshots")
        .delete()
        .eq("organization_id", request.organization_id),
      {
        operation: "delete",
        table: "organization_profitability_snapshots",
        context: `${context}:${currentStage}`
      }
    );
    await checkedPrivilegedWrite(
      admin.from("metric_alerts").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "metric_alerts", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("readiness_snapshots").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "readiness_snapshots", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("capacity_snapshots").delete().eq("organization_id", request.organization_id),
      { operation: "delete", table: "capacity_snapshots", context: `${context}:${currentStage}` }
    );
    await checkedPrivilegedWrite(
      admin.from("data_export_requests").delete().eq("organization_id", request.organization_id),
      {
        operation: "delete",
        table: "data_export_requests",
        context: `${context}:${currentStage}`
      }
    );
    markStageComplete("delete_org_scoped_records");

    if (contractIds.length > 0) {
      await runWriteStep(
        "delete_contracts",
        "delete",
        "contracts",
        admin.from("contracts").delete().in("id", contractIds)
      );
    }

    currentStage = "clear_user_defaults";
    for (const userId of userIds) {
      await checkedPrivilegedWrite(
        admin
          .from("users")
          .update({ default_organization_id: null })
          .eq("id", userId)
          .eq("default_organization_id", request.organization_id),
        {
          operation: "update",
          table: "users",
          context: `${context}:${currentStage}`
        }
      );
    }
    markStageComplete("clear_user_defaults");

    await runWriteStep(
      "delete_memberships",
      "delete",
      "memberships",
      admin.from("memberships").delete().eq("organization_id", request.organization_id)
    );

    await runWriteStep(
      "tombstone_organization",
      "update",
      "organizations",
      admin
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
        .eq("id", request.organization_id)
    );

    await runWriteStep(
      "mark_request_completed",
      "update",
      "deletion_requests",
      admin
        .from("deletion_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          evidence_json: {
            ...(request.evidence_json ?? {}),
            execution: {
              contract_count: contractIds.length,
              metadata_count: metadataIds.length,
              membership_count: userIds.length,
              completed_stages: completedStages
            }
          }
        })
        .eq("id", requestId)
    );

    return {
      organizationId: request.organization_id,
      status: "completed" as const,
      contractCount: contractIds.length,
      membershipCount: userIds.length
    };
  } catch (error) {
    let failureStatePersisted = false;
    let failureStatusError: unknown;

    try {
      await recordDeletionFailure({
        admin,
        requestId,
        request,
        failedStage: currentStage,
        completedStages,
        error
      });
      failureStatePersisted = true;
    } catch (persistError) {
      failureStatusError = persistError;
    }

    throw new WorkspaceDeletionExecutionError(
      requestId,
      request.organization_id,
      currentStage,
      completedStages,
      failureStatePersisted,
      error,
      failureStatusError
    );
  }
}
