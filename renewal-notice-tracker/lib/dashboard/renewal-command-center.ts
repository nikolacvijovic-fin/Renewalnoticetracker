import { RENEWAL_READINESS_CONFIDENCE_THRESHOLD } from "@/lib/contracts/readiness-score";
import { evaluateTrustedReminderGate } from "@/lib/contracts/trusted-reminder-gate";
import {
  buildTrustExceptionApprovalGateEvidence,
  isTrustExceptionApprovalActive,
  type TrustExceptionApproval
} from "@/lib/contracts/trust-exception-approvals";
import {
  buildRenewalCommandActions,
  type RenewalCommandAction
} from "@/lib/dashboard/renewal-command-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type RenewalRiskSegmentId =
  | "safe"
  | "needs_review"
  | "blocked"
  | "urgent_notice_deadline"
  | "past_notice_deadline"
  | "weak_evidence"
  | "missing_owner"
  | "pending_approval"
  | "auto_renew_risk"
  | "high_value_risk"
  | "ready_for_reminder";

export type RenewalCommandSeverity = "critical" | "high" | "medium" | "low";

export type RenewalCommandContractInput = {
  id: string;
  title: string;
  status?: string | null;
  statusTag?: string | null;
  cycleStatus?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  renewalDate?: string | null;
  noticeDeadlineDate?: string | null;
  expirationDate?: string | null;
  autoRenewal?: boolean | null;
  needsReview?: boolean | null;
  hasWeakEvidence?: boolean | null;
  acceptedUnverifiedRiskRequested?: boolean | null;
  fieldConfidence?: Record<string, number> | null;
  contractValueAmount?: number | null;
  reminders?: Array<{ status?: string | null; remind_at?: string | null }> | null;
  trustExceptionApprovals?: TrustExceptionApproval[] | null;
};

export type RenewalCommandContractSummary = {
  id: string;
  title: string;
  ownerUserId: string | null;
  ownerName: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  daysToNoticeDeadline: number | null;
  contractValueAmount: number;
  evidenceConfidence: number;
  trustedReminderReady: boolean;
  hasActiveTrustedReminder: boolean;
  hasActiveTrustApproval: boolean;
  pendingTrustApproval: boolean;
  missingOwner: boolean;
  missingReviewedNoticeDeadline: boolean;
  weakEvidence: boolean;
  pastNoticeDeadline: boolean;
  upcomingNoticeDeadline: boolean;
  autoRenewRisk: boolean;
  highValueRisk: boolean;
  blockerCodes: string[];
  severity: RenewalCommandSeverity;
};

export type RenewalRiskSegment = {
  id: RenewalRiskSegmentId;
  label: string;
  count: number;
  contracts: RenewalCommandContractSummary[];
  severity: RenewalCommandSeverity;
  recommendedAction: string;
  targetHref: string;
};

export type RenewalOwnerWorkload = {
  ownerUserId: string | null;
  ownerName: string;
  totalAssignedContracts: number;
  trustedReminderReadyCount: number;
  blockedCount: number;
  urgentCount: number;
  nextActionCount: number;
  estimatedSpendAtRisk: number;
  oldestUnresolvedBlockerDays: number | null;
  topBlocker: string | null;
};

export type RenewalCommandCenter = {
  organizationId: string;
  generatedAt: string;
  overallReadinessScore: number;
  trustedReminderCoverage: number;
  totalContracts: number;
  activeContracts: number;
  contractsWithTrustedReminder: number;
  contractsBlockedFromTrustedReminder: number;
  contractsMissingOwner: number;
  contractsMissingReviewedNoticeDeadline: number;
  contractsWithWeakEvidence: number;
  contractsWithPendingTrustApproval: number;
  contractsWithActiveTrustApproval: number;
  contractsWithUpcomingNoticeDeadline: number;
  contractsPastNoticeDeadline: number;
  estimatedSpendAtRisk: number;
  topRisks: RenewalCommandContractSummary[];
  ownerWorkload: RenewalOwnerWorkload[];
  unassignedContracts: number;
  unassignedSpendAtRisk: number;
  recommendedOwnerActions: RenewalCommandAction[];
  upcomingDeadlines: RenewalCommandContractSummary[];
  recommendedActions: RenewalCommandAction[];
  riskSegments: RenewalRiskSegment[];
  filteredSegment: RenewalRiskSegment | null;
};

type RenewalCommandCenterContractRow = {
  id: string;
  status: string | null;
  status_tag: string | null;
  cycle_status: string | null;
  owner_user_id: string | null;
  contract_metadata:
    | {
        contract_title: string | null;
        renewal_date: string | null;
        notice_deadline_date: string | null;
        expiration_date: string | null;
        auto_renewal: boolean | null;
        needs_review: boolean | null;
        has_weak_evidence: boolean | null;
        accepted_unverified_risk_requested: boolean | null;
        field_confidence: unknown;
        contract_value_amount: number | null;
      }
    | Array<{
        contract_title: string | null;
        renewal_date: string | null;
        notice_deadline_date: string | null;
        expiration_date: string | null;
        auto_renewal: boolean | null;
        needs_review: boolean | null;
        has_weak_evidence: boolean | null;
        accepted_unverified_risk_requested: boolean | null;
        field_confidence: unknown;
        contract_value_amount: number | null;
      }>
    | null;
  reminders?: Array<{ status: string | null; remind_at: string | null }> | null;
  contract_trust_exception_approvals?: Database["public"]["Tables"]["contract_trust_exception_approvals"]["Row"][] | null;
};

const ACTIVE_REMINDER_STATUSES = new Set(["pending", "queued", "scheduled", "retry_pending", "sent"]);
const HIGH_VALUE_THRESHOLD = 25000;

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeConfidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, number>;
}

function evidenceConfidence(input: {
  needsReview?: boolean | null;
  hasWeakEvidence?: boolean | null;
  fieldConfidence?: Record<string, number> | null;
}) {
  if (input.needsReview || input.hasWeakEvidence) return 0;
  const values = Object.values(input.fieldConfidence ?? {}).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  if (values.length === 0) return 0.5;
  return clampConfidence(Math.min(...values));
}

function daysUntil(date: string | null | undefined, now: Date) {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function hasActiveTrustedReminder(reminders: RenewalCommandContractInput["reminders"]) {
  return (reminders ?? []).some((reminder) =>
    ACTIVE_REMINDER_STATUSES.has(String(reminder.status ?? "").toLowerCase())
  );
}

function severityFor(summary: Omit<RenewalCommandContractSummary, "severity">): RenewalCommandSeverity {
  if (summary.pastNoticeDeadline) return "critical";
  if (summary.upcomingNoticeDeadline && !summary.hasActiveTrustedReminder) return "critical";
  if (summary.highValueRisk || summary.autoRenewRisk) return "high";
  if (summary.weakEvidence || summary.pendingTrustApproval || summary.missingOwner) return "medium";
  return "low";
}

function summarizeContract(
  contract: RenewalCommandContractInput,
  now: Date
): RenewalCommandContractSummary {
  const activeApproval =
    [...(contract.trustExceptionApprovals ?? [])]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .find((approval) => isTrustExceptionApprovalActive(approval, now)) ?? null;
  const confidence = evidenceConfidence(contract);
  const hasActiveReminder = hasActiveTrustedReminder(contract.reminders);
  const gate = evaluateTrustedReminderGate({
    contractId: contract.id,
    ownerUserId: contract.ownerUserId ?? null,
    renewalDate: contract.renewalDate ?? null,
    noticeDeadline: contract.noticeDeadlineDate ?? null,
    autoRenewReviewed: !contract.needsReview && contract.autoRenewal !== null && contract.autoRenewal !== undefined,
    p0FieldsReviewed: !contract.needsReview,
    evidenceConfidence: confidence,
    leadDays: [90, 60, 30],
    unverifiedRiskApprovalRequested: Boolean(contract.acceptedUnverifiedRiskRequested),
    trustExceptionApproval: activeApproval ? buildTrustExceptionApprovalGateEvidence(activeApproval, now) : null
  });
  const daysToNoticeDeadline = daysUntil(contract.noticeDeadlineDate, now);
  const contractValueAmount = Math.max(0, Number(contract.contractValueAmount ?? 0));
  const weakEvidence = confidence < RENEWAL_READINESS_CONFIDENCE_THRESHOLD;
  const summaryWithoutSeverity = {
    id: contract.id,
    title: contract.title,
    ownerUserId: contract.ownerUserId ?? null,
    ownerName: contract.ownerName ?? "Unassigned",
    noticeDeadlineDate: contract.noticeDeadlineDate ?? null,
    renewalDate: contract.renewalDate ?? null,
    daysToNoticeDeadline,
    contractValueAmount,
    evidenceConfidence: confidence,
    trustedReminderReady: gate.canActivate,
    hasActiveTrustedReminder: hasActiveReminder,
    hasActiveTrustApproval: Boolean(activeApproval),
    pendingTrustApproval: Boolean(contract.acceptedUnverifiedRiskRequested) && !activeApproval,
    missingOwner: !contract.ownerUserId,
    missingReviewedNoticeDeadline: Boolean(contract.needsReview || !contract.noticeDeadlineDate),
    weakEvidence,
    pastNoticeDeadline: daysToNoticeDeadline !== null && daysToNoticeDeadline < 0,
    upcomingNoticeDeadline: daysToNoticeDeadline !== null && daysToNoticeDeadline >= 0 && daysToNoticeDeadline <= 30,
    autoRenewRisk: Boolean(contract.autoRenewal && (!hasActiveReminder || (weakEvidence && !activeApproval))),
    highValueRisk:
      contractValueAmount >= HIGH_VALUE_THRESHOLD &&
      ((weakEvidence && !activeApproval) || !hasActiveReminder || Boolean(contract.autoRenewal)),
    blockerCodes: gate.failures.map((failure) => failure.code)
  };

  return {
    ...summaryWithoutSeverity,
    severity: severityFor(summaryWithoutSeverity)
  };
}

function segment(
  id: RenewalRiskSegmentId,
  label: string,
  severity: RenewalCommandSeverity,
  contracts: RenewalCommandContractSummary[],
  recommendedAction: string
): RenewalRiskSegment {
  return {
    id,
    label,
    count: contracts.length,
    contracts,
    severity,
    recommendedAction,
    targetHref: `/dashboard?segment=${id}`
  };
}

function buildSegments(contracts: RenewalCommandContractSummary[]) {
  return [
    segment("safe", "Safe renewals", "low", contracts.filter((contract) =>
      contract.hasActiveTrustedReminder && contract.trustedReminderReady && !contract.weakEvidence
    ), "Keep owner accountability and decision hygiene current."),
    segment("needs_review", "Needs review", "medium", contracts.filter((contract) =>
      contract.blockerCodes.includes("p0_unreviewed")
    ), "Complete P0 review before trusting renewal workflow."),
    segment("blocked", "Blocked reminders", "high", contracts.filter((contract) =>
      !contract.trustedReminderReady
    ), "Clear the blocker preventing trusted reminder activation."),
    segment("urgent_notice_deadline", "Urgent notice deadline", "critical", contracts.filter((contract) =>
      contract.upcomingNoticeDeadline
    ), "Resolve near opt-out windows this week."),
    segment("past_notice_deadline", "Past notice deadline", "critical", contracts.filter((contract) =>
      contract.pastNoticeDeadline
    ), "Review missed windows and record the commercial decision path."),
    segment("weak_evidence", "Weak evidence", "high", contracts.filter((contract) =>
      contract.weakEvidence
    ), "Strengthen evidence or record a durable trust exception approval."),
    segment("missing_owner", "Missing owner", "medium", contracts.filter((contract) =>
      contract.missingOwner
    ), "Assign one accountable owner."),
    segment("pending_approval", "Pending approval", "high", contracts.filter((contract) =>
      contract.pendingTrustApproval
    ), "Approve or reject requested trust exceptions."),
    segment("auto_renew_risk", "Auto-renew risk", "high", contracts.filter((contract) =>
      contract.autoRenewRisk
    ), "Review auto-renew terms and deadline evidence."),
    segment("high_value_risk", "High-value risk", "high", contracts.filter((contract) =>
      contract.highValueRisk
    ), "Prioritize high-spend contracts before routine cleanup."),
    segment("ready_for_reminder", "Ready for reminder", "medium", contracts.filter((contract) =>
      contract.trustedReminderReady && !contract.hasActiveTrustedReminder
    ), "Activate trusted reminder clocks for gate-clear renewals.")
  ];
}

function ownerWorkload(contracts: RenewalCommandContractSummary[]): RenewalOwnerWorkload[] {
  const groups = new Map<string, RenewalCommandContractSummary[]>();
  for (const contract of contracts) {
    const key = contract.ownerUserId ?? "__unassigned__";
    groups.set(key, [...(groups.get(key) ?? []), contract]);
  }

  return Array.from(groups.entries()).map(([ownerUserId, rows]) => {
    const blocked = rows.filter((contract) => !contract.trustedReminderReady);
    const urgent = rows.filter((contract) => contract.pastNoticeDeadline || contract.upcomingNoticeDeadline);
    const topBlocker = blocked[0]?.blockerCodes[0] ?? null;
    const oldestUnresolvedBlockerDays = blocked
      .map((contract) => contract.daysToNoticeDeadline)
      .filter((days): days is number => typeof days === "number")
      .sort((left, right) => left - right)[0] ?? null;

    return {
      ownerUserId: ownerUserId === "__unassigned__" ? null : ownerUserId,
      ownerName: rows[0]?.ownerName ?? "Unassigned",
      totalAssignedContracts: rows.length,
      trustedReminderReadyCount: rows.filter((contract) => contract.trustedReminderReady).length,
      blockedCount: blocked.length,
      urgentCount: urgent.length,
      nextActionCount: blocked.length + urgent.length,
      estimatedSpendAtRisk: rows
        .filter((contract) => !contract.trustedReminderReady || contract.upcomingNoticeDeadline || contract.pastNoticeDeadline)
        .reduce((total, contract) => total + contract.contractValueAmount, 0),
      oldestUnresolvedBlockerDays,
      topBlocker
    };
  }).sort((left, right) => right.nextActionCount - left.nextActionCount);
}

function readinessScore(contracts: RenewalCommandContractSummary[]) {
  if (contracts.length === 0) return 0;
  const total = contracts.reduce((sum, contract) => {
    let score = 0;
    if (!contract.missingOwner) score += 15;
    if (!contract.missingReviewedNoticeDeadline) score += 20;
    if (!contract.weakEvidence) score += 20;
    if (contract.trustedReminderReady) score += 20;
    if (contract.hasActiveTrustedReminder) score += 25;
    return sum + score;
  }, 0);
  return Math.round(total / contracts.length);
}

export function buildRenewalCommandCenter(input: {
  organizationId: string;
  contracts: RenewalCommandContractInput[];
  segment?: RenewalRiskSegmentId | null;
  now?: Date;
}): RenewalCommandCenter {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const contractSummaries = input.contracts.map((contract) => summarizeContract(contract, now));
  const activeContracts = contractSummaries;
  const contractsWithTrustedReminder = activeContracts.filter((contract) => contract.hasActiveTrustedReminder);
  const contractsBlockedFromTrustedReminder = activeContracts.filter((contract) => !contract.trustedReminderReady);
  const spendByContractId = Object.fromEntries(
    activeContracts.map((contract) => [contract.id, contract.contractValueAmount])
  );
  const dueDates = Object.fromEntries(
    activeContracts.map((contract) => [contract.id, contract.noticeDeadlineDate])
  );
  const riskSegments = buildSegments(activeContracts);
  const recommendedActions = buildRenewalCommandActions({
    pastNoticeDeadlineContractIds: riskSegments.find((item) => item.id === "past_notice_deadline")?.contracts.map((contract) => contract.id) ?? [],
    upcomingNoticeDeadlineContractIds: activeContracts
      .filter((contract) => contract.upcomingNoticeDeadline && !contract.hasActiveTrustedReminder)
      .map((contract) => contract.id),
    missingOwnerContractIds: riskSegments.find((item) => item.id === "missing_owner")?.contracts.map((contract) => contract.id) ?? [],
    missingNoticeDeadlineContractIds: activeContracts
      .filter((contract) => contract.missingReviewedNoticeDeadline)
      .map((contract) => contract.id),
    weakEvidenceContractIds: activeContracts
      .filter((contract) => contract.weakEvidence && !contract.hasActiveTrustApproval && !contract.pendingTrustApproval)
      .map((contract) => contract.id),
    pendingApprovalContractIds: riskSegments.find((item) => item.id === "pending_approval")?.contracts.map((contract) => contract.id) ?? [],
    reminderReadyContractIds: activeContracts
      .filter((contract) => contract.trustedReminderReady && !contract.hasActiveTrustedReminder)
      .map((contract) => contract.id),
    highValueAutoRenewRiskContractIds: activeContracts
      .filter((contract) => contract.highValueRisk && contract.autoRenewRisk)
      .map((contract) => contract.id),
    spendByContractId,
    nearestDueDateByContractId: dueDates
  });
  const workloads = ownerWorkload(activeContracts);

  return {
    organizationId: input.organizationId,
    generatedAt,
    overallReadinessScore: readinessScore(activeContracts),
    trustedReminderCoverage:
      activeContracts.length === 0 ? 0 : Math.round((contractsWithTrustedReminder.length / activeContracts.length) * 100),
    totalContracts: contractSummaries.length,
    activeContracts: activeContracts.length,
    contractsWithTrustedReminder: contractsWithTrustedReminder.length,
    contractsBlockedFromTrustedReminder: contractsBlockedFromTrustedReminder.length,
    contractsMissingOwner: activeContracts.filter((contract) => contract.missingOwner).length,
    contractsMissingReviewedNoticeDeadline: activeContracts.filter((contract) => contract.missingReviewedNoticeDeadline).length,
    contractsWithWeakEvidence: activeContracts.filter((contract) => contract.weakEvidence).length,
    contractsWithPendingTrustApproval: activeContracts.filter((contract) => contract.pendingTrustApproval).length,
    contractsWithActiveTrustApproval: activeContracts.filter((contract) => contract.hasActiveTrustApproval).length,
    contractsWithUpcomingNoticeDeadline: activeContracts.filter((contract) => contract.upcomingNoticeDeadline).length,
    contractsPastNoticeDeadline: activeContracts.filter((contract) => contract.pastNoticeDeadline).length,
    estimatedSpendAtRisk: activeContracts
      .filter((contract) => !contract.trustedReminderReady || contract.upcomingNoticeDeadline || contract.pastNoticeDeadline || contract.highValueRisk)
      .reduce((total, contract) => total + contract.contractValueAmount, 0),
    topRisks: [...activeContracts]
      .filter((contract) => contract.severity !== "low")
      .sort((left, right) => {
        const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityRank[right.severity] - severityRank[left.severity] || right.contractValueAmount - left.contractValueAmount;
      })
      .slice(0, 8),
    ownerWorkload: workloads,
    unassignedContracts: workloads.find((workload) => workload.ownerUserId === null)?.totalAssignedContracts ?? 0,
    unassignedSpendAtRisk: workloads.find((workload) => workload.ownerUserId === null)?.estimatedSpendAtRisk ?? 0,
    recommendedOwnerActions: recommendedActions.filter((action) => action.id === "assign_owner_to_contracts"),
    upcomingDeadlines: [...activeContracts]
      .filter((contract) => contract.daysToNoticeDeadline !== null)
      .sort((left, right) => (left.daysToNoticeDeadline ?? 9999) - (right.daysToNoticeDeadline ?? 9999))
      .slice(0, 10),
    recommendedActions,
    riskSegments,
    filteredSegment: input.segment ? riskSegments.find((segment) => segment.id === input.segment) ?? null : null
  };
}

export async function getRenewalCommandCenterContracts(
  organizationId: string
): Promise<RenewalCommandContractInput[]> {
  const supabase = createServerSupabaseClient();
  const [contractsResult, membersResult] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        `
        id,
        status,
        status_tag,
        cycle_status,
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
          field_confidence,
          contract_value_amount
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
      .limit(250),
    supabase
      .from("memberships")
      .select("user_id, users(full_name, notification_email)")
      .eq("organization_id", organizationId)
  ]);

  if (contractsResult.error) throw contractsResult.error;
  if (membersResult.error) throw membersResult.error;

  const ownerLabels = new Map(
    ((membersResult.data ?? []) as Array<{
      user_id: string;
      users?: { full_name?: string | null; notification_email?: string | null } | null;
    }>).map((member) => [
      member.user_id,
      member.users?.full_name ?? member.users?.notification_email ?? member.user_id
    ])
  );

  return ((contractsResult.data ?? []) as RenewalCommandCenterContractRow[]).map((row) => {
    const metadata = first(row.contract_metadata);
    return {
      id: row.id,
      title: metadata?.contract_title ?? "Untitled contract",
      status: row.status,
      statusTag: row.status_tag,
      cycleStatus: row.cycle_status,
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_user_id ? ownerLabels.get(row.owner_user_id) ?? "Unknown owner" : "Unassigned",
      renewalDate: metadata?.renewal_date ?? null,
      noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
      expirationDate: metadata?.expiration_date ?? null,
      autoRenewal: metadata?.auto_renewal ?? null,
      needsReview: metadata?.needs_review ?? null,
      hasWeakEvidence: metadata?.has_weak_evidence ?? null,
      acceptedUnverifiedRiskRequested: metadata?.accepted_unverified_risk_requested ?? null,
      fieldConfidence: normalizeConfidence(metadata?.field_confidence),
      contractValueAmount: metadata?.contract_value_amount ?? null,
      reminders: row.reminders ?? [],
      trustExceptionApprovals:
        row.contract_trust_exception_approvals?.map((approval) => ({
          ...approval,
          approval_type: approval.approval_type as never
        })) ?? []
    };
  });
}
