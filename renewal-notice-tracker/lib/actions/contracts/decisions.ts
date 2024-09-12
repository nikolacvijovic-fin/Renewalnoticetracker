"use server";

import { revalidatePath } from "next/cache";
import {
  assertCanUseShippedAction,
  requireOrganization
} from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { deriveCycleStatusFromDecision } from "@/lib/contracts/phase1-pilot";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { renewalDecisionSchema } from "@/lib/validation/contract";
import { RENEWAL_CYCLE_STATUSES } from "@/lib/constants";
import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";

function assertCycleStatus(value: string): asserts value is (typeof RENEWAL_CYCLE_STATUSES)[number] {
  if (!RENEWAL_CYCLE_STATUSES.includes(value as (typeof RENEWAL_CYCLE_STATUSES)[number])) {
    throw new Error("Unsupported renewal cycle status.");
  }
}

export async function createRenewalDecisionAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "record_decision", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  const { user, organizationId } = context;
  const payload = renewalDecisionSchema.parse({
    status: formData.get("status"),
    decision_date: formData.get("decision_date") || null,
    summary: formData.get("summary"),
    next_steps: String(formData.get("next_steps") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
  });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("renewal_decisions")
    .insert({
      contract_id: contractId,
      organization_id: organizationId,
      author_user_id: user.id,
      ...payload
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase
    .from("contracts")
    .update({
      renewal_decision_status: payload.status,
      renewal_decision_date: payload.decision_date ?? null,
      cycle_status: deriveCycleStatusFromDecision(payload.status, "open")
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId);

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "renewal_decision.created",
    entityType: "renewal_decision",
    entityId: data.id,
    details: payload
  });
  await recordEnterpriseAuditEvent({
    organizationId,
    actorUserId: user.id,
    contractId,
    eventType: "renewal_decision.created",
    eventCategory: "renewal_decision",
    eventSource: "renewal_decisions",
    severity: "info",
    metadata: {
      renewalDecisionId: data.id,
      status: payload.status,
      decisionDate: payload.decision_date ?? null,
      nextStepCount: payload.next_steps.length
    },
    idempotencyKey: `renewal_decision.created:${data.id}`,
    mode: "best_effort"
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "renewal_decision_recorded",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `renewal_decision_recorded:${data.id}`,
    properties: {
      contract_id: contractId,
      renewal_decision_id: data.id,
      status: payload.status
    }
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/dashboard");
}

export async function acknowledgeContractAction(contractId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "acknowledge_reminder", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  const { user, organizationId } = context;
  const acknowledgedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("contracts")
    .update({
      cycle_status: "awaiting_decision",
      last_acknowledged_at: acknowledgedAt,
      last_acknowledged_by: user.id
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId);

  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "contract.acknowledged",
    entityType: "contract",
    entityId: contractId,
    details: { acknowledged_at: acknowledgedAt }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "acknowledgment_recorded",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `acknowledgment_recorded:${contractId}:${acknowledgedAt}`,
    properties: {
      contract_id: contractId
    }
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/dashboard");
}

export async function updateRenewalCycleAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "close_reopen_cycle", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });
  const { user, organizationId } = context;
  const requestedStatus = String(formData.get("cycle_status") ?? "");
  assertCycleStatus(requestedStatus);
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("contracts")
    .update({
      cycle_status: requestedStatus
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId);

  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "renewal_cycle.updated",
    entityType: "contract",
    entityId: contractId,
    details: { cycle_status: requestedStatus }
  });
  await recordEnterpriseAuditEvent({
    organizationId,
    actorUserId: user.id,
    contractId,
    eventType: "renewal_cycle.updated",
    eventCategory: "renewal_decision",
    eventSource: "renewal_cycle",
    severity: requestedStatus === "closed" ? "info" : "warning",
    metadata: { cycleStatus: requestedStatus },
    idempotencyKey: `renewal_cycle.updated:${contractId}:${requestedStatus}:${Date.now()}`,
    mode: "best_effort"
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/dashboard");
}
