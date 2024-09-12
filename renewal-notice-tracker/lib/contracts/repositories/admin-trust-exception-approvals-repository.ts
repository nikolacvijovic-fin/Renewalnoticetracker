import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type AdminTrustExceptionApprovalInsert =
  Database["public"]["Tables"]["contract_trust_exception_approvals"]["Insert"];

export type AdminTrustExceptionApprovalUpdate =
  Database["public"]["Tables"]["contract_trust_exception_approvals"]["Update"];

export async function listAdminTrustExceptionApprovals(input: {
  organizationId: string;
  contractId: string;
  approvalType?: string;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("contract_trust_exception_approvals")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.approvalType) {
    query = query.eq("approval_type", input.approvalType);
  }

  return query;
}

export async function insertAdminTrustExceptionApproval(payload: AdminTrustExceptionApprovalInsert) {
  const admin = createAdminSupabaseClient();
  return admin
    .from("contract_trust_exception_approvals")
    .insert(payload)
    .select("*")
    .single();
}

export async function revokeAdminTrustExceptionApproval(input: {
  organizationId: string;
  contractId: string;
  approvalId: string;
  update: AdminTrustExceptionApprovalUpdate;
}) {
  const admin = createAdminSupabaseClient();
  return admin
    .from("contract_trust_exception_approvals")
    .update(input.update)
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .eq("id", input.approvalId)
    .select("*")
    .single();
}

export async function getAdminContractMetadataForTrustApproval(input: {
  organizationId: string;
  contractId: string;
}) {
  const admin = createAdminSupabaseClient();
  return admin
    .from("contracts")
    .select(
      `
      id,
      contract_metadata (
        needs_review,
        has_weak_evidence,
        is_manual_without_evidence,
        field_confidence
      )
    `
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.contractId)
    .single();
}
