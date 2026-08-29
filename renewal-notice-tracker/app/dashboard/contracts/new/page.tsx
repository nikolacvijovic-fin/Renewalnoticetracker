import { UploadContractForm } from "@/components/contracts/upload-contract-form";
import { CommercialNotice } from "@/components/billing/commercial-notice";
import { requireOrganization } from "@/lib/auth";
import {
  getOrganizationBilling,
  getOrganizationContractCount,
  getOrganizationMembers,
} from "@/lib/contracts/kernel-queries";
import { getLatestImportJobSummary } from "@/lib/contracts/import-jobs";
import {
  getContractTrackingLimitResult,
  getCommercialCapabilitySummary,
  getCommercialNoticeFromCode,
  getFeatureAccessResult,
  getAllowedReminderRecipients,
  normalizeBillingSnapshot
} from "@/lib/billing/entitlements";

export default async function NewContractPage({
  searchParams
}: {
  searchParams?: Promise<{
    commercial?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { organizationId } = await requireOrganization();
  const [members, billing, contractCount, latestImportJob] = await Promise.all([
    getOrganizationMembers(organizationId),
    getOrganizationBilling(organizationId),
    getOrganizationContractCount(organizationId),
    getLatestImportJobSummary(organizationId)
  ]);
  const billingSnapshot = normalizeBillingSnapshot({
    organizationId,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider
  });
  const manualContractsAccess = getFeatureAccessResult(billingSnapshot, "manual_contracts");
  const multiRecipientAccess = getFeatureAccessResult(billingSnapshot, "multi_recipient_reminders");
  const contractTrackingAccess = getContractTrackingLimitResult(billingSnapshot, contractCount);
  const commercialNotice = getCommercialNoticeFromCode(resolvedSearchParams?.commercial);
  const allowedReminderRecipients = getAllowedReminderRecipients(
    billingSnapshot,
    ["ops@example.com", "finance@example.com"],
    { strict: false }
  );

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Upload contract</h1>
        <p className="mt-2 text-slate-500">
          Start with one contract. Review only the essential fields, assign one owner, and turn one buried date into a live obligation before you expand the portfolio.
        </p>
      </div>
      <CommercialNotice
        title="Commercial access"
        message={commercialNotice ?? (!contractTrackingAccess.allowed ? contractTrackingAccess.message : null)}
      />
      <UploadContractForm
        commercial={{
          contractTrackingAccess,
          manualContractsAccess,
          multiRecipientAccess,
          capabilitySummary: getCommercialCapabilitySummary(billingSnapshot, [
            "manual_contracts",
            "multi_recipient_reminders"
          ]),
          maxReminderRecipients: multiRecipientAccess.allowed ? null : 1,
          recipientPlaceholder: allowedReminderRecipients.join(", ")
        }}
        members={members.map((member) => ({
          user_id: member.user_id,
          label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
        }))}
        latestImportJob={latestImportJob}
      />
    </section>
  );
}
