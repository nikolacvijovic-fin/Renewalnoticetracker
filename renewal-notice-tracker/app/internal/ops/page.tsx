import { AdminPanel, type InternalBillingSummary } from "@/components/admin/admin-panel";
import {
  getAdminDebugData,
  getAdminOperationalSnapshot,
  getOrganizationBilling,
  getPrivacyOperationsSnapshot
} from "@/lib/internal/ops-queries";
import { requireInternalRole } from "@/lib/internal-access";
import { getBillingProviderLabel } from "@/lib/billing/provider";
import { getBillingProviderPolicy } from "@/lib/billing/provider-policy";

function buildBillingSummary(billing: Awaited<ReturnType<typeof getOrganizationBilling>>): InternalBillingSummary {
  const status = billing.billing_subscription_status ?? billing.subscription_status ?? "unknown";
  const policy = getBillingProviderPolicy(billing.billing_provider);
  const providerLabel = getBillingProviderLabel(policy.provider);
  const issues: string[] = [];

  if (policy.state === "support_led_exception") {
    issues.push("Workspace is on a support-led billing exception path.");
  }

  if (policy.state === "legacy_migration_only" || policy.state === "disabled") {
    issues.push("Workspace is on a legacy or disabled billing path.");
  }

  if (["past_due", "unpaid", "paused", "cancelled", "incomplete"].includes(status)) {
    issues.push(`Subscription status ${status} needs support follow-up.`);
  }

  if (
    billing.plan_tier !== "free" &&
    billing.billing_provider === "paddle" &&
    !billing.billing_subscription_id
  ) {
    issues.push("Paid workspace is missing a Paddle subscription id.");
  }

  return {
    providerLabel,
    planTier: billing.plan_tier,
    status,
    currentPeriodEnd: billing.billing_current_period_end ?? billing.subscription_current_period_end ?? null,
    issues
  };
}

export default async function InternalOpsPage({
  searchParams
}: {
  searchParams?: { organizationId?: string };
}) {
  const { role } = await requireInternalRole(["internal_support", "internal_admin"]);
  const organizationId = searchParams?.organizationId?.trim() ?? "";
  if (!organizationId) {
    return (
      <section className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold">Internal Ops</h1>
          <p className="mt-2 text-slate-500">
            Internal-only tooling requires an explicit `organizationId` query parameter.
          </p>
        </div>
      </section>
    );
  }

  const [snapshot, debug, billing, privacyTraces] = await Promise.all([
    getAdminOperationalSnapshot(organizationId),
    getAdminDebugData(organizationId),
    getOrganizationBilling(organizationId),
    getPrivacyOperationsSnapshot(organizationId)
  ]);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Internal Ops</h1>
        <p className="mt-2 text-slate-500">
          Internal-only rescue console for reminder delivery, imports, extraction issues, billing
          exceptions, and operational traces.
        </p>
      </div>
      <AdminPanel
        internalRole={role}
        organizationId={organizationId}
        snapshot={{
          ...snapshot,
          topReminderStatuses: snapshot.topReminderStatuses as Array<[string, number]>
        }}
        debug={debug}
        billing={buildBillingSummary(billing)}
        privacyTraces={privacyTraces}
      />
    </section>
  );
}
