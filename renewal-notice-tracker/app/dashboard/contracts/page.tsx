import Link from "next/link";
import { CONTRACT_FILTERS } from "@/lib/constants";
import { requireOrganization } from "@/lib/auth";
import {
  getContractFacets,
  getContracts,
  getOrganizationBilling
} from "@/lib/contracts/kernel-queries";
import { ContractFilters } from "@/components/contracts/contract-filters";
import { ContractsTable } from "@/components/contracts/contracts-table";
import { Button } from "@/components/ui/button";
import { CommercialNotice } from "@/components/billing/commercial-notice";
import {
  getCommercialNoticeFromCode,
  getFeatureAccessResult,
  normalizeBillingSnapshot
} from "@/lib/billing/entitlements";

export default async function ContractsPage({
  searchParams
}: {
  searchParams: {
    filter?: string;
    owner?: string;
    department?: string;
    statusTag?: string;
    commercial?: string;
  };
}) {
  const { organizationId } = await requireOrganization();
  const filter = CONTRACT_FILTERS.includes((searchParams.filter ?? "all") as never)
    ? (searchParams.filter ?? "all")
    : "all";
  const [contracts, facets, billing] = await Promise.all([
    getContracts(organizationId, filter as never, {
      ownerUserId: searchParams.owner,
      department: searchParams.department,
      statusTag: searchParams.statusTag
    }),
    getContractFacets(organizationId),
    getOrganizationBilling(organizationId)
  ]);
  const billingSnapshot = normalizeBillingSnapshot({
    organizationId,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider
  });
  const exportAccess = getFeatureAccessResult(billingSnapshot, "exports");
  const commercialNotice = getCommercialNoticeFromCode(searchParams.commercial);

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Contracts</h1>
          <p className="mt-2 text-slate-500">Filter by review status, expiring contracts, or auto-renewal behavior.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exportAccess.allowed ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/dashboard/contracts/export/csv">Export CSV</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/contracts/export/xlsx">Export Excel</Link>
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" disabled>
                Export CSV
              </Button>
              <Button type="button" variant="secondary" disabled>
                Export Excel
              </Button>
            </>
          )}
          <Button asChild>
            <Link href="/dashboard/contracts/new">Upload contract</Link>
          </Button>
        </div>
      </div>
      <CommercialNotice
        title="Commercial access"
        message={commercialNotice ?? (!exportAccess.allowed ? exportAccess.message : null)}
      />
      <ContractFilters
        facets={facets}
        current={{
          filter,
          owner: searchParams.owner ?? "",
          department: searchParams.department ?? "",
          statusTag: searchParams.statusTag ?? ""
        }}
      />
      <ContractsTable contracts={contracts as never[]} />
    </section>
  );
}
