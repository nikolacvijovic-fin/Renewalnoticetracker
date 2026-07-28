import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  CommercialDecision,
  CommercialDecisionApprovalStep,
  CommercialDecisionEvidenceLink,
  CommercialDecisionSnapshot
} from "@/lib/commercial-decision-workbench/decision-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function insertAdminCommercialDecision(input: {
  organizationId: string;
  contractId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_commercial_decisions")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecision | null; error: Error | null }>;
}

export async function getAdminCommercialDecisionById(input: {
  organizationId: string;
  decisionId: string;
}) {
  return admin()
    .from("renewal_commercial_decisions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.decisionId)
    .maybeSingle() as unknown as Promise<{ data: CommercialDecision | null; error: Error | null }>;
}

export async function getAdminActiveCommercialDecisionByContractId(input: {
  organizationId: string;
  contractId: string;
}) {
  return admin()
    .from("renewal_commercial_decisions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .neq("decision_status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as Promise<{ data: CommercialDecision | null; error: Error | null }>;
}

export async function listAdminCommercialDecisions(input: {
  organizationId: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("renewal_commercial_decisions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.status) query = query.eq("decision_status", input.status);
  return query as unknown as Promise<{ data: CommercialDecision[] | null; error: Error | null }>;
}

export async function updateAdminCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_commercial_decisions")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.decisionId)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecision | null; error: Error | null }>;
}

export function updateAdminCommercialDecisionStatus(input: {
  organizationId: string;
  decisionId: string;
  values: Record<string, unknown>;
}) {
  return updateAdminCommercialDecision(input);
}

export function updateAdminCommercialDecisionRecommendedAction(input: {
  organizationId: string;
  decisionId: string;
  values: Record<string, unknown>;
}) {
  return updateAdminCommercialDecision(input);
}

export function updateAdminCommercialDecisionNegotiationPosture(input: {
  organizationId: string;
  decisionId: string;
  values: Record<string, unknown>;
}) {
  return updateAdminCommercialDecision(input);
}

export async function insertAdminCommercialDecisionEvidenceLink(input: {
  organizationId: string;
  contractId: string;
  decisionId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_decision_evidence_links")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      decision_id: input.decisionId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecisionEvidenceLink | null; error: Error | null }>;
}

export async function insertAdminCommercialDecisionApprovalStep(input: {
  organizationId: string;
  contractId: string;
  decisionId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_decision_approval_steps")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      decision_id: input.decisionId,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecisionApprovalStep | null; error: Error | null }>;
}

export async function updateAdminCommercialDecisionApprovalStep(input: {
  organizationId: string;
  approvalStepId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_decision_approval_steps")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.approvalStepId)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecisionApprovalStep | null; error: Error | null }>;
}

export async function insertAdminCommercialDecisionSnapshot(input: {
  organizationId: string;
  contractId: string;
  decisionId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_decision_snapshots")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      decision_id: input.decisionId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: CommercialDecisionSnapshot | null; error: Error | null }>;
}

export async function listAdminCommercialDecisionEvidenceLinks(input: {
  organizationId: string;
  decisionId: string;
}) {
  return admin()
    .from("renewal_decision_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("decision_id", input.decisionId)
    .order("created_at", { ascending: false }) as unknown as Promise<{
      data: CommercialDecisionEvidenceLink[] | null;
      error: Error | null;
    }>;
}

export async function listAdminCommercialDecisionApprovalSteps(input: {
  organizationId: string;
  decisionId: string;
}) {
  return admin()
    .from("renewal_decision_approval_steps")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("decision_id", input.decisionId)
    .order("step_order", { ascending: true }) as unknown as Promise<{
      data: CommercialDecisionApprovalStep[] | null;
      error: Error | null;
    }>;
}

export async function listAdminCommercialDecisionSnapshots(input: {
  organizationId: string;
  decisionId: string;
  limit?: number;
}) {
  return admin()
    .from("renewal_decision_snapshots")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("decision_id", input.decisionId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{
      data: CommercialDecisionSnapshot[] | null;
      error: Error | null;
    }>;
}
