import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAppConfig } from "@/lib/config";
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
  renewal_decisions?: Array<{ id: string | null; status: string | null }> | null;
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
      renewal_decisions (
        id,
        status
      ),
      contract_trust_exception_approvals (*)
    `
    )
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return ((data ?? []) as unknown as ActivationContractRow[]).map((contract) => ({
    id: contract.id,
    owner_user_id: contract.owner_user_id,
    contract_metadata: contract.contract_metadata,
    reminders: contract.reminders ?? [],
    renewal_decisions: contract.renewal_decisions ?? [],
    contract_trust_exception_approvals:
      contract.contract_trust_exception_approvals?.map((approval) => ({
        ...approval,
        approval_type: approval.approval_type as never
      })) ?? []
  }));
}

export type EmailConfigurationReadiness = {
  configured: boolean;
  missing: Array<"resend_api_key" | "from_email" | "reply_to_email">;
  source: "app_config";
};

export function buildEmailConfigurationReadiness(input: {
  resendApiKey?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
}): EmailConfigurationReadiness {
  const missing: EmailConfigurationReadiness["missing"] = [];
  if (!input.resendApiKey) missing.push("resend_api_key");
  if (!input.fromEmail) missing.push("from_email");
  if (!input.replyToEmail) missing.push("reply_to_email");

  return {
    configured: missing.length === 0,
    missing,
    source: "app_config"
  };
}

export function getEmailConfigurationReadiness(): EmailConfigurationReadiness {
  const config = getAppConfig();
  return buildEmailConfigurationReadiness({
    resendApiKey: config.email.resendApiKey,
    fromEmail: config.email.fromEmail,
    replyToEmail: config.email.replyToEmail
  });
}

export async function hasContractCalendarExportAudit(input: {
  organizationId: string;
  contractId: string | null | undefined;
}): Promise<boolean> {
  if (!input.contractId) return false;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .eq("action", "contract.ics_exported")
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}
