import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import {
  getContracts,
  getDashboardMetrics,
  getCustomerOnboardingQueryEvidence,
  getOrganizationBilling
} from "@/lib/contracts/kernel-queries";
import {
  ACTIVATION_POLICY,
  conversionAnalysis,
  getUpgradePrompts
} from "@/lib/commercial/conversion";
import { getActivationStatus } from "@/lib/commercial/activation";
import { buildCustomerOnboardingProgress } from "@/lib/product/customer-onboarding-progress";
import { summarizeWorkflowGuardrails } from "@/lib/contracts/workflow-guardrails";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { UpgradePrompts } from "@/components/dashboard/upgrade-prompts";
import { OperationalPriorityPanel } from "@/components/dashboard/operational-priority-panel";
import { ContractsTable } from "@/components/contracts/contracts-table";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { organizationId } = await requireOrganization();
  const [metrics, contracts, billing, onboardingEvidence] = await Promise.all([
    getDashboardMetrics(organizationId),
    getContracts(organizationId, "all"),
    getOrganizationBilling(organizationId),
    getCustomerOnboardingQueryEvidence(organizationId)
  ]);
  const reviewedContracts = contracts.filter(
    (contract) => contract.contract_metadata?.needs_review === false
  ).length;
  const ownerAssignedContracts = contracts.filter(
    (contract) => contract.owner_name && contract.owner_name !== "Unassigned"
  ).length;
  const decisionCount = contracts.filter(
    (contract) => (contract.renewal_decision_status ?? "undecided") !== "undecided"
  ).length;
  const acknowledgedContractCount = contracts.filter((contract) => contract.last_acknowledged_at).length;
  const closedOrReopenedCycleCount = contracts.filter((contract) =>
    ["closed", "reopened"].includes(contract.cycle_status ?? "")
  ).length;
  const activationStatus = getActivationStatus({
    organizationCreatedAt: billing.created_at ?? billing.trial_started_at ?? null,
    totalContracts: metrics.totalContracts,
    reviewedContracts,
    ownerAssignedContracts,
    liveObligationCount: metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
    reminderCount: onboardingEvidence.trustedReminderCount,
    decisionCount,
    completedImportCount30d: onboardingEvidence.completedImportCount30d
  });
  const onboardingProgress = buildCustomerOnboardingProgress({
    organizationId,
    organizationCreatedAt: billing.created_at ?? billing.trial_started_at ?? null,
    planTier: billing.plan_tier,
    subscriptionStatus: billing.subscription_status,
    billingProvider: billing.billing_provider,
    trialEndsAt: billing.trial_ends_at,
    subscriptionCurrentPeriodEnd: billing.subscription_current_period_end,
    hasActiveOrganizationMembership: onboardingEvidence.hasActiveOrganizationMembership,
    totalContracts: metrics.totalContracts,
    reviewedContracts,
    ownerAssignedContracts,
    trustedReminderCount: onboardingEvidence.trustedReminderCount,
    liveObligationCount: metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
    decisionCount,
    completedExportCount: onboardingEvidence.completedExportCount,
    intelligenceViewCount: onboardingEvidence.intelligenceViewCount,
    acknowledgedContractCount,
    closedOrReopenedCycleCount
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Ex Umbris Renewal Defense</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">CFO Opt-Out Clock Dashboard</h1>
          <p className="mt-2 max-w-3xl text-muted">
            See which SaaS renewals can still be defended, where opt-out evidence is weak, and which owner or decision gap could turn into unwanted spend.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contracts/new">Add renewal evidence</Link>
        </Button>
      </section>
      <OperationalPriorityPanel
        firstValueSummary="Defense starts when every live renewal has reviewed dates, an accountable owner, and a visible opt-out or renewal decision path."
        items={[
          {
            label: "Evidence weak",
            count: guardrails.dueSoonNeedsReviewCount || metrics.needsReview,
            description: "Renewals still waiting for reviewed notice and expiration truth before the clock can be trusted.",
            href: "/dashboard/contracts?filter=needs_review",
            tone: metrics.needsReview > 0 ? "warning" : "safe"
          },
          {
            label: "Owner gap",
            count: ownerMissingCount,
            description: "Renewals without an accountable owner cannot enter a defensible opt-out loop.",
            href: "/dashboard/contracts",
            tone: ownerMissingCount > 0 ? "warning" : "safe"
          },
          {
            label: "Clock exposed",
            count: guardrails.dueSoonQueueCount || metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon,
            description: "Notice, renewal, and expiration obligations already inside the CFO working window.",
            href: "/dashboard/contracts?filter=active",
            tone:
              metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon > 0 ? "critical" : "safe"
          },
          {
            label: "Decision risk",
            count: guardrails.decisionNeededCount || decisionMissingCount,
            description: "Reviewed, owned renewals approaching live obligation without a recorded CFO-safe decision.",
            href: "/dashboard/contracts",
            tone: decisionMissingCount > 0 ? "urgent" : "safe"
          },
          {
            label: "Acknowledgment gap",
            count: guardrails.awaitingAcknowledgmentCount,
            description: "High-risk reminder acknowledgments still waiting on secure confirmation.",
            href: "/dashboard/contracts",
            tone: guardrails.awaitingAcknowledgmentCount > 0 ? "warning" : "safe"
          }
        ]}
      />
      <OnboardingChecklist
        items={onboardingProgress.milestones}
        firstValueMilestone={onboardingProgress.customerSafeSummary}
        activationStatus={activationStatus}
        activationWindowLabel={`Activation window: ${ACTIVATION_POLICY.activationWindowDays} days`}
      />
      <UpgradePrompts
        prompts={upgradePrompts}
        firstPaidValueMilestone={conversionAnalysis.firstPaidValueMilestone}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Defense file reviewed"
          value={`${reviewedContracts}/${metrics.totalContracts}`}
          accent="bg-brand-600"
          description="Contracts with CFO-trustworthy renewal dates."
        />
        <MetricCard
          label="Owner accountability"
          value={`${ownerAssignedContracts}/${metrics.totalContracts}`}
          accent="bg-warning"
          description="Renewals assigned to someone who can act."
        />
        <MetricCard
          label="Opt-out clock exposure"
          value={metrics.renewalsDueSoon + metrics.noticeDeadlinesDueSoon}
          accent="bg-critical"
          description="Live notice, renewal, or expiration obligations."
        />
        <MetricCard
          label="Decision exposure"
          value={decisionMissingCount}
          accent="bg-urgent"
          description="Reviewed renewals still missing a decision."
        />
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Renewal defense ledger</h2>
            <p className="mt-1 text-sm text-muted">Existing contract data, reframed around opt-out risk and decision readiness.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts">View all</Link>
          </Button>
        </div>
        <ContractsTable contracts={contracts as never[]} />
      </section>
    </>
  );
}
