import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PdfUploadWorkbench } from "@/components/saas/pdf-upload-workbench";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth";
import {
  getOrganizationBilling,
  getOrganizationContractCount,
  getOrganizationMembers
} from "@/lib/contracts/kernel-queries";
import {
  getContractTrackingLimitResult,
  normalizeBillingSnapshot
} from "@/lib/billing/entitlements";

export default async function SaasOptOutClockPdfUploadPage() {
  const context = await requireOrganization();
  const [members, billing, contractCount] = await Promise.all([
    getOrganizationMembers(context.organizationId),
    getOrganizationBilling(context.organizationId),
    getOrganizationContractCount(context.organizationId)
  ]);
  const billingSnapshot = normalizeBillingSnapshot({
    organizationId: context.organizationId,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider
  });
  const contractTrackingAccess = getContractTrackingLimitResult(billingSnapshot, contractCount);
  const memberOptions = members.map((member) => ({
    userId: member.user_id,
    label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
  }));
  const currentUserIsMember = memberOptions.some((member) => member.userId === context.user.id);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            SaaS Renewal Defense
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            Upload contract PDFs
          </h1>
          <p className="mt-2 max-w-3xl text-muted">
            Add several SaaS contracts in one controlled batch. NoticeControl extracts renewal evidence,
            then keeps every operational date in human review until your team confirms it and explicitly
            activates the contract for the Opt-Out Clock.
          </p>
        </div>
        <Button asChild variant="secondary" className="gap-2">
          <Link href="/dashboard/saas-opt-out-clock">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Opt-Out Clock
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Files and extracted evidence stay scoped to the active organization. Weak, missing, inferred,
          or conflicting critical fields remain marked for review and do not become trusted deadlines automatically.
        </p>
      </div>

      <PdfUploadWorkbench
        members={memberOptions}
        defaultOwnerUserId={currentUserIsMember ? context.user.id : ""}
        canUpload={contractTrackingAccess.allowed}
        capacityMessage={contractTrackingAccess.message}
      />
    </section>
  );
}
