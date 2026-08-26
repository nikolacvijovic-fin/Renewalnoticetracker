import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { getAdminCommercialDecisionById, updateAdminCommercialDecision } from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";
import {
  getAdminRenewalOutcome,
  getAdminRenewalWorkspaceTask,
  insertAdminRenewalScenario,
  insertAdminRenewalWorkspaceTask,
  listAdminConfirmedRenewalOutcomes,
  listAdminRenewalPortfolio,
  listAdminRenewalScenarios,
  listAdminRenewalWorkspaceTasks,
  updateAdminRenewalWorkspaceTask
} from "@/lib/renewal-workspace/repositories/admin-renewal-workspace-repository";
import {
  assertDecisionType,
  assertIsoDate,
  assertRenewalTaskActorScope,
  assertRenewalTaskTransition,
  calculateRenewalScenario,
  evaluateRenewalApprovalPolicy,
  normalizeCurrency,
  sanitizeRenewalWorkspaceAuditMetadata,
  validateEvidenceReferences,
  type RenewalEvidenceReference,
  type ScenarioCalculationInput
} from "@/lib/renewal-workspace/renewal-workspace";
import type {
  RenewalScenarioType,
  RenewalTaskPriority,
  RenewalTaskStatus
} from "@/lib/renewal-workspace/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function decision(organizationId: string, decisionId: string) {
  const result = await getAdminCommercialDecisionById({ organizationId, decisionId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal decision not found in the active organization.");
  return result.data;
}

async function audit(input: {
  organizationId: string;
  contractId: string;
  actorUserId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    eventCategory: "renewal_decision",
    eventSource: "renewal_decision_events",
    severity: "info",
    metadata: sanitizeRenewalWorkspaceAuditMetadata(input.metadata),
    mode: "best_effort"
  });
}

export async function getRenewalWorkspaceExtension(input: { organizationId: string; decisionId: string }) {
  const [scenarios, tasks, outcome] = await Promise.all([
    listAdminRenewalScenarios(input),
    listAdminRenewalWorkspaceTasks(input),
    getAdminRenewalOutcome(input)
  ]);
  if (scenarios.error) throw scenarios.error;
  if (tasks.error) throw tasks.error;
  if (outcome.error) throw outcome.error;
  return { scenarios: scenarios.data ?? [], tasks: tasks.data ?? [], outcome: outcome.data };
}

export async function updateRenewalDecisionProfile(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  actorRole: string;
  decisionType: string;
  decisionOwnerUserId: string;
  decisionDeadline: string;
  rationale: string;
  estimatedFinancialEffect: number | null;
  currency: string | null;
  evidenceReferences: RenewalEvidenceReference[];
}) {
  assertDecisionType(input.decisionType);
  if (!input.rationale.trim() || input.rationale.trim().length > 4000) throw new Error("Decision rationale is required and must be concise.");
  assertIsoDate(input.decisionDeadline, "decision_deadline");
  validateEvidenceReferences(input.evidenceReferences);
  const current = await decision(input.organizationId, input.decisionId);
  const approval = evaluateRenewalApprovalPolicy({
    decisionType: input.decisionType,
    contractValue: typeof current.commercial_impact === "object" && current.commercial_impact && "contractValue" in current.commercial_impact
      ? Number((current.commercial_impact as Record<string, unknown>).contractValue) || null : null,
    proposedSavings: input.estimatedFinancialEffect,
    evidenceConfidence: current.evidence_confidence,
    terminationRisk: ["terminate", "replace_vendor"].includes(input.decisionType),
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    decisionOwnerUserId: input.decisionOwnerUserId
  });
  const result = await updateAdminCommercialDecision({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    values: {
      decision_type: input.decisionType,
      decision_owner_user_id: input.decisionOwnerUserId,
      decision_deadline: input.decisionDeadline,
      rationale: input.rationale.trim(),
      estimated_financial_effect: input.estimatedFinancialEffect,
      currency: input.currency ? normalizeCurrency(input.currency) : null,
      evidence_references: input.evidenceReferences,
      profile_selected_at: new Date().toISOString(),
      profile_selected_by_user_id: input.actorUserId,
      separation_of_duties_required: approval.separationRequired,
      decision_status: ["draft", "evidence_pending", "evidence_required", "returned_for_changes"].includes(current.decision_status)
        ? "ready_for_review"
        : current.decision_status
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal decision profile was not updated.");
  await audit({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    actorUserId: input.actorUserId,
    eventType: "renewal_workspace.decision_profile_updated",
    metadata: {
      organizationId: input.organizationId,
      contractId: current.contract_id,
      decisionId: current.id,
      actorUserId: input.actorUserId,
      decisionType: input.decisionType,
      decisionVersion: result.data.decision_version ?? 1,
      evidenceCount: input.evidenceReferences.length,
      approvalRequired: approval.approvalRequired,
      reasonCodes: approval.reasonCodes
    }
  });
  return result.data;
}

export async function createRenewalScenario(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  scenarioType: RenewalScenarioType;
  name: string;
  calculation: ScenarioCalculationInput;
}) {
  const current = await decision(input.organizationId, input.decisionId);
  const values = calculateRenewalScenario(input.calculation);
  const result = await insertAdminRenewalScenario({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    decisionId: current.id,
    actorUserId: input.actorUserId,
    values: {
      scenario_type: input.scenarioType,
      name: input.name.trim().slice(0, 160),
      current_annual_cost: values.currentAnnualCost,
      annual_cost: values.annualCost,
      change_from_current_cost: values.changeFromCurrentCost,
      estimated_savings: values.estimatedSavings,
      one_time_transition_cost: values.oneTimeTransitionCost,
      net_first_year_effect: values.netFirstYearEffect,
      commitment_years: values.commitmentYears,
      multi_year_committed_cost: values.multiYearCommittedCost,
      currency: values.currency,
      exchange_rate_source: values.exchangeRateSource,
      evidence_refs: input.calculation.evidence ?? [],
      evidence_completeness: values.evidenceCompleteness
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal scenario was not created.");
  await audit({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    actorUserId: input.actorUserId,
    eventType: "renewal_workspace.scenario_created",
    metadata: {
      organizationId: input.organizationId, contractId: current.contract_id, decisionId: current.id,
      scenarioId: result.data.id, actorUserId: input.actorUserId, currency: result.data.currency,
      amount: result.data.annual_cost, evidenceCompleteness: result.data.evidence_completeness
    }
  });
  return result.data;
}

export async function selectPreferredRenewalScenario(input: {
  organizationId: string;
  decisionId: string;
  scenarioId: string;
  actorUserId: string;
}) {
  const current = await decision(input.organizationId, input.decisionId);
  const { data, error } = await createServerSupabaseClient().rpc("select_renewal_decision_scenario" as never, {
    p_organization_id: input.organizationId,
    p_decision_id: input.decisionId,
    p_scenario_id: input.scenarioId
  } as never);
  if (error) throw error;
  await audit({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    actorUserId: input.actorUserId,
    eventType: "renewal_workspace.preferred_scenario_selected",
    metadata: {
      organizationId: input.organizationId, contractId: current.contract_id, decisionId: current.id,
      scenarioId: String(data), actorUserId: input.actorUserId, materialChange: true
    }
  });
  return data;
}

export async function createRenewalTask(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  title: string;
  ownerUserId: string | null;
  dueAt: string | null;
  priority: RenewalTaskPriority;
  dependencyTaskId?: string | null;
  evidenceRequirement: string | null;
}) {
  const current = await decision(input.organizationId, input.decisionId);
  if (!input.title.trim()) throw new Error("Task title is required.");
  const result = await insertAdminRenewalWorkspaceTask({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    decisionId: current.id,
    actorUserId: input.actorUserId,
    values: {
      title: input.title.trim().slice(0, 200), owner_user_id: input.ownerUserId, due_at: input.dueAt,
      priority: input.priority, dependency_task_id: input.dependencyTaskId ?? null,
      evidence_requirement: input.evidenceRequirement?.trim().slice(0, 500) ?? null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal task was not created.");
  await audit({
    organizationId: input.organizationId, contractId: current.contract_id, actorUserId: input.actorUserId,
    eventType: "renewal_workspace.task_created",
    metadata: { organizationId: input.organizationId, contractId: current.contract_id, decisionId: current.id, taskId: result.data.id, actorUserId: input.actorUserId }
  });
  return result.data;
}

export async function transitionRenewalTask(input: {
  organizationId: string;
  decisionId: string;
  taskId: string;
  actorUserId: string;
  actorRole: string;
  status: RenewalTaskStatus;
  completionNote?: string | null;
}) {
  const current = await decision(input.organizationId, input.decisionId);
  const taskResult = await getAdminRenewalWorkspaceTask({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    taskId: input.taskId
  });
  if (taskResult.error) throw taskResult.error;
  if (!taskResult.data) throw new Error("Renewal task not found in the active organization.");
  assertRenewalTaskActorScope({
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    taskOwnerUserId: taskResult.data.owner_user_id,
    operation: "transition"
  });
  assertRenewalTaskTransition(taskResult.data.status, input.status);
  if (input.status === "completed" && taskResult.data.dependency_task_id) {
    const dependency = await getAdminRenewalWorkspaceTask({
      organizationId: input.organizationId,
      decisionId: input.decisionId,
      taskId: taskResult.data.dependency_task_id
    });
    if (dependency.error) throw dependency.error;
    if (!dependency.data || dependency.data.status !== "completed") {
      throw new Error("Renewal task dependency must be completed first.");
    }
  }
  const completed = input.status === "completed";
  const result = await updateAdminRenewalWorkspaceTask({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    taskId: input.taskId,
    values: {
      status: input.status,
      completion_note: input.completionNote?.trim().slice(0, 1000) ?? null,
      completed_by_user_id: completed ? input.actorUserId : null,
      completed_at: completed ? new Date().toISOString() : null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal task was not updated.");
  await audit({
    organizationId: input.organizationId, contractId: current.contract_id, actorUserId: input.actorUserId,
    eventType: "renewal_workspace.task_status_changed",
    metadata: { organizationId: input.organizationId, contractId: current.contract_id, decisionId: current.id, taskId: result.data.id, actorUserId: input.actorUserId, fromStatus: taskResult.data.status, toStatus: input.status }
  });
  return result.data;
}

export async function confirmRenewalOutcome(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  originalCost: number | null;
  finalAgreedCost: number | null;
  seatsBefore: number | null;
  seatsAfter: number | null;
  contractTermMonths: number | null;
  estimatedSavings: number | null;
  realizedSavings: number | null;
  avoidedCostIncrease: number | null;
  currency: string | null;
  decisionDate: string;
  renewalCompletedAt: string;
  evidenceReferences: RenewalEvidenceReference[];
}) {
  const current = await decision(input.organizationId, input.decisionId);
  validateEvidenceReferences(input.evidenceReferences);
  const { data, error } = await createServerSupabaseClient().rpc("record_renewal_decision_outcome" as never, {
    p_organization_id: input.organizationId,
    p_decision_id: input.decisionId,
    p_original_cost: input.originalCost,
    p_final_agreed_cost: input.finalAgreedCost,
    p_seats_before: input.seatsBefore,
    p_seats_after: input.seatsAfter,
    p_contract_term_months: input.contractTermMonths,
    p_estimated_savings: input.estimatedSavings,
    p_realized_savings: input.realizedSavings,
    p_avoided_cost_increase: input.avoidedCostIncrease,
    p_currency: input.currency?.toUpperCase() ?? null,
    p_decision_date: input.decisionDate,
    p_renewal_completed_at: input.renewalCompletedAt,
    p_evidence_refs: input.evidenceReferences
  } as never);
  if (error) throw error;
  await audit({
    organizationId: input.organizationId, contractId: current.contract_id, actorUserId: input.actorUserId,
    eventType: "renewal_workspace.outcome_confirmed",
    metadata: {
      organizationId: input.organizationId, contractId: current.contract_id, decisionId: current.id,
      outcomeId: String(data), actorUserId: input.actorUserId, decisionType: current.decision_type ?? "insufficient_information",
      decisionVersion: current.decision_version ?? 1, currency: input.currency, amount: input.realizedSavings,
      evidenceCount: input.evidenceReferences.length
    }
  });
  return data;
}

export async function listRenewalWorkspacePortfolio(input: { organizationId: string; limit?: number }) {
  const result = await listAdminRenewalPortfolio(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function listConfirmedRenewalOutcomes(input: {
  organizationId: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const result = await listAdminConfirmedRenewalOutcomes(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}
