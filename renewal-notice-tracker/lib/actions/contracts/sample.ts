"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization, requireShippedRuntimeAction } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import {
  createCommercialDenialAuditLog,
  getBillingSnapshot,
  getContractTrackingLimitResult
} from "@/lib/billing/entitlements";
import { getOrganizationContractCount } from "@/lib/contracts/kernel-queries";
import { buildSampleContractMetadata, SAMPLE_CONTRACT_ACTIONS } from "@/lib/contracts/sample-contract";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type SampleRpcClient = {
  rpc: (
    name: "create_sample_contract_with_metadata",
    payload: {
      p_organization_id: string;
    }
  ) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>;
  from: ReturnType<typeof createServerSupabaseClient>["from"];
};

function isUniqueSampleConstraint(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  return maybeError?.code === "23505" || Boolean(maybeError?.message?.includes("idx_contracts_one_active_sample_per_org"));
}

async function findActiveSampleContractId(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_sample", true)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { id?: string } | null)?.id ?? null;
}

async function enforceSampleContractCapacity(input: {
  organizationId: string;
  actorUserId: string;
}) {
  const billingSnapshot = await getBillingSnapshot(input.organizationId);
  const currentCount = await getOrganizationContractCount(input.organizationId);
  const access = getContractTrackingLimitResult(billingSnapshot, currentCount);
  if (access.allowed) return;

  await createCommercialDenialAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    feature: "manual_contracts",
    billingSnapshot,
    context: {
      contract_tracking_limit_reached: true,
      current_count: access.currentCount,
      limit: access.limit,
      source_type: "sample",
      sample_contract: true
    }
  });

  redirect("/onboarding?commercial=billing.contract_tracking_limit_reached");
}

export async function createSampleContractAction() {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const existingSampleId = await findActiveSampleContractId(organizationId);
  if (existingSampleId) {
    revalidatePath("/onboarding");
    redirect(`/dashboard/contracts/${existingSampleId}`);
  }

  await enforceSampleContractCapacity({
    organizationId,
    actorUserId: user.id
  });

  const supabase = createServerSupabaseClient();
  const metadata = buildSampleContractMetadata();

  const { data: rpcContractId, error: rpcError } = await (supabase as unknown as SampleRpcClient).rpc(
    "create_sample_contract_with_metadata",
    {
      p_organization_id: organizationId
    }
  );

  if (rpcError || !rpcContractId) {
    if (isUniqueSampleConstraint(rpcError)) {
      const id = await findActiveSampleContractId(organizationId);
      if (id) redirect(`/dashboard/contracts/${id}`);
    }
    throw rpcError ?? new Error("sample_contract_rpc_failed");
  }

  const contractId = rpcContractId;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: SAMPLE_CONTRACT_ACTIONS.created,
    entityType: "contract",
    entityId: contractId,
    details: {
      source_type: "sample",
      sample_contract: true,
      synthetic_dates: {
        notice_deadline_date: metadata.notice_deadline_date,
        renewal_date: metadata.renewal_date,
        expiration_date: metadata.expiration_date
      },
      owner_assigned_to_actor: true,
      reminders_auto_created: false,
      vendor_send_enabled: false
    }
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contracts");
  redirect(`/dashboard/contracts/${contractId}`);
}

export async function removeSampleContractAction(contractId: string, formData: FormData) {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const confirmed = formData.get("confirm_sample_removal") === "yes";
  if (!confirmed) {
    throw new Error("Confirm sample removal before continuing.");
  }

  const supabase = createServerSupabaseClient();
  const { data: contract, error: lookupError } = await supabase
    .from("contracts")
    .select("id, is_sample, status")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!contract) throw new Error("Sample contract not found for the active organization.");
  if (!(contract as { is_sample?: boolean }).is_sample) {
    throw new Error("Only sample contracts can be removed from the sample onboarding action.");
  }

  const { error: updateError } = await supabase
    .from("contracts")
    .update({
      status: "archived",
      cycle_status: "closed",
      status_tag: "sample_removed"
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .eq("is_sample", true);

  if (updateError) throw updateError;

  const { error: reminderCancelError } = await supabase
    .from("reminders")
    .update({
      status: "cancelled",
      last_error: "Fictional sample contract was removed before reminder delivery.",
      processing_started_at: null,
      processing_token: null,
      next_retry_at: null
    })
    .eq("contract_id", contractId)
    .eq("organization_id", organizationId)
    .in("status", ["pending", "processing", "retry_pending"]);

  if (reminderCancelError) throw reminderCancelError;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: SAMPLE_CONTRACT_ACTIONS.removed,
    entityType: "contract",
    entityId: contractId,
    details: {
      source_type: "sample",
      sample_contract: true,
      removal_mode: "archived",
      sample_reminders_cancelled: true,
      real_contract_deleted: false
    }
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contracts");
  revalidatePath(`/dashboard/contracts/${contractId}`);
  redirect("/onboarding");
}

export async function recordSampleContractOpened(contractId: string) {
  const { user, organizationId } = await requireOrganization();
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, is_sample")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (contractError) throw contractError;
  if (!(contract as { is_sample?: boolean } | null)?.is_sample) return;

  const { data: existingAudit, error: auditLookupError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contract_id", contractId)
    .eq("action", SAMPLE_CONTRACT_ACTIONS.opened)
    .gte("created_at", `${today}T00:00:00.000Z`)
    .limit(1);

  if (auditLookupError) throw auditLookupError;
  if (existingAudit?.length) return;

  await createAuditLog(
    {
      organizationId,
      actorUserId: user.id,
      contractId,
      action: SAMPLE_CONTRACT_ACTIONS.opened,
      entityType: "contract",
      entityId: contractId,
      details: {
        source_type: "sample",
        sample_contract: true
      }
    },
    { mode: "best_effort" }
  );
}

export async function recordSampleToFirstRealContractStartedIfNeeded(input: {
  organizationId: string;
  actorUserId: string;
  realContractId: string;
  realContractSourceType: "upload" | "manual";
}) {
  const sampleContractId = await findActiveSampleContractId(input.organizationId);
  if (!sampleContractId) return;
  const supabase = createServerSupabaseClient();
  const { data: existingAudit, error } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("action", SAMPLE_CONTRACT_ACTIONS.movedToFirstReal)
    .limit(1);

  if (error) throw error;
  if (existingAudit?.length) return;

  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      contractId: input.realContractId,
      action: SAMPLE_CONTRACT_ACTIONS.movedToFirstReal,
      entityType: "contract",
      entityId: input.realContractId,
      details: {
        source_type: input.realContractSourceType,
        sample_contract_id: sampleContractId,
        sample_contract_archived_automatically: false
      } satisfies Record<string, Json>
    },
    { mode: "best_effort" }
  );
}
