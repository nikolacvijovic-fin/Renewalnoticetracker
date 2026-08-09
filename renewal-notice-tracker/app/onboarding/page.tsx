import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth";
import { buildOrganizationActivationState } from "@/lib/onboarding/activation-state";
import { recordOrganizationActivationMilestonesOnce } from "@/lib/onboarding/activation-events";
import {
  buildBetaActivationChecklist,
  type BetaActivationChecklistStatus,
  type BetaSetupHealthStatus
} from "@/lib/onboarding/beta-activation-checklist";
import { getOrganizationActivationContracts } from "@/lib/onboarding/queries";

const STATE_LABELS: Record<string, string> = {
  empty_workspace: "Empty workspace",
  contracts_imported: "Contract imported",
  contract_selected: "Contract selected",
  owner_assigned: "Owner assigned",
  renewal_date_confirmed: "Renewal date confirmed",
  notice_deadline_confirmed: "Notice deadline confirmed",
  evidence_attached: "Evidence attached",
  evidence_reviewed: "Evidence reviewed",
  exception_approval_required: "Trust exception required",
  exception_approval_pending: "Approval pending",
  trusted_reminder_ready: "Trusted reminder ready",
  first_trusted_reminder_active: "First trusted reminder active",
  activated: "Activated"
};

function checklistTone(status: BetaActivationChecklistStatus): "success" | "warning" | "default" {
  if (status === "complete") return "success";
  if (status === "available") return "warning";
  return "default";
}

function checklistStatusLabel(status: BetaActivationChecklistStatus) {
  if (status === "complete") return "Done";
  if (status === "available") return "Next";
  return "Blocked";
}

function healthTone(status: BetaSetupHealthStatus): "success" | "warning" | "default" {
  if (status === "healthy") return "success";
  if (status === "needs_action") return "warning";
  return "default";
}

function healthLabel(status: BetaSetupHealthStatus) {
  if (status === "healthy") return "Ready";
  if (status === "needs_action") return "Check";
  if (status === "unknown") return "Verify";
  return "Blocked";
}

export default async function OnboardingPage() {
  const context = await requireOrganization();
  const contracts = await getOrganizationActivationContracts(context.organizationId);
  const activation = buildOrganizationActivationState({
    organizationId: context.organizationId,
    contracts
  });
  const betaChecklist = buildBetaActivationChecklist({
    activation
  });

  recordOrganizationActivationMilestonesOnce({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    state: activation
  }).catch(() => undefined);

  const riskTone =
    activation.riskLevel === "critical"
      ? "critical"
      : activation.riskLevel === "high"
        ? "urgent"
        : activation.riskLevel === "medium"
          ? "warning"
          : "success";

  return (
    <DashboardShell>
      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
              Activation path
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Get your first urgent renewal under control
            </h1>
            <p className="mt-2 max-w-3xl text-muted">
              Start with one PDF, confirm the opt-out deadline, assign responsibility, turn on internal
              reminders, and put the date on your calendar.
            </p>
          </div>
          <Badge tone={riskTone}>{activation.riskLevel.toUpperCase()} onboarding risk</Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Activation score
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-5xl font-semibold text-ink">{activation.percentComplete}</span>
              <span className="pb-2 text-sm font-semibold text-muted">/ 100</span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white">
              <div
                className="h-2 rounded-full bg-brand-600"
                style={{ width: `${activation.percentComplete}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-muted">
              Current state:{" "}
              <span className="font-semibold text-ink">
                {STATE_LABELS[activation.currentState] ?? activation.currentState}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
              Next best action
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {activation.nextBestAction.label}
            </h2>
            <p className="mt-2 text-sm text-muted">{activation.nextBestAction.description}</p>
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-semibold">Why now:</span> {activation.nextBestAction.reason}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href={activation.nextBestAction.targetHref}>Continue</Link>
              </Button>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                About {activation.nextBestAction.expectedTimeMinutes} min
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Beta activation checklist
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {betaChecklist.completedCount}/{betaChecklist.totalCount} steps complete
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">{betaChecklist.customerSafeSummary}</p>
          </div>
          {betaChecklist.firstIncompleteItem ? (
            <Button asChild>
              <Link href={betaChecklist.firstIncompleteItem.href}>
                {betaChecklist.firstIncompleteItem.label}
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          )}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {betaChecklist.items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-2xl border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{item.label}</p>
                <Badge tone={checklistTone(item.status)}>{checklistStatusLabel(item.status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{item.shortHelp}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Setup health
          </p>
          <h2 className="mt-2 text-lg font-semibold">Before relying on the clock</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {betaChecklist.setupChecks.map((check) => (
            <div key={check.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{check.label}</p>
                <Badge tone={healthTone(check.status)}>{healthLabel(check.status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{check.message}</p>
            </div>
          ))}
        </div>
      </section>

      {activation.currentState === "empty_workspace" ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">Upload your first contract PDF</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
            The first useful screen is one reviewed opt-out deadline with an internal owner. If extraction
            fails, enter the key dates manually and keep weak fields in review.
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/contracts/new">Upload first PDF</Link>
          </Button>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Path to first trusted reminder</h2>
              <p className="mt-1 text-sm text-muted">
                Computed from contract state, evidence confidence, durable approvals, and reminder readiness.
              </p>
            </div>
            {activation.hasActiveTrustedReminder ? <Badge tone="success">Reminder active</Badge> : null}
          </div>
          <div className="mt-5 space-y-3">
            {[...activation.completedSteps, ...activation.remainingSteps].map((step) => {
              const completed = activation.completedSteps.includes(step);
              return (
                <div
                  key={step}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <span className={completed ? "font-semibold text-ink" : "text-muted"}>
                    {STATE_LABELS[step] ?? step}
                  </span>
                  <Badge tone={completed ? "success" : "default"}>
                    {completed ? "Done" : "Remaining"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Current blocker</h2>
          {activation.recommendedContractId ? (
            <p className="mt-2 text-sm text-muted">
              Recommended contract:{" "}
              <Link
                href={`/dashboard/contracts/${activation.recommendedContractId}`}
                className="font-semibold text-brand-700 hover:underline"
              >
                {activation.recommendedContractTitle}
              </Link>
            </p>
          ) : null}
          {activation.daysToNoticeDeadline !== null ? (
            <p className="mt-2 text-sm text-muted">
              Days to notice deadline:{" "}
              <span className="font-semibold text-ink">{activation.daysToNoticeDeadline}</span>
            </p>
          ) : null}
          {activation.requiredEvidenceFields.length > 0 ? (
            <p className="mt-2 text-sm text-muted">
              Evidence fields to strengthen: {activation.requiredEvidenceFields.join(", ")}
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {activation.blockingReasons.slice(0, 4).map((reason) => (
              <div key={reason} className="rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
                {reason}
              </div>
            ))}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
