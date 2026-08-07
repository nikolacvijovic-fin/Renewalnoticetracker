import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { requireOrganization } from "@/lib/auth";
import {
  buildRenewalCommandCenter,
  getRenewalCommandCenterContracts,
  type RenewalCommandSeverity,
  type RenewalRiskSegmentId
} from "@/lib/dashboard/renewal-command-center";
import {
  buildUrgentRenewalDashboard,
  type UrgentRenewalItemReason,
  type UrgentRenewalTrustStatus
} from "@/lib/dashboard/urgent-renewal-items";
import { getMyRenewalActionItems } from "@/lib/contracts/kernel-queries";
import { getSaasOptOutClock, getSaasRenewalImportReviewQueue } from "@/lib/saas/queries";

const SEVERITY_TONE: Record<RenewalCommandSeverity, "critical" | "urgent" | "warning" | "success"> = {
  critical: "critical",
  high: "urgent",
  medium: "warning",
  low: "success"
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function moneyWithCurrency(value: number | null, currency: string | null) {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDue(days: number | null) {
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)} days past`;
  if (days === 0) return "Today";
  return `${days} days`;
}

function formatDate(value: string | null) {
  if (!value) return "Not found";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

const URGENCY_REASON_LABELS: Record<UrgentRenewalItemReason, string> = {
  missed_notice_deadline: "Missed opt-out window",
  notice_deadline_due_today: "Due today",
  notice_deadline_due_7_days: "Due this week",
  notice_deadline_due_30_days: "Due this month",
  high_spend_at_risk: "High spend at risk",
  missing_owner: "Missing owner",
  missing_or_weak_notice_deadline: "Missing or weak deadline",
  needs_metadata_review: "Needs metadata review"
};

function urgencyTone(reason: UrgentRenewalItemReason): "critical" | "urgent" | "warning" | "success" {
  if (reason === "missed_notice_deadline" || reason === "notice_deadline_due_today") return "critical";
  if (reason === "notice_deadline_due_7_days" || reason === "high_spend_at_risk") return "urgent";
  if (
    reason === "notice_deadline_due_30_days" ||
    reason === "missing_owner" ||
    reason === "missing_or_weak_notice_deadline" ||
    reason === "needs_metadata_review"
  ) {
    return "warning";
  }
  return "success";
}

function trustLabel(status: UrgentRenewalTrustStatus) {
  if (status === "trusted") return "Trusted date";
  if (status === "missing_notice_deadline") return "Missing notice deadline";
  return "Needs review";
}

function trustTone(status: UrgentRenewalTrustStatus): "success" | "warning" | "critical" {
  if (status === "trusted") return "success";
  if (status === "missing_notice_deadline") return "critical";
  return "warning";
}

function intelligenceTone(severity: "info" | RenewalCommandSeverity): "critical" | "urgent" | "warning" | "success" {
  if (severity === "critical") return "critical";
  if (severity === "high") return "urgent";
  if (severity === "medium") return "warning";
  return "success";
}

function actionStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: { segment?: string };
}) {
  const { organizationId, user } = await requireOrganization();
  const [contracts, saasClock, saasImportBatches, myRenewalActions] = await Promise.all([
    getRenewalCommandCenterContracts(organizationId),
    getSaasOptOutClock(organizationId),
    getSaasRenewalImportReviewQueue(organizationId),
    getMyRenewalActionItems(organizationId, user.id, { limit: 5 })
  ]);
  const latestImportBatch = saasImportBatches[0] ?? null;
  const commandCenter = buildRenewalCommandCenter({
    organizationId,
    contracts,
    saasOptOutItems: saasClock.items.map((item) => ({
      contractId: item.contractId,
      deadlineWindow: item.deadlineWindow,
      workflowStatus: item.workflowStatus,
      ownerUserId: item.ownerUserId,
      spendAtRiskAmount: item.spendAtRiskAmount
    })),
    saasImportReview: latestImportBatch
      ? {
          latestBatchId: latestImportBatch.id,
          blockedBatchCount: saasImportBatches.filter((batch) => batch.needs_review_count + batch.rejected_count > 0).length,
          readyCount: latestImportBatch.rows.filter((row) => row.status === "ready").length,
          correctedCount: latestImportBatch.rows.filter((row) => row.status === "corrected").length,
          needsReviewCount: latestImportBatch.rows.filter((row) => row.status === "needs_review").length,
          rejectedCount: latestImportBatch.rows.filter((row) => row.status === "rejected").length
        }
      : null,
    segment: (searchParams?.segment as RenewalRiskSegmentId | undefined) ?? null
  });
  const urgentRenewals = buildUrgentRenewalDashboard({ contracts });
  const topAction = commandCenter.recommendedActions[0] ?? null;
  const filteredContracts = commandCenter.filteredSegment?.contracts ?? commandCenter.topRisks;

  if (commandCenter.totalContracts === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
          Renewal Command Center
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Start with one renewal contract</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          This dashboard becomes useful when it can evaluate real owner, evidence, deadline, and
          trusted-reminder state. Add one contract to build the first operating view.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard/contracts/new">Add renewal evidence</Link>
        </Button>
      </section>
    );
  }

  const allSafe =
    commandCenter.contractsBlockedFromTrustedReminder === 0 &&
    commandCenter.contractsPastNoticeDeadline === 0 &&
    commandCenter.contractsWithUpcomingNoticeDeadline === 0;

  return (
    <>
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            CFO Opt-Out Clock
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">What needs action today</h1>
          <p className="mt-2 max-w-3xl text-muted">
            The fastest view of missed opt-out windows, deadlines due this week, untrusted extraction,
            missing owners, and spend at risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts/urgent-deadlines/ics">Download urgent deadlines</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts/trusted-upcoming/ics">Download trusted dates</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/onboarding">View activation path</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Urgent this week"
          value={urgentRenewals.summary.urgentThisWeek}
          accent="bg-urgent"
          description="Trusted opt-out windows due in 7 days."
        />
        <MetricCard
          label="Due this month"
          value={urgentRenewals.summary.dueThisMonth}
          accent="bg-warning"
          description="Trusted notice deadlines inside 30 days."
        />
        <MetricCard
          label="Missed deadlines"
          value={urgentRenewals.summary.missedDeadlines}
          accent="bg-critical"
          description="Expired opt-out windows that need review."
        />
        <MetricCard
          label="Needs review"
          value={urgentRenewals.summary.needsReview}
          accent="bg-brand-600"
          description="Weak or unreviewed extracted metadata."
        />
        <MetricCard
          label="Unassigned owner"
          value={urgentRenewals.summary.unassignedOwners}
          accent="bg-locked"
          description="Contracts without an accountable owner."
        />
        <MetricCard
          label="Spend at risk"
          value={moneyWithCurrency(
            urgentRenewals.summary.spendAtRiskAmount,
            urgentRenewals.summary.spendAtRiskCurrency
          )}
          accent="bg-critical"
          description="Known value tied to open action items."
        />
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Assigned to me</Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                My renewal actions
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Owner queue</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Pending internal requests and contracts assigned to you. These are internal actions only,
              not vendor notices or external delivery.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/dashboard/contracts?owner=me">View assigned contracts</Link>
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {myRenewalActions.length > 0 ? (
            myRenewalActions.map((item) => (
              <Link
                key={`${item.contractId}:${item.requestId ?? "assigned"}`}
                href={item.href}
                className="block rounded-2xl border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.requestId ? "urgent" : "default"}>
                        {item.requestId ? "Action requested" : "Assigned contract"}
                      </Badge>
                      {item.needsReview ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Reviewed</Badge>}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm text-muted">{item.counterpartyName}</p>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[34rem]">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Notice deadline</p>
                      <p className="font-semibold text-ink">{formatDate(item.noticeDeadlineDate)}</p>
                      <p className="text-xs text-muted">{formatDue(item.daysToNoticeDeadline)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Renewal / expiration</p>
                      <p className="font-semibold text-ink">
                        {formatDate(item.renewalDate ?? item.expirationDate)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Request due</p>
                      <p className="font-semibold text-ink">{item.dueAt ? formatDate(item.dueAt) : "No due date"}</p>
                      <p className="text-xs text-muted">
                        {(item.requestedAction ?? "monitor").replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-muted">
              Nothing is assigned to you right now. When an operator requests a renewal decision, it will appear here.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="critical">Top 5</Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Opt-out priority queue
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Open these contracts first</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Trusted deadlines rank ahead of weak AI-derived dates. Missing or unreviewed dates stay visible as review blockers,
              not operational truth.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/dashboard/contracts">View all contracts</Link>
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {urgentRenewals.topUrgentItems.length > 0 ? (
            urgentRenewals.topUrgentItems.map((item) => (
              <Link
                key={item.contractId}
                href={item.primaryActionHref}
                className="block rounded-2xl border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={urgencyTone(item.primaryReason)}>
                        {URGENCY_REASON_LABELS[item.primaryReason]}
                      </Badge>
                      <Badge tone={trustTone(item.trustStatus)}>{trustLabel(item.trustStatus)}</Badge>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-ink">{item.contractTitle}</p>
                    <p className="mt-1 text-sm text-muted">{item.counterpartyName}</p>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[30rem]">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Notice deadline</p>
                      <p className="font-semibold text-ink">
                        {item.trustStatus === "trusted" ? formatDate(item.noticeDeadlineDate) : trustLabel(item.trustStatus)}
                      </p>
                      <p className="text-xs text-muted">{formatDue(item.daysLeft)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Renewal / expiration</p>
                      <p className="font-semibold text-ink">
                        {formatDate(item.renewalDate ?? item.expirationDate)}
                      </p>
                      <p className="text-xs text-muted">
                        {item.renewalDate ? "Renewal date" : item.expirationDate ? "Expiration date" : "Not found"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Spend at risk</p>
                      <p className="font-semibold text-ink">
                        {moneyWithCurrency(item.contractValueAmount, item.contractValueCurrency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-muted">Owner</p>
                      <p className="font-semibold text-ink">{item.ownerName ?? "Unassigned"}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-muted">
              {urgentRenewals.emptyState === "all_clear"
                ? "No urgent action is open. Keep reviewing newly uploaded contracts before trusting operational dates."
                : "No urgent contracts are ready to rank yet. Upload or review contracts so NoticeControl can build the Opt-Out Clock."}
            </div>
          )}
        </div>
      </section>

      {allSafe ? (
        <section className="rounded-3xl border border-success/20 bg-success/10 p-5 text-success">
          <p className="font-semibold">All active contracts are currently safe.</p>
          <p className="mt-1 text-sm">
            Trusted reminder coverage is healthy and no notice deadlines are inside the urgent window.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Readiness score"
          value={commandCenter.overallReadinessScore}
          accent="bg-brand-600"
          description="Average readiness across active renewal records."
        />
        <MetricCard
          label="Trusted reminder coverage"
          value={`${commandCenter.trustedReminderCoverage}%`}
          accent="bg-success"
          description={`${commandCenter.contractsWithTrustedReminder}/${commandCenter.activeContracts} contracts have an active clock.`}
        />
        <MetricCard
          label="Notice deadline risk"
          value={commandCenter.contractsPastNoticeDeadline + commandCenter.contractsWithUpcomingNoticeDeadline}
          accent="bg-critical"
          description="Past or upcoming opt-out windows needing attention."
        />
        <MetricCard
          label="Spend at risk"
          value={money(commandCenter.estimatedSpendAtRisk)}
          accent="bg-urgent"
          description="Estimated value tied to blocked, urgent, or high-risk contracts."
        />
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Decision Intelligence</Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Unified operating brain
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Trusted renewal decisions</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              One deterministic view of blockers, recommendations, trust gaps, accepted risks, and SaaS opt-out exposure.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Risk</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.overallRiskScore}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Trust</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.trustScore}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Confidence</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.confidenceScore}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Top blockers</p>
            <div className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.blockedActions.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <Badge tone={intelligenceTone(item.severity)}>{item.severity}</Badge>
                  <p className="mt-2 font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">{item.reason ?? "Blocked until review."}</p>
                </div>
              ))}
              {commandCenter.unifiedIntelligenceSummary.blockedActions.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">No decision blockers are open.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Recommendations</p>
            <div className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.recommendedActions.slice(0, 3).map((item) => (
                <div key={`${item.code}-${item.label}`} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <Badge tone={intelligenceTone(item.severity)}>{item.severity}</Badge>
                  <p className="mt-2 font-medium text-slate-900">{item.label}</p>
                </div>
              ))}
              {commandCenter.unifiedIntelligenceSummary.recommendedActions.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">No recommended action is open.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Why this matters</p>
            <ul className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.whyThisMatters.map((item) => (
                <li key={item} className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">{item}</li>
              ))}
              {commandCenter.unifiedIntelligenceSummary.acceptedRisks.length > 0 ? (
                <li className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-slate-700">
                  Accepted risks: {commandCenter.unifiedIntelligenceSummary.acceptedRisks.length}
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="urgent">Action Governance</Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Manual execution control
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Governed next steps</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Decisions become manual action queues with blockers, evidence requirements, role gates, and no-send protection.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Blocked</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.actionGovernance.blockedActions.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Ready</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.actionGovernance.readyActions.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Approval</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.actionGovernance.approvalRequiredActions.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-muted">Manual-only</p>
              <p className="text-xl font-semibold">{commandCenter.unifiedIntelligenceSummary.actionGovernance.noSendProtectedActions.length}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Blocked actions</p>
            <div className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.blockedActions.slice(0, 3).map((action) => (
                <div key={action.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={intelligenceTone(action.severity)}>{action.severity}</Badge>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      {actionStatusLabel(action.status)}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-muted">{action.blockedReason ?? "Blocked until required evidence is reviewed."}</p>
                </div>
              ))}
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.blockedActions.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">No governed actions are blocked.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Approval required</p>
            <div className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.approvalRequiredActions.slice(0, 3).map((action) => (
                <div key={action.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <Badge tone={intelligenceTone(action.severity)}>{action.requiredRole}</Badge>
                  <p className="mt-2 font-medium text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-muted">Allowed transition: {action.allowedTransitions[0]?.replaceAll("_", " ") ?? "review"}</p>
                </div>
              ))}
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.approvalRequiredActions.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">No action currently needs approval.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">No-send protected</p>
            <div className="mt-2 space-y-2">
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.noSendProtectedActions.slice(0, 3).map((action) => (
                <div key={action.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <Badge tone="warning">manual only</Badge>
                  <p className="mt-2 font-medium text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    Records human activity outside NoticeControl. NoticeControl does not send, contact, sequence, or sync.
                  </p>
                </div>
              ))}
              {commandCenter.unifiedIntelligenceSummary.actionGovernance.noSendProtectedActions.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 p-3 text-sm text-muted">No manual-notice action is currently queued.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {topAction ? (
        <section className="rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Badge tone={SEVERITY_TONE[topAction.severity]}>{topAction.severity}</Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Top recommended action
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold">{topAction.label}</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">{topAction.description}</p>
              <p className="mt-2 text-sm text-slate-700">
                {topAction.reason} Affects {topAction.affectedCount} contract
                {topAction.affectedCount === 1 ? "" : "s"} and {money(topAction.estimatedSpendAtRisk)}.
              </p>
            </div>
            <Button asChild>
              <Link href={topAction.targetHref}>Open action queue</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {commandCenter.saasImportReviewSummary.blockedRowCount > 0 ? (
        <section className="rounded-3xl border border-warning/30 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Import review</Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  SaaS renewal data quality
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold">SaaS import rows are blocked from activation</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                {commandCenter.saasImportReviewSummary.blockedRowCount} row
                {commandCenter.saasImportReviewSummary.blockedRowCount === 1 ? "" : "s"} need correction or dismissal before
                they can become trusted CFO Opt-Out Clock records across{" "}
                {commandCenter.saasImportReviewSummary.blockedBatchCount} blocked batch
                {commandCenter.saasImportReviewSummary.blockedBatchCount === 1 ? "" : "es"}.
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Needs review: {commandCenter.saasImportReviewSummary.needsReviewCount}. Rejected:{" "}
                {commandCenter.saasImportReviewSummary.rejectedCount}. Corrected and ready:{" "}
                {commandCenter.saasImportReviewSummary.correctedCount + commandCenter.saasImportReviewSummary.readyCount}.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/saas-opt-out-clock#import-review">Open import review</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {commandCenter.saasOptOutSummary.totalRiskItems > 0 ? (
        <section className="rounded-3xl border border-critical/20 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="critical">CFO Opt-Out Clock</Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  SaaS renewal defense
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold">SaaS renewals that can still be stopped</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                {commandCenter.saasOptOutSummary.totalRiskItems} SaaS opt-out item
                {commandCenter.saasOptOutSummary.totalRiskItems === 1 ? "" : "s"} need review,
                including {commandCenter.saasOptOutSummary.expiredCount} expired and{" "}
                {commandCenter.saasOptOutSummary.dueIn30DaysCount + commandCenter.saasOptOutSummary.dueIn7DaysCount} inside 30 days.
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Owner coverage: {commandCenter.saasOptOutSummary.assignedOwnerCount} assigned /{" "}
                {commandCenter.saasOptOutSummary.unassignedOwnerCount} unassigned. Spend at risk:{" "}
                {money(commandCenter.saasOptOutSummary.spendAtRiskAmount)}.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/saas-opt-out-clock">Open Opt-Out Clock</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {commandCenter.riskSegments.map((segment) => (
          <Link
            key={segment.id}
            href={segment.targetHref}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/30"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{segment.label}</p>
              <Badge tone={SEVERITY_TONE[segment.severity]}>{segment.count}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">{segment.recommendedAction}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {commandCenter.filteredSegment
                  ? commandCenter.filteredSegment.label
                  : "Top renewal risks"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Query-param drilldowns keep the command center focused without adding another page.
              </p>
            </div>
            {commandCenter.filteredSegment ? (
              <Button asChild variant="ghost">
                <Link href="/dashboard">Clear filter</Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-5 space-y-3">
            {filteredContracts.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 p-4 text-sm text-muted">
                No contracts in this segment.
              </p>
            ) : (
              filteredContracts.map((contract) => (
                <Link
                  key={contract.id}
                  href={`/dashboard/contracts/${contract.id}`}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{contract.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        Owner: {contract.ownerName} | Notice: {formatDue(contract.daysToNoticeDeadline)}
                      </p>
                    </div>
                    <Badge tone={SEVERITY_TONE[contract.severity]}>{contract.severity}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Spend: {money(contract.contractValueAmount)} | Evidence:{" "}
                    {Math.round(contract.evidenceConfidence * 100)}% | Blockers:{" "}
                    {contract.blockerCodes.length || "none"}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Upcoming notice deadlines</h2>
          <p className="mt-1 text-sm text-muted">Closest opt-out windows across active contracts.</p>
          <div className="mt-5 space-y-3">
            {commandCenter.upcomingDeadlines.slice(0, 8).map((contract) => (
              <Link
                key={contract.id}
                href={`/dashboard/contracts/${contract.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 text-sm hover:bg-slate-50"
              >
                <span className="font-semibold text-ink">{contract.title}</span>
                <span className={contract.pastNoticeDeadline ? "text-critical" : "text-muted"}>
                  {formatDue(contract.daysToNoticeDeadline)}
                </span>
              </Link>
            ))}
            {commandCenter.upcomingDeadlines.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 p-4 text-sm text-muted">
                No reviewed notice deadlines available yet.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Owner accountability</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4">Assigned</th>
                <th className="py-2 pr-4">Ready</th>
                <th className="py-2 pr-4">Blocked</th>
                <th className="py-2 pr-4">Urgent</th>
                <th className="py-2 pr-4">Spend at risk</th>
                <th className="py-2 pr-4">Top blocker</th>
              </tr>
            </thead>
            <tbody>
              {commandCenter.ownerWorkload.map((owner) => (
                <tr key={owner.ownerUserId ?? "unassigned"} className="border-t border-slate-200">
                  <td className="py-3 pr-4 font-semibold text-ink">{owner.ownerName}</td>
                  <td className="py-3 pr-4">{owner.totalAssignedContracts}</td>
                  <td className="py-3 pr-4">{owner.trustedReminderReadyCount}</td>
                  <td className="py-3 pr-4">{owner.blockedCount}</td>
                  <td className="py-3 pr-4">{owner.urgentCount}</td>
                  <td className="py-3 pr-4">{money(owner.estimatedSpendAtRisk)}</td>
                  <td className="py-3 pr-4">{owner.topBlocker ?? "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
