import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  RenewalOutcome,
  RenewalScenario,
  RenewalWorkspaceTask
} from "@/lib/renewal-workspace/types";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
function admin() {
  return createAdminSupabaseClient() as AdminClient;
}

export function listAdminRenewalScenarios(input: { organizationId: string; decisionId: string }) {
  return admin().from("renewal_decision_scenarios" as never).select("*")
    .eq("organization_id", input.organizationId).eq("decision_id", input.decisionId)
    .order("created_at", { ascending: true }) as unknown as Promise<{ data: RenewalScenario[] | null; error: Error | null }>;
}

export function insertAdminRenewalScenario(input: {
  organizationId: string;
  contractId: string;
  decisionId: string;
  actorUserId: string;
  values: Record<string, unknown>;
}) {
  return admin().from("renewal_decision_scenarios" as never).insert({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    decision_id: input.decisionId,
    created_by_user_id: input.actorUserId,
    ...input.values
  } as never).select("*").single() as unknown as Promise<{ data: RenewalScenario | null; error: Error | null }>;
}

export function listAdminRenewalWorkspaceTasks(input: { organizationId: string; decisionId: string }) {
  return admin().from("renewal_workspace_tasks" as never).select("*")
    .eq("organization_id", input.organizationId).eq("decision_id", input.decisionId)
    .order("due_at", { ascending: true }) as unknown as Promise<{ data: RenewalWorkspaceTask[] | null; error: Error | null }>;
}

export function getAdminRenewalWorkspaceTask(input: { organizationId: string; decisionId: string; taskId: string }) {
  return admin().from("renewal_workspace_tasks").select("*")
    .eq("organization_id", input.organizationId).eq("decision_id", input.decisionId).eq("id", input.taskId)
    .maybeSingle() as unknown as Promise<{ data: RenewalWorkspaceTask | null; error: Error | null }>;
}

export function insertAdminRenewalWorkspaceTask(input: {
  organizationId: string;
  contractId: string;
  decisionId: string;
  actorUserId: string;
  values: Record<string, unknown>;
}) {
  return admin().from("renewal_workspace_tasks" as never).insert({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    decision_id: input.decisionId,
    created_by_user_id: input.actorUserId,
    ...input.values
  } as never).select("*").single() as unknown as Promise<{ data: RenewalWorkspaceTask | null; error: Error | null }>;
}

export function updateAdminRenewalWorkspaceTask(input: {
  organizationId: string;
  decisionId: string;
  taskId: string;
  values: Record<string, unknown>;
}) {
  return admin().from("renewal_workspace_tasks" as never).update(input.values as never)
    .eq("organization_id", input.organizationId).eq("decision_id", input.decisionId).eq("id", input.taskId)
    .select("*").single() as unknown as Promise<{ data: RenewalWorkspaceTask | null; error: Error | null }>;
}

export function getAdminRenewalOutcome(input: { organizationId: string; decisionId: string }) {
  return admin().from("renewal_decision_outcomes" as never).select("*")
    .eq("organization_id", input.organizationId).eq("decision_id", input.decisionId)
    .maybeSingle() as unknown as Promise<{ data: RenewalOutcome | null; error: Error | null }>;
}

export function listAdminRenewalPortfolio(input: { organizationId: string; limit?: number }) {
  return admin().from("renewal_commercial_decisions").select(`
    *,
    contracts!inner (
      id,
      organization_id,
      owner_user_id,
      department,
      contract_metadata (contract_title, counterparty_name, contract_value_amount, contract_value_currency, auto_renewal)
    )
  `).eq("organization_id", input.organizationId).neq("decision_status", "archived")
    .order("notice_deadline", { ascending: true }).limit(input.limit ?? 200) as unknown as Promise<{
      data: Array<Record<string, unknown>> | null;
      error: Error | null;
    }>;
}

export function listAdminConfirmedRenewalOutcomes(input: {
  organizationId: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  let query = admin().from("renewal_decision_outcomes" as never).select("*")
    .eq("organization_id", input.organizationId)
    .order("renewal_completed_at", { ascending: false }).limit(input.limit ?? 500);
  if (input.from) query = query.gte("renewal_completed_at", input.from);
  if (input.to) query = query.lte("renewal_completed_at", input.to);
  return query as unknown as Promise<{ data: RenewalOutcome[] | null; error: Error | null }>;
}
