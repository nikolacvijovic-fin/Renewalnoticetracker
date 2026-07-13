import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth";
import { buildOrganizationActivationState } from "@/lib/onboarding/activation-state";
import { recordOrganizationActivationMilestonesOnce } from "@/lib/onboarding/activation-events";
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

export default async function OnboardingPage() {
  const context = await requireOrganization();
  const contracts = await getOrganizationActivationContracts(context.organizationId);
  const activation = buildOrganizationActivationState({
    organizationId: context.organizationId,
    contracts
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
              First trusted renewal reminder
            </h1>
            <p className="mt-2 max-w-3xl text-muted">
              This workspace activates when one real contract has reviewed dates, an accountable owner,
              trusted evidence or a durable approval, and an active reminder clock.
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

      {activation.currentState === "empty_workspace" ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">Start with one renewal contract</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
            Activation is measured from real renewal evidence, not demo checklist progress. Add one
            contract to begin the trusted reminder path.
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/contracts/new">Add first contract</Link>
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
