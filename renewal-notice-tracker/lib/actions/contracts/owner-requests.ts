"use server";

import { revalidatePath } from "next/cache";
import {
  assertRenewalActionResponseStatus,
  canManageRenewalOwner,
  canRespondToRenewalActionRequest,
  getRenewalOwnerAuditAction,
  sanitizeRenewalActionAuditMetadata,
  sanitizeRenewalActionFreeText
} from "@/lib/contracts/renewal-action-requests";
import { createAuditLog } from "@/lib/audit";
import { requireOrganization } from "@/lib/auth";
import {
  getOrganizationMembers,
  requireScopedContract
} from "@/lib/contracts/kernel-queries";
import { sendRenewalActionRequestEmail } from "@/lib/email/send-reminder";
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

type RenewalActionRequestRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_to_user_id: string;
  request_status: string;
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

function normalizeDueAt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date is invalid.");
  }
  return parsed.toISOString();
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
        contract_value_currency
      )
    `
    )
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data as ContractActionContext;
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
  const previousOwnerUserId = contract.owner_user_id ?? null;
  if (previousOwnerUserId === newOwnerUserId) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("contracts")
    .update({ owner_user_id: newOwnerUserId })
    .eq("id", contractId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;

  const action = getRenewalOwnerAuditAction({
    previousOwnerUserId,
    newOwnerUserId
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
      newOwnerUserId,
      actionSource
    })
  });

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
  const recipientEmail = owner.user?.notification_email?.trim();
  if (!recipientEmail) {
    throw new Error("Assigned owner does not have a notification email.");
  }

  const dueAt = normalizeDueAt(formData.get("due_at"));
  const message = sanitizeRenewalActionFreeText(formData.get("message"));
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("renewal_action_requests")
    .insert({
      contract_id: contractId,
      organization_id: context.organizationId,
      requested_by_user_id: context.user.id,
      requested_to_user_id: requestedToUserId,
      request_status: "pending",
      requested_action: "decide_renewal",
      due_at: dueAt,
      message
    })
    .select("id")
    .single();

  if (error) throw error;

  const metadata = firstValue(contract.contract_metadata);
  await sendRenewalActionRequestEmail({
    organizationId: context.organizationId,
    recipientEmail,
    contractId,
    contractTitle: metadata?.contract_title ?? "Untitled contract",
    counterpartyName: metadata?.counterparty_name ?? null,
    requestedActionLabel: "Decide renewal",
    noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
    renewalDate: metadata?.renewal_date ?? null,
    expirationDate: metadata?.expiration_date ?? null,
    dueAt,
    ownerLabel: owner.user?.full_name ?? owner.user?.notification_email ?? "Assigned owner",
    contractValueAmount: metadata?.contract_value_amount ?? null,
    contractValueCurrency: metadata?.contract_value_currency ?? null,
    requesterLabel: context.user.email ?? "NoticeControl operator",
    message
  });

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId,
    action: "renewal.action_requested",
    entityType: "renewal_action_request",
    entityId: data.id,
    details: sanitizeRenewalActionAuditMetadata({
      organizationId: context.organizationId,
      contractId,
      requestId: data.id,
      actorUserId: context.user.id,
      requestedToUserId,
      requestedAction: "decide_renewal",
      requestStatus: "pending",
      dueAt,
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
  const completedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("renewal_action_requests")
    .update({
      request_status: "completed",
      response_status: responseStatus,
      response_note: responseNote,
      completed_at: completedAt
    })
    .eq("id", requestId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;

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
      completedAt,
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
  const completedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("renewal_action_requests")
    .update({
      request_status: "dismissed",
      response_status: "dismissed",
      response_note: responseNote,
      completed_at: completedAt
    })
    .eq("id", requestId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;

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
      completedAt,
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
  const completedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("renewal_action_requests")
    .update({
      request_status: "expired",
      completed_at: completedAt
    })
    .eq("id", requestId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;

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
      completedAt
    })
  });

  revalidatePath(`/dashboard/contracts/${request.contract_id}`);
  revalidatePath("/dashboard");
}
