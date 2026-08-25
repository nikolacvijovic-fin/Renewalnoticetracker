import Link from "next/link";
import { getFounderBetaReliabilityDashboard } from "@/lib/internal/repositories/admin-beta-reliability-repository";
import { getFounderEvidenceReadinessSummary } from "@/lib/evidence-readiness/evidence-readiness-service";
import { requireInternalRole } from "@/lib/internal-access";
import type { BetaOrganizationReliabilitySummary } from "@/lib/internal/beta-reliability";
import { updateCustomerFeedbackStatusFormAction } from "@/lib/actions/customer-feedback";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

function numberLabel(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function stageLabel(value: string) {
  return value.replaceAll("_", " ");
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{typeof value === "number" ? numberLabel(value) : value}</p>
    </div>
  );
}

const FILTER_LABELS = {
  sample_only: "Sample only",
  no_real_contract: "No real contract",
  activation_blocked: "Activation blocked",
  trial_ending_soon: "Trial ending soon",
  extraction_upload_failure: "Extraction/upload failure",
  reminder_email_failure: "Reminder/email failure",
  open_customer_feedback: "Open customer feedback",
  healthy_activated: "Healthy/activated"
} as const;

function feedbackLabel(value: string) {
  return value.replaceAll("_", " ");
}

function FeedbackStatusForm({
  feedbackId,
  organizationId,
  status,
  label
}: {
  feedbackId: string;
  organizationId: string;
  status: string;
  label: string;
}) {
  return (
    <ServerActionForm serverAction={updateCustomerFeedbackStatusFormAction}>
      <input type="hidden" name="feedback_id" value={feedbackId} />
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
        {label}
      </Button>
    </ServerActionForm>
  );
}

function OrganizationHealthRow({ organization }: { organization: BetaOrganizationReliabilitySummary }) {
  const metrics = organization.metrics;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">{organization.organizationName}</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              {stageLabel(organization.currentStage)}
            </span>
            {organization.stuckReason ? (
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-orange-700">
                {stageLabel(organization.stuckReason)}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                healthy
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Created {dateLabel(organization.createdAt)} · Last activity {dateLabel(metrics.lastActivityAt)}
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">{organization.nextRecommendedFounderAction}</p>
        </div>
        <div className="min-w-40 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <p className="font-medium text-slate-950">{organization.activationCompletionPercent}% activated</p>
          <p className="mt-1">{organization.completedSteps.length} of 9 steps complete</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contracts" value={metrics.contractCount} />
        <MetricCard label="Sample contracts" value={metrics.sampleContractCount} />
        <MetricCard label="PDF uploads" value={metrics.pdfUploadCount} />
        <MetricCard label="Extraction failures" value={metrics.extractionFailureCount + metrics.ocrFailureCount} />
        <MetricCard label="Needs review" value={metrics.contractsNeedingReviewCount} />
        <MetricCard label="Trusted deadlines" value={metrics.trustedNoticeDeadlinesCount} />
        <MetricCard label="Urgent deadlines" value={metrics.urgentDeadlineCount} />
        <MetricCard label="Owners assigned" value={metrics.ownerAssignmentCount} />
        <MetricCard label="Decisions" value={metrics.decisionCount} />
        <MetricCard label="Reminder/email sent" value={metrics.reminderEmailSuccessCount} />
        <MetricCard label="Reminder/email failed" value={metrics.reminderEmailFailureCount} />
        <MetricCard label="Calendar exports" value={metrics.calendarExportCount} />
        <MetricCard label="Skipped/duplicates" value={metrics.skippedReminderCount + metrics.duplicateReminderConflictCount} />
        <MetricCard label="Sample diagnostics" value={metrics.sampleDiagnosticIssueCount} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {organization.assistActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

type FounderBetaHealthPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function FounderBetaHealthPage({ searchParams }: FounderBetaHealthPageProps) {
  await requireInternalRole(["internal_admin", "internal_support"]);
  const resolvedSearchParams = await searchParams;
  const page = Number(Array.isArray(resolvedSearchParams?.page) ? resolvedSearchParams?.page[0] : resolvedSearchParams?.page);
  const search = Array.isArray(resolvedSearchParams?.q) ? resolvedSearchParams?.q[0] : resolvedSearchParams?.q;
  const filter = Array.isArray(resolvedSearchParams?.filter)
    ? resolvedSearchParams?.filter[0]
    : resolvedSearchParams?.filter;
  const dashboard = await getFounderBetaReliabilityDashboard({
    page: Number.isFinite(page) && page > 0 ? page : 1,
    search,
    filter: filter && filter in FILTER_LABELS ? (filter as keyof typeof FILTER_LABELS) : undefined
  });
  const evidenceReadiness = await getFounderEvidenceReadinessSummary({
    organizationIds: dashboard.organizations.map((organization) => organization.organizationId)
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-blue-700">Founder support</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Beta Reliability Dashboard</h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Internal-only view of beta activation, extraction health, reminder reliability, and contracts
          needing founder help. This is operational support telemetry, not customer-facing analytics.
        </p>
        {"page" in dashboard ? (
          <p className="mt-2 text-sm text-slate-500">
            Showing bounded page {dashboard.page.page} of beta organizations. Returned{" "}
            {numberLabel(dashboard.page.returnedOrganizationCount)} of{" "}
            {numberLabel(dashboard.page.totalOrganizationCount)} matching organization records; row signals are capped at{" "}
            {numberLabel(dashboard.page.rowLimitPerOrganization)} per organization.
          </p>
        ) : null}
      </div>

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" method="get">
        <div className="grid gap-3 lg:grid-cols-[1fr_260px_auto]">
          <label className="text-sm font-medium text-slate-700">
            Search organization
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="Organization name"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Filter
            <select
              name="filter"
              defaultValue={filter && filter in FILTER_LABELS ? filter : ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All bounded-page organizations</option>
              {Object.entries(FILTER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Beta organizations" value={dashboard.totals.organizationCount} />
        <MetricCard label="Activated" value={dashboard.totals.activatedCount} />
        <MetricCard label="Stalled" value={dashboard.totals.stalledCount} />
        <MetricCard label="Urgent deadlines" value={dashboard.totals.urgentDeadlineCount} />
        <MetricCard label="Needs review" value={dashboard.totals.contractsNeedingReviewCount} />
        <MetricCard label="Extraction failures" value={dashboard.totals.extractionFailureCount} />
        <MetricCard label="Reminder/email failures" value={dashboard.totals.reminderEmailFailureCount} />
        <MetricCard label="Open feedback" value={dashboard.feedback.openCount} />
        <MetricCard label="Urgent feedback" value={dashboard.feedback.urgentCount} />
        <MetricCard label="Generated" value={dateLabel(dashboard.generatedAt)} />
        <MetricCard label="Average evidence readiness" value={evidenceReadiness.averageReadinessScore === null ? "Not calculated" : `${evidenceReadiness.averageReadinessScore}/100`} />
        <MetricCard label="Evidence-blocked contracts" value={evidenceReadiness.blockedContractCount} />
        <MetricCard label="Stale provider connections" value={evidenceReadiness.staleProviderConnectionCount} />
        <MetricCard label="Unreviewed extraction backlog" value={evidenceReadiness.unreviewedExtractionBacklogCount} />
        <MetricCard label="Deadline approaching without ready evidence" value={evidenceReadiness.approachingDeadlineWithoutReadyEvidenceCount} />
        <MetricCard label="Upload to decision-ready" value={evidenceReadiness.averageUploadToDecisionReadyHours === null ? "Not enough history" : `${evidenceReadiness.averageUploadToDecisionReadyHours} hours`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Common evidence gaps</h2>
        <p className="mt-1 text-sm text-slate-500">Bounded, cross-organization counts only. No customer evidence content is exposed.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {evidenceReadiness.commonMissingEvidence.length ? evidenceReadiness.commonMissingEvidence.map((entry) => (
            <span key={entry.category} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {entry.category.replaceAll("_", " ")}: {entry.count}
            </span>
          )) : <span className="text-sm text-slate-500">No persisted evidence gaps on this bounded page.</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Customer feedback loop</h2>
            <p className="mt-1 text-sm text-slate-500">
              Open beta help requests from workflow surfaces. Messages are capped and shown for support triage;
              audit events keep only safe IDs, type, severity, and status.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <p>Open: {numberLabel(dashboard.feedback.openCount)}</p>
            <p>Urgent: {numberLabel(dashboard.feedback.urgentCount)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-950">By type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(dashboard.feedback.byType).length ? (
                Object.entries(dashboard.feedback.byType).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {feedbackLabel(type)}: {count}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No open feedback by type.</span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-950">By organization</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(dashboard.feedback.byOrganization).length ? (
                Object.entries(dashboard.feedback.byOrganization).map(([organization, count]) => (
                  <span key={organization} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {organization}: {count}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No open feedback by organization.</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {dashboard.feedback.latest.length ? (
            dashboard.feedback.latest.map((feedback) => (
              <article key={feedback.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {feedbackLabel(feedback.feedbackType)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {feedback.severity}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {feedback.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-950">{feedback.organizationName}</p>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">{feedback.messagePreview}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Submitted {dateLabel(feedback.createdAt)}
                      {feedback.contractId ? ` | Contract ${feedback.contractId}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {feedback.status === "open" ? (
                      <FeedbackStatusForm
                        feedbackId={feedback.id}
                        organizationId={feedback.organizationId}
                        status="in_review"
                        label="Mark in review"
                      />
                    ) : null}
                    {feedback.status !== "resolved" ? (
                      <FeedbackStatusForm
                        feedbackId={feedback.id}
                        organizationId={feedback.organizationId}
                        status="resolved"
                        label="Resolve"
                      />
                    ) : null}
                    {feedback.status !== "dismissed" ? (
                      <FeedbackStatusForm
                        feedbackId={feedback.id}
                        organizationId={feedback.organizationId}
                        status="dismissed"
                        label="Dismiss"
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No customer feedback has been submitted yet.
            </p>
          )}
        </div>
      </section>

      {dashboard.organizations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-950">No beta organizations found</h2>
          <p className="mt-2 text-sm text-slate-500">
            Once organizations sign up, their activation and reliability signals will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dashboard.organizations.map((organization) => (
            <OrganizationHealthRow key={organization.organizationId} organization={organization} />
          ))}
        </div>
      )}
    </section>
  );
}
