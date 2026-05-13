import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import {
  getContracts,
  getDashboardMetrics,
  getOrganizationBilling
} from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACTIVATION_POLICY,
  conversionAnalysis,
  getOnboardingChecklist,
  getUpgradePrompts
} from "@/lib/commercial/conversion";
import { getActivationStatus } from "@/lib/commercial/activation";
import { summarizeWorkflowGuardrails } from "@/lib/contracts/workflow-guardrails";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { UpgradePrompts } from "@/components/dashboard/upgrade-prompts";
import { OperationalPriorityPanel } from "@/components/dashboard/operational-priority-panel";
import { ContractsTable } from "@/components/contracts/contracts-table";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { organizationId } = await requireOrganization();
  const [metrics, contracts, billing] = await Promise.all([
    getDashboardMetrics(organizationId),
    getContracts(organizationId, "all"),
    getOrganizationBilling(organizationId)
  ]);
  const supabase = createServerSupabaseClient();
  const { count: completedImportCount30d } = await supabase
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["completed", "completed_with_errors"])
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const reviewedContracts = contracts.filter(
    (contract) => contract.contract_metadata?.needs_review === false
  ).length;
  const ownerAssignedContracts = contracts.filter(
    (contract) => contract.owner_name && contract.owner_name !== "Unassigned"
  ).length;
  const decisionCount = contracts.filter(
    (contract) => (contract.renewal_decision_status ?? "undecided") !== "undecided"
  ).length;
  const activationStatus = getActivationStatus({
    organizationCreatedAt: billing.created_at ?? billing.trial_started_at ?? null,
    totalContracts: metrics.totalContracts,
    reviewedContracts,
    ownerAssignedContracts,
    liveObligationCount: metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
    reminderCount: metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
    decisionCount,
    completedImportCount30d: completedImportCount30d ?? 0
  });
  const checklist = getOnboardingChecklist({
    organizationId,
    organizationCreatedAt: billing.created_at ?? billing.trial_started_at ?? null,
    planTier: billing.plan_tier,
    subscriptionStatus: billing.subscription_status,
    billingProvider: billing.billing_provider,
    trialEndsAt: billing.trial_ends_at,
    totalContracts: metrics.totalContracts,
    needsReview: metrics.needsReview,
    renewalsDueSoon: metrics.renewalsDueSoon,
    noticeDeadlinesDueSoon: metrics.noticeDeadlinesDueSoon,
    reviewedContracts,
    ownerAssignedContracts,
    reminderCount: metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
    decisionCount,
    completedImportCount30d: completedImportCount30d ?? 0
  });
  const upgradePrompts = getUpgradePrompts({
    organizationId,
    planTier: billing.plan_tier,
    subscriptionStatus: billing.subscription_status,
    billingProvider: billing.billing_provider,
    trialEndsAt: billing.trial_ends_at,
    totalContracts: metrics.totalContracts,
    needsReview: metrics.needsReview,
    renewalsDueSoon: metrics.renewalsDueSoon,
    noticeDeadlinesDueSoon: metrics.noticeDeadlinesDueSoon,
    reviewedContracts,
    ownerAssignedContracts
  });
  const ownerMissingCount = contracts.filter((contract) => contract.owner_name === "Unassigned").length;
  const decisionMissingCount = contracts.filter(
    (contract) =>
      (contract.renewal_decision_status ?? "undecided") === "undecided" &&
      !contract.contract_metadata?.needs_review
  ).length;
  const guardrails = summarizeWorkflowGuardrails(
    contracts.map((contract) => ({
      id: contract.id ?? "",
      created_at: contract.created_at ?? new Date(0).toISOString(),
      owner_user_id: contract.owner_user_id ?? null,
      renewal_decision_status: contract.renewal_decision_status ?? "undecided",
      cycle_status: contract.cycle_status ?? "open",
      contract_metadata: contract.contract_metadata
        ? {
            expiration_date: contract.contract_metadata.expiration_date,
            notice_deadline_date: contract.contract_metadata.notice_deadline_date,
            renewal_date: (contract.contract_metadata as { renewal_date?: string | null }).renewal_date ?? null,
            needs_review: contract.contract_metadata.needs_review,
            field_confidence:
              typeof contract.contract_metadata.field_confidence === "object" &&
              contract.contract_metadata.field_confidence !== null
                ? (contract.contract_metadata.field_confidence as Record<string, number>)
                : {},
            field_source_snippets: {}
          }
        : null
    }))
  );

  return (
    <>
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-slate-500">
            Run renewal operations: review uncertain contracts, assign owners, surface live obligations, and close decision gaps before deadlines slip.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contracts/new">Upload contract</Link>
        </Button>
      </section>
      <OperationalPriorityPanel
        firstValueSummary="First value happens when one contract is reviewed, one owner is assigned, and one live obligation is visible on the dashboard."
        items={[
          {
            label: "Needs Review",
            count: guardrails.dueSoonNeedsReviewCount || metrics.needsReview,
            description: "Contracts still waiting for reviewed P0 truth before reminders can be trusted.",
            href: "/dashboard/contracts?filter=needs_review",
            tone: metrics.needsReview > 0 ? "warning" : "success"
          },
          {
            label: "Owner Missing",
            count: ownerMissingCount,
            description: "Reviewed contracts without an owner cannot enter the trusted reminder loop.",
            href: "/dashboard/contracts",
            tone: ownerMissingCount > 0 ? "warning" : "success"
          },
          {
            label: "Due Soon",
            count: guardrails.dueSoonQueueCount || metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
            description: "Notice, renewal, and expiration obligations that already belong in the weekly working queue.",
            href: "/dashboard/contracts?filter=active",
            tone:
              metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon > 0 ? "danger" : "success"
          },
          {
            label: "Decision Needed",
            count: guardrails.decisionNeededCount || decisionMissingCount,
            description: "Reviewed, owned contracts approaching a live obligation but still missing an explicit decision.",
            href: "/dashboard/contracts",
            tone: decisionMissingCount > 0 ? "danger" : "success"
          },
          {
            label: "Awaiting Acknowledgment",
            count: guardrails.awaitingAcknowledgmentCount,
            description: "High-risk reminder acknowledgments still waiting on a secure user confirmation.",
            href: "/dashboard/contracts",
            tone: guardrails.awaitingAcknowledgmentCount > 0 ? "warning" : "success"
          }
        ]}
      />
      <OnboardingChecklist
        items={checklist}
        firstValueMilestone={conversionAnalysis.firstValueMilestone}
        activationStatus={activationStatus}
        activationWindowLabel={`Activation window: ${ACTIVATION_POLICY.activationWindowDays} days`}
      />
      <UpgradePrompts
        prompts={upgradePrompts}
        firstPaidValueMilestone={conversionAnalysis.firstPaidValueMilestone}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Reviewed coverage" value={`${reviewedContracts}/${metrics.totalContracts}`} accent="bg-brand-400" />
        <MetricCard label="Owner coverage" value={`${ownerAssignedContracts}/${metrics.totalContracts}`} accent="bg-amber-400" />
        <MetricCard label="Due-soon exposure" value={metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon} accent="bg-sky-400" />
        <MetricCard label="Decision gaps" value={decisionMissingCount} accent="bg-rose-400" />
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent contracts</h2>
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts">View all</Link>
          </Button>
        </div>
        <ContractsTable contracts={contracts as never[]} />
      </section>
    </>
  );
}
