"use server";

import { revalidatePath } from "next/cache";
import {
  assertRenewalActionResponseStatus,
  canManageRenewalOwner,
  canRespondToRenewalActionRequest,
  getRenewalOwnerAuditAction,
  parseRenewalActionDueDate,
  sanitizeRenewalActionAuditMetadata,
  sanitizeRenewalActionFreeText,
  validateRenewalActionDueDate
} from "@/lib/contracts/renewal-action-requests";
import { createAuditLog } from "@/lib/audit";
import { requireOrganization } from "@/lib/auth";
import {
  getOrganizationMembers,
  requireScopedContract
} from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContractActionContext = {
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
        needs_review: boolean | null;
      }
    | Array<{
        contract_title: string | null;
        counterparty_name: string | null;
        notice_deadline_date: string | null;
        renewal_date: string | null;
        expiration_date: string | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
        needs_review: boolean | null;
      }>
    | null;
};

type RenewalActionRequestRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_to_user_id: string;
  request_status: string;
};

type SupabaseRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type CreateRenewalActionRequestRpcRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_to_user_id: string;
  request_status: string;
  requested_action: string;
  due_date: string | null;
  due_at: string | null;
  created: boolean;
};

type RespondRenewalActionRequestRpcRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_to_user_id: string;
  request_status: string;
  response_status?: string | null;
  completed_at: string | null;
  transitioned: boolean;
};

type AssignOwnerRpcRow = {
  contract_id: string;
  organization_id: string;
  previous_owner_user_id: string | null;
  new_owner_user_id: string | null;
  expired_request_ids: string[] | null;
  expired_count: number | null;
};

function firstValue<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function assertOwnerManager(role: string) {
  if (!canManageRenewalOwner(role)) {
    throw new Error("Only owners, admins, or operators can manage renewal owners.");
  }
}

function normalizeNullableUserId(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getScopedContractActionContext(
  contractId: string,
  organizationId: string
): Promise<ContractActionContext> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      id,
      owner_user_id,
      contract_metadata (
        contract_title,
        counterparty_name,
        notice_deadline_date,
        renewal_date,
        expiration_date,
        contract_value_amount,
        contract_value_currency,
        needs_review
      )
    `
    )
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data as unknown as ContractActionContext;
}

function firstRpcRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? (data[0] as T | undefined) ?? null : (data as T | null);
}

function mapRenewalActionDbError(error: { message?: string } | null, fallback: string) {
  if (!error) return new Error(fallback);
  return new Error(error.message || fallback);
}

export async function assignContractOwnerAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  assertOwnerManager(context.role);
  await requireScopedContract(contractId, context.organizationId);

  const newOwnerUserId = normalizeNullableUserId(formData.get("owner_user_id"));
  const actionSource =
    typeof formData.get("action_source") === "string"
      ? String(formData.get("action_source")).slice(0, 80)
      : "contract_detail";
  const members = await getOrganizationMembers(context.organizationId);

  if (newOwnerUserId && !members.some((member) => member.user_id === newOwnerUserId)) {
    throw new Error("Owner must be a member of the active organization.");
  }

  const contract = await getScopedContractActionContext(contractId, context.organizationId);
  if ((contract.owner_user_id ?? null) === newOwnerUserId) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as SupabaseRpcClient).rpc(
    "assign_contract_owner_and_expire_requests",
    {
      p_contract_id: contractId,
      p_new_owner_user_id: newOwnerUserId
    }
  );

  if (error) throw mapRenewalActionDbError(error, "Owner assignment failed.");

  const transition = firstRpcRow<AssignOwnerRpcRow>(data);
  if (!transition || transition.organization_id !== context.organizationId) {
    throw new Error("Owner assignment did not complete.");
  }
  const previousOwnerUserId = transition.previous_owner_user_id ?? null;

  const action = getRenewalOwnerAuditAction({
    previousOwnerUserId,
    newOwnerUserId: transition.new_owner_user_id ?? null
  });
  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId,
    action,
    entityType: "contract",
    entityId: contractId,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      previousOwnerUserId,
      newOwnerUserId: transition.new_owner_user_id ?? null,
      actionSource,
      expiredRequestIds: transition.expired_request_ids ?? [],
      expiredRequestCount: transition.expired_count ?? 0
    })
  });

  if ((transition.expired_count ?? 0) > 0) {
    await createAuditLog({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      contractId,
      action: "renewal.action_expired",
      entityType: "renewal_action_request",
      entityId: contractId,
      details: sanitizeRenewalActionAuditMetadata({
        organizationId: context.organizationId,
        contractId,
        actorUserId: context.user.id,
        previousOwnerUserId,
        newOwnerUserId: transition.new_owner_user_id ?? null,
        actionSource: "owner_changed",
        expiredRequestIds: transition.expired_request_ids ?? [],
        expiredRequestCount: transition.expired_count ?? 0,
        requestStatus: "expired"
      })
    });
  }

  revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/dashboard");
}

export async function requestRenewalActionAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  assertOwnerManager(context.role);
  await requireScopedContract(contractId, context.organizationId);

  const contract = await getScopedContractActionContext(contractId, context.organizationId);
  const requestedToUserId = contract.owner_user_id;
  if (!requestedToUserId) {
    throw new Error("Assign an internal owner before requesting renewal action.");
  }

  const members = await getOrganizationMembers(context.organizationId);
  const owner = members.find((member) => member.user_id === requestedToUserId);
  if (!owner) {
    throw new Error("Assigned owner must be a member of the active organization.");
  }
  if (!owner.user?.notification_email?.trim()) {
    throw new Error("Assigned owner does not have a notification email.");
  }

  const metadata = firstValue(contract.contract_metadata);
  const dueDate = validateRenewalActionDueDate({
    dueDate: parseRenewalActionDueDate(formData.get("due_date") ?? formData.get("due_at")),
    noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
    needsReview: metadata?.needs_review ?? true
  });
  const message = sanitizeRenewalActionFreeText(formData.get("message"));
  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as SupabaseRpcClient).rpc(
    "create_renewal_action_request",
    {
      p_contract_id: contractId,
      p_due_date: dueDate,
      p_message: message
    }
  );

  if (error) throw mapRenewalActionDbError(error, "Renewal action request failed.");

  const request = firstRpcRow<CreateRenewalActionRequestRpcRow>(data);
  if (!request || request.organization_id !== context.organizationId) {
    throw new Error("Renewal action request did not complete.");
  }

  if (!request.created) {
    revalidatePath(`/dashboard/contracts/${contractId}`);
    revalidatePath("/dashboard");
    return;
  }

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId,
    action: "renewal.action_requested",
    entityType: "renewal_action_request",
    entityId: request.id,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId,
      requestId: request.id,
      actorUserId: context.user.id,
      requestedToUserId,
      requestedAction: "decide_renewal",
      requestStatus: "pending",
      dueDate: request.due_date ?? dueDate,
      messageLength: message?.length ?? 0
    })
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/dashboard");
}

async function getScopedRenewalActionRequest(
  requestId: string,
  organizationId: string
): Promise<RenewalActionRequestRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("renewal_action_requests")
    .select("id, contract_id, organization_id, requested_to_user_id, request_status")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data as RenewalActionRequestRow;
}

export async function completeRenewalActionRequestAction(requestId: string, formData: FormData) {
  const context = await requireOrganization();
  const request = await getScopedRenewalActionRequest(requestId, context.organizationId);
  if (
    !canRespondToRenewalActionRequest({
      role: context.role,
      actorUserId: context.user.id,
      requestedToUserId: request.requested_to_user_id
    })
  ) {
    throw new Error("Only the assigned owner or an operator can complete this request.");
  }

  const responseStatus = String(formData.get("response_status") ?? "");
  assertRenewalActionResponseStatus(responseStatus);
  const responseNote = sanitizeRenewalActionFreeText(formData.get("response_note"));
  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as SupabaseRpcClient).rpc(
    "respond_renewal_action_request",
    {
      p_request_id: requestId,
      p_target_status: "completed",
      p_response_status: responseStatus,
      p_response_note: responseNote
    }
  );

  if (error) throw mapRenewalActionDbError(error, "Renewal action request is no longer pending.");
  const transition = firstRpcRow<RespondRenewalActionRequestRpcRow>(data);
  if (!transition?.transitioned) {
    throw new Error("Renewal action request is no longer pending.");
  }

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: request.contract_id,
    action: "renewal.action_completed",
    entityType: "renewal_action_request",
    entityId: requestId,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId: request.contract_id,
      requestId,
      actorUserId: context.user.id,
      requestedToUserId: request.requested_to_user_id,
      responseStatus,
      completedAt: transition.completed_at,
      noteLength: responseNote?.length ?? 0
    })
  });

  revalidatePath(`/dashboard/contracts/${request.contract_id}`);
  revalidatePath("/dashboard");
}

export async function dismissRenewalActionRequestAction(requestId: string, formData: FormData) {
  const context = await requireOrganization();
  const request = await getScopedRenewalActionRequest(requestId, context.organizationId);
  if (
    !canRespondToRenewalActionRequest({
      role: context.role,
      actorUserId: context.user.id,
      requestedToUserId: request.requested_to_user_id
    })
  ) {
    throw new Error("Only the assigned owner or an operator can dismiss this request.");
  }

  const responseNote = sanitizeRenewalActionFreeText(formData.get("response_note"));
  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as SupabaseRpcClient).rpc(
    "respond_renewal_action_request",
    {
      p_request_id: requestId,
      p_target_status: "dismissed",
      p_response_status: "dismissed",
      p_response_note: responseNote
    }
  );

  if (error) throw mapRenewalActionDbError(error, "Renewal action request is no longer pending.");
  const transition = firstRpcRow<RespondRenewalActionRequestRpcRow>(data);
  if (!transition?.transitioned) {
    throw new Error("Renewal action request is no longer pending.");
  }

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: request.contract_id,
    action: "renewal.action_dismissed",
    entityType: "renewal_action_request",
    entityId: requestId,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId: request.contract_id,
      requestId,
      actorUserId: context.user.id,
      requestedToUserId: request.requested_to_user_id,
      responseStatus: "dismissed",
      completedAt: transition.completed_at,
      noteLength: responseNote?.length ?? 0
    })
  });

  revalidatePath(`/dashboard/contracts/${request.contract_id}`);
  revalidatePath("/dashboard");
}

export async function expireRenewalActionRequestAction(requestId: string) {
  const context = await requireOrganization();
  assertOwnerManager(context.role);
  const request = await getScopedRenewalActionRequest(requestId, context.organizationId);
  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as unknown as SupabaseRpcClient).rpc(
    "expire_renewal_action_request",
    {
      p_request_id: requestId
    }
  );

  if (error) throw mapRenewalActionDbError(error, "Renewal action request is no longer pending.");
  const transition = firstRpcRow<RespondRenewalActionRequestRpcRow>(data);
  if (!transition?.transitioned) {
    throw new Error("Renewal action request is no longer pending.");
  }

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: request.contract_id,
    action: "renewal.action_expired",
    entityType: "renewal_action_request",
    entityId: requestId,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId: request.contract_id,
      requestId,
      actorUserId: context.user.id,
      requestedToUserId: request.requested_to_user_id,
      requestStatus: "expired",
      completedAt: transition.completed_at
    })
  });

  revalidatePath(`/dashboard/contracts/${request.contract_id}`);
  revalidatePath("/dashboard");
}
