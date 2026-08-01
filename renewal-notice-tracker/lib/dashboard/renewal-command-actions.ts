export type RenewalCommandActionId =
  | "assign_owner_to_contracts"
  | "review_notice_deadlines"
  | "activate_trusted_reminders"
  | "request_trust_exception_approvals"
  | "approve_pending_trust_exceptions"
  | "review_auto_renew_high_value_contracts"
  | "resolve_past_notice_deadlines"
  | "import_missing_contract_metadata"
  | "review_saas_renewal_imports";

export type RenewalCommandActionSeverity = "critical" | "high" | "medium" | "low";

export type RenewalCommandAction = {
  id: RenewalCommandActionId;
  label: string;
  description: string;
  priority: number;
  severity: RenewalCommandActionSeverity;
  affectedContractIds: string[];
  affectedCount: number;
  estimatedSpendAtRisk: number;
  targetHref: string;
  reason: string;
  dueDate?: string | null;
};

export type RenewalCommandActionInput = {
  pastNoticeDeadlineContractIds: string[];
  upcomingNoticeDeadlineContractIds: string[];
  missingOwnerContractIds: string[];
  missingNoticeDeadlineContractIds: string[];
  weakEvidenceContractIds: string[];
  pendingApprovalContractIds: string[];
  reminderReadyContractIds: string[];
  highValueAutoRenewRiskContractIds: string[];
  spendByContractId: Record<string, number>;
  nearestDueDateByContractId?: Record<string, string | null>;
  saasImportReviewBlockedCount?: number;
};

function sumSpend(contractIds: string[], spendByContractId: Record<string, number>) {
  return contractIds.reduce((total, contractId) => total + (spendByContractId[contractId] ?? 0), 0);
}

function earliestDueDate(contractIds: string[], dueDates: Record<string, string | null> = {}) {
  return contractIds
    .map((contractId) => dueDates[contractId])
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? null;
}

function action(input: {
  id: RenewalCommandActionId;
  label: string;
  description: string;
  basePriority: number;
  severity: RenewalCommandActionSeverity;
  affectedContractIds: string[];
  targetHref: string;
  reason: string;
  spendByContractId: Record<string, number>;
  nearestDueDateByContractId?: Record<string, string | null>;
  countOverride?: number;
}): RenewalCommandAction {
  const estimatedSpendAtRisk = sumSpend(input.affectedContractIds, input.spendByContractId);
  const affectedCount = input.countOverride ?? input.affectedContractIds.length;
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    priority: input.basePriority + Math.min(30, Math.floor(estimatedSpendAtRisk / 10000)),
    severity: input.severity,
    affectedContractIds: input.affectedContractIds,
    affectedCount,
    estimatedSpendAtRisk,
    targetHref: input.targetHref,
    reason: input.reason,
    dueDate: earliestDueDate(input.affectedContractIds, input.nearestDueDateByContractId)
  };
}

export function buildRenewalCommandActions(
  input: RenewalCommandActionInput
): RenewalCommandAction[] {
  const actions: RenewalCommandAction[] = [];

  if ((input.saasImportReviewBlockedCount ?? 0) > 0) {
    actions.push(
      action({
        id: "review_saas_renewal_imports",
        label: "Review blocked SaaS import rows",
        description: "Correct or dismiss SaaS renewal import rows before they become trusted opt-out records.",
        basePriority: 82,
        severity: "high",
        affectedContractIds: [],
        countOverride: input.saasImportReviewBlockedCount,
        targetHref: "/dashboard/saas-opt-out-clock#import-review",
        reason: "Messy SaaS import rows cannot enter the CFO Opt-Out Clock without review evidence.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.pastNoticeDeadlineContractIds.length > 0) {
    actions.push(
      action({
        id: "resolve_past_notice_deadlines",
        label: "Resolve past notice deadlines",
        description: "Review missed opt-out windows and record the safest commercial decision path.",
        basePriority: 100,
        severity: "critical",
        affectedContractIds: input.pastNoticeDeadlineContractIds,
        targetHref: "/dashboard?segment=past_notice_deadline",
        reason: "Past notice deadlines are the highest-risk renewal exposure.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.upcomingNoticeDeadlineContractIds.length > 0) {
    actions.push(
      action({
        id: "review_notice_deadlines",
        label: "Review near notice deadlines",
        description: "Clear the contracts whose opt-out windows are inside the next 30 days.",
        basePriority: 90,
        severity: "critical",
        affectedContractIds: input.upcomingNoticeDeadlineContractIds,
        targetHref: "/dashboard?segment=urgent_notice_deadline",
        reason: "Near notice deadlines need action before the renewal clock closes.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.highValueAutoRenewRiskContractIds.length > 0) {
    actions.push(
      action({
        id: "review_auto_renew_high_value_contracts",
        label: "Review high-value auto-renew risk",
        description: "Confirm high-value auto-renew terms before unwanted spend locks in.",
        basePriority: 78,
        severity: "high",
        affectedContractIds: input.highValueAutoRenewRiskContractIds,
        targetHref: "/dashboard?segment=high_value_risk",
        reason: "High spend and auto-renewal risk should move ahead of routine cleanup.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.missingOwnerContractIds.length > 0) {
    actions.push(
      action({
        id: "assign_owner_to_contracts",
        label: "Assign owners to blocked contracts",
        description: "Every trusted reminder needs one accountable owner.",
        basePriority: 68,
        severity: "medium",
        affectedContractIds: input.missingOwnerContractIds,
        targetHref: "/dashboard?segment=missing_owner",
        reason: "Missing owners prevent acknowledgment and decision follow-through.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.pendingApprovalContractIds.length > 0) {
    actions.push(
      action({
        id: "approve_pending_trust_exceptions",
        label: "Decide pending trust exceptions",
        description: "Approve or reject requested low-confidence evidence exceptions.",
        basePriority: 64,
        severity: "high",
        affectedContractIds: input.pendingApprovalContractIds,
        targetHref: "/dashboard?segment=pending_approval",
        reason: "Requested exceptions cannot unlock trusted reminders until durable approval exists.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.weakEvidenceContractIds.length > 0) {
    actions.push(
      action({
        id: "request_trust_exception_approvals",
        label: "Fix weak evidence or request approval",
        description: "Strengthen evidence, or record a durable human exception where appropriate.",
        basePriority: 55,
        severity: "high",
        affectedContractIds: input.weakEvidenceContractIds,
        targetHref: "/dashboard?segment=weak_evidence",
        reason: "Weak evidence cannot become trusted workflow truth by itself.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.missingNoticeDeadlineContractIds.length > 0) {
    actions.push(
      action({
        id: "import_missing_contract_metadata",
        label: "Complete missing notice metadata",
        description: "Review contracts missing opt-out or notice deadlines.",
        basePriority: 50,
        severity: "medium",
        affectedContractIds: input.missingNoticeDeadlineContractIds,
        targetHref: "/dashboard?segment=blocked",
        reason: "Notice deadline gaps cap readiness and hide opt-out exposure.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  if (input.reminderReadyContractIds.length > 0) {
    actions.push(
      action({
        id: "activate_trusted_reminders",
        label: "Activate trusted reminders",
        description: "Create or regenerate trusted reminder schedules for contracts whose gates are clear.",
        basePriority: 45,
        severity: "medium",
        affectedContractIds: input.reminderReadyContractIds,
        targetHref: "/dashboard?segment=ready_for_reminder",
        reason: "Gate-clear contracts should not sit without an active reminder clock.",
        spendByContractId: input.spendByContractId,
        nearestDueDateByContractId: input.nearestDueDateByContractId
      })
    );
  }

  return actions.sort((left, right) => right.priority - left.priority);
}
