import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ActivationContractInput } from "@/lib/onboarding/activation-state";

type TrustExceptionApprovalRow = Database["public"]["Tables"]["contract_trust_exception_approvals"]["Row"];

type ActivationContractRow = {
  id: string;
  owner_user_id: string | null;
  contract_metadata:
    | ActivationContractInput["contract_metadata"]
    | null;
  reminders?: Array<{ status: string | null; remind_at: string | null }> | null;
  contract_trust_exception_approvals?: TrustExceptionApprovalRow[] | null;
};

export async function getOrganizationActivationContracts(
  organizationId: string
): Promise<ActivationContractInput[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      id,
      owner_user_id,
      updated_at,
      contract_metadata (
        contract_title,
        renewal_date,
        notice_deadline_date,
        expiration_date,
        auto_renewal,
        needs_review,
        has_weak_evidence,
        accepted_unverified_risk_requested,
        field_confidence
      ),
      reminders (
        status,
        remind_at
      ),
      contract_trust_exception_approvals (*)
    `
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return ((data ?? []) as ActivationContractRow[]).map((contract) => ({
    id: contract.id,
    owner_user_id: contract.owner_user_id,
    contract_metadata: contract.contract_metadata,
    reminders: contract.reminders ?? [],
    contract_trust_exception_approvals:
      contract.contract_trust_exception_approvals?.map((approval) => ({
        ...approval,
        approval_type: approval.approval_type as never
      })) ?? []
  }));
}
