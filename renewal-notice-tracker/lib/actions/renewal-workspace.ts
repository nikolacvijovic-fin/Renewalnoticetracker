"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { getCommercialDecisionWorkbench } from "@/lib/commercial-decision-workbench/commercial-decision-workbench";
import type { CommercialDecisionEvidenceLink } from "@/lib/commercial-decision-workbench/decision-types";
import { getOrganizationMembers, requireScopedContract } from "@/lib/contracts/kernel-queries";
import {
  confirmRenewalOutcome,
  createRenewalScenario,
  createRenewalTask,
  selectPreferredRenewalScenario,
  transitionRenewalTask,
  updateRenewalDecisionProfile
} from "@/lib/renewal-workspace/renewal-workspace-service";
import {
  assertRenewalTaskActorScope,
  type RenewalEvidenceReference
} from "@/lib/renewal-workspace/renewal-workspace";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";
import { enforceDesignPartnerBetaMutation, type DesignPartnerBetaMutation } from "@/lib/billing/design-partner-beta";
import type { ShippedRuntimeAction } from "@/lib/product/action-matrix";
import {
  RENEWAL_SCENARIO_TYPES,
  RENEWAL_TASK_PRIORITIES,
  RENEWAL_TASK_STATUSES,
  type RenewalScenarioType,
  type RenewalTaskPriority,
  type RenewalTaskStatus
} from "@/lib/renewal-workspace/types";

export type RenewalWorkspaceActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code: string };

const workspacePath = (contractId: string) => `/dashboard/contracts/${contractId}/commercial-decision`;

function safeFailure(): RenewalWorkspaceActionResult {
  return {
    ok: false,
    message: "The renewal workspace change could not be completed safely.",
    code: "ERR_RENEWAL_WORKSPACE_ACTION_FAILED_001"
  };
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key}_must_be_non_negative`);
  return value;
}

function integerValue(formData: FormData, key: string) {
  const value = numberValue(formData, key);
  if (value === null) return null;
  if (!Number.isInteger(value)) throw new Error(`${key}_must_be_an_integer`);
  return value;
}

function evidenceType(link: CommercialDecisionEvidenceLink): RenewalEvidenceReference["evidenceType"] {
  if (link.evidence_type === "contract_metadata") return "reviewed_contract_metadata";
  if (link.evidence_type === "contract_extraction_field") return "contract_citation";
  if (link.evidence_type === "renewal_quote_comparison") return "uploaded_quote";
  return "reviewed_finding";
}

function evidenceReferences(links: CommercialDecisionEvidenceLink[]): RenewalEvidenceReference[] {
  return links.filter((link) => (link.confidence ?? 0) >= 0.7).map((link) => {
    const confidence = link.confidence ?? 0;
    return {
      evidenceType: evidenceType(link),
      evidenceId: link.evidence_id ?? link.id,
      label: link.evidence_label.slice(0, 200),
      reviewed: true,
      confidence
    };
  });
}

async function requireWorkspace(input: {
  contractId: string;
  decisionId: string;
  capability: ShippedRuntimeAction;
  betaMutation: DesignPartnerBetaMutation;
}) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, input.capability);
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: input.betaMutation });
  await requireScopedContract(input.contractId, context.organizationId);
  const workbench = await getCommercialDecisionWorkbench({
    organizationId: context.organizationId,
    contractId: input.contractId
  });
  if (!workbench.decision || workbench.decision.id !== input.decisionId) {
    throw new Error("Renewal decision does not belong to the scoped contract.");
  }
  return { context, workbench };
}

function revalidateWorkspace(contractId: string) {
  revalidatePath(workspacePath(contractId));
  revalidatePath("/dashboard/renewal-workspace");
}

export async function updateRenewalDecisionProfileAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context, workbench } = await requireWorkspace({ contractId, decisionId, capability: "manage_renewal_decision", betaMutation: "update_decision" });
    const decisionOwnerUserId = stringValue(formData, "decision_owner_user_id");
    const decisionType = stringValue(formData, "decision_type");
    const decisionDeadline = stringValue(formData, "decision_deadline");
    const rationale = stringValue(formData, "rationale");
    if (!decisionOwnerUserId || !decisionType || !decisionDeadline || !rationale) {
      throw new Error("required_decision_profile_field_missing");
    }
    const members = await getOrganizationMembers(context.organizationId);
    if (!members.some((member) => member.user_id === decisionOwnerUserId)) {
      throw new Error("decision_owner_must_be_an_active_organization_member");
    }
    await updateRenewalDecisionProfile({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      actorRole: context.role,
      decisionType,
      decisionOwnerUserId,
      decisionDeadline,
      rationale,
      estimatedFinancialEffect: numberValue(formData, "estimated_financial_effect"),
      currency: stringValue(formData, "currency"),
      evidenceReferences: evidenceReferences(workbench.evidenceLinks)
    });
    await recalculateEvidenceReadiness({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      trigger: "decision_profile_updated"
    }).catch(() => null);
    revalidateWorkspace(contractId);
    return { ok: true, message: "Renewal decision profile updated." };
  } catch {
    return safeFailure();
  }
}

export async function createRenewalScenarioAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context, workbench } = await requireWorkspace({ contractId, decisionId, capability: "manage_renewal_scenarios", betaMutation: "create_scenario" });
    const scenarioType = stringValue(formData, "scenario_type") as RenewalScenarioType | null;
    const name = stringValue(formData, "name");
    const currency = stringValue(formData, "currency");
    const annualCost = numberValue(formData, "annual_cost");
    if (!scenarioType || !RENEWAL_SCENARIO_TYPES.includes(scenarioType) || !name || !currency || annualCost === null) {
      throw new Error("invalid_scenario_input");
    }
    await createRenewalScenario({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      scenarioType,
      name,
      calculation: {
        currentAnnualCost: numberValue(formData, "current_annual_cost"),
        currentCurrency: stringValue(formData, "current_currency"),
        annualCost,
        currency,
        oneTimeTransitionCost: numberValue(formData, "one_time_transition_cost") ?? 0,
        commitmentYears: integerValue(formData, "commitment_years") ?? 1,
        exchangeRate: numberValue(formData, "exchange_rate"),
        exchangeRateSource: stringValue(formData, "exchange_rate_source"),
        evidence: evidenceReferences(workbench.evidenceLinks)
      }
    });
    revalidateWorkspace(contractId);
    return { ok: true, message: "Renewal scenario created." };
  } catch {
    return safeFailure();
  }
}

export async function selectPreferredRenewalScenarioAction(
  decisionId: string,
  contractId: string,
  scenarioId: string
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context } = await requireWorkspace({ contractId, decisionId, capability: "manage_renewal_scenarios", betaMutation: "select_scenario" });
    await selectPreferredRenewalScenario({
      organizationId: context.organizationId,
      decisionId,
      scenarioId,
      actorUserId: context.user.id
    });
    await recalculateEvidenceReadiness({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      trigger: "preferred_scenario_selected"
    }).catch(() => null);
    revalidateWorkspace(contractId);
    return { ok: true, message: "Preferred scenario selected; prior approval no longer applies." };
  } catch {
    return safeFailure();
  }
}

export async function createRenewalTaskAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context } = await requireWorkspace({ contractId, decisionId, capability: "manage_renewal_tasks", betaMutation: "create_task" });
    assertRenewalTaskActorScope({
      actorRole: context.role,
      actorUserId: context.user.id,
      operation: "create"
    });
    const priority = (stringValue(formData, "priority") ?? "medium") as RenewalTaskPriority;
    if (!RENEWAL_TASK_PRIORITIES.includes(priority)) throw new Error("invalid_task_priority");
    const ownerUserId = stringValue(formData, "owner_user_id");
    if (ownerUserId) {
      const members = await getOrganizationMembers(context.organizationId);
      if (!members.some((member) => member.user_id === ownerUserId)) {
        throw new Error("task_owner_must_be_an_active_organization_member");
      }
    }
    await createRenewalTask({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      title: stringValue(formData, "title") ?? "",
      ownerUserId,
      dueAt: stringValue(formData, "due_at"),
      priority,
      dependencyTaskId: stringValue(formData, "dependency_task_id"),
      evidenceRequirement: stringValue(formData, "evidence_requirement")
    });
    revalidateWorkspace(contractId);
    return { ok: true, message: "Renewal task created." };
  } catch {
    return safeFailure();
  }
}

export async function transitionRenewalTaskAction(
  decisionId: string,
  contractId: string,
  taskId: string,
  formData: FormData
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context } = await requireWorkspace({ contractId, decisionId, capability: "manage_renewal_tasks", betaMutation: "update_task" });
    const status = stringValue(formData, "status") as RenewalTaskStatus | null;
    if (!status || !RENEWAL_TASK_STATUSES.includes(status)) throw new Error("invalid_task_status");
    await transitionRenewalTask({
      organizationId: context.organizationId,
      decisionId,
      taskId,
      actorUserId: context.user.id,
      actorRole: context.role,
      status,
      completionNote: stringValue(formData, "completion_note")
    });
    revalidateWorkspace(contractId);
    return { ok: true, message: "Renewal task updated." };
  } catch {
    return safeFailure();
  }
}

export async function confirmRenewalOutcomeAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<RenewalWorkspaceActionResult> {
  try {
    const { context, workbench } = await requireWorkspace({ contractId, decisionId, capability: "confirm_financial_outcome", betaMutation: "confirm_outcome" });
    const decisionDate = stringValue(formData, "decision_date");
    const renewalCompletedAt = stringValue(formData, "renewal_completed_at");
    if (!decisionDate || !renewalCompletedAt) throw new Error("outcome_dates_required");
    await confirmRenewalOutcome({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      originalCost: numberValue(formData, "original_cost"),
      finalAgreedCost: numberValue(formData, "final_agreed_cost"),
      seatsBefore: integerValue(formData, "seats_before"),
      seatsAfter: integerValue(formData, "seats_after"),
      contractTermMonths: integerValue(formData, "contract_term_months"),
      estimatedSavings: numberValue(formData, "estimated_savings"),
      realizedSavings: numberValue(formData, "realized_savings"),
      avoidedCostIncrease: numberValue(formData, "avoided_cost_increase"),
      currency: stringValue(formData, "currency"),
      decisionDate,
      renewalCompletedAt,
      evidenceReferences: evidenceReferences(workbench.evidenceLinks)
    });
    revalidateWorkspace(contractId);
    return { ok: true, message: "Confirmed renewal outcome recorded." };
  } catch {
    return safeFailure();
  }
}

export async function updateRenewalDecisionProfileFormAction(decisionId: string, contractId: string, formData: FormData) {
  await updateRenewalDecisionProfileAction(decisionId, contractId, formData);
}

export async function createRenewalScenarioFormAction(decisionId: string, contractId: string, formData: FormData) {
  await createRenewalScenarioAction(decisionId, contractId, formData);
}

export async function selectPreferredRenewalScenarioFormAction(
  decisionId: string,
  contractId: string,
  scenarioId: string
) {
  await selectPreferredRenewalScenarioAction(decisionId, contractId, scenarioId);
}

export async function createRenewalTaskFormAction(decisionId: string, contractId: string, formData: FormData) {
  await createRenewalTaskAction(decisionId, contractId, formData);
}

export async function transitionRenewalTaskFormAction(
  decisionId: string,
  contractId: string,
  taskId: string,
  formData: FormData
) {
  await transitionRenewalTaskAction(decisionId, contractId, taskId, formData);
}

export async function confirmRenewalOutcomeFormAction(decisionId: string, contractId: string, formData: FormData) {
  await confirmRenewalOutcomeAction(decisionId, contractId, formData);
}

export async function refreshEvidenceReadinessAction(contractId: string): Promise<RenewalWorkspaceActionResult> {
  try {
    const context = await requireOrganization();
    await assertCanUseShippedAction(context, "review_renewal_evidence");
    await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "create_findings" });
    await requireScopedContract(contractId, context.organizationId);
    await recalculateEvidenceReadiness({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      trigger: "explicit_refresh"
    });
    revalidateWorkspace(contractId);
    return { ok: true, message: "Evidence readiness refreshed." };
  } catch {
    return safeFailure();
  }
}

export async function refreshEvidenceReadinessFormAction(contractId: string) {
  await refreshEvidenceReadinessAction(contractId);
}
