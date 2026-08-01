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

function formatDue(days: number | null) {
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)} days past`;
  if (days === 0) return "Today";
  return `${days} days`;
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: { segment?: string };
}) {
  const { organizationId } = await requireOrganization();
  const [contracts, saasClock, saasImportBatches] = await Promise.all([
    getRenewalCommandCenterContracts(organizationId),
    getSaasOptOutClock(organizationId),
    getSaasRenewalImportReviewQueue(organizationId)
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
            Renewal Command Center
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">This week&apos;s renewal risk</h1>
          <p className="mt-2 max-w-3xl text-muted">
            One operating view for trusted reminders, owner accountability, notice deadlines, and
            commercial exposure.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/onboarding">View activation path</Link>
        </Button>
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
