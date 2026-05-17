import Link from "next/link";
import { CONTRACT_FILTERS } from "@/lib/constants";
import { requireOrganization } from "@/lib/auth";
import {
  getContractFacets,
  getContracts,
  getOrganizationBilling
} from "@/lib/contracts/kernel-queries";
import {
  describeFinancialDrilldown,
  filterContractsForFinancialDrilldown
} from "@/lib/intelligence/financial/dashboard";
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
    financialView?: string;
    horizonDays?: string;
    counterpartyName?: string;
    unassignedOwner?: string;
    unassignedDepartment?: string;
    contractIds?: string;
    procurementView?: string;
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
  const financialDrilldownDescription = describeFinancialDrilldown(searchParams);
  const contractIds = new Set(
    (searchParams.contractIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const procurementDrilldownDescription = describeProcurementDrilldown(searchParams.procurementView);
  const filteredContracts = filterContractsForFinancialDrilldown(contracts, searchParams).filter(
    (contract) => contractIds.size === 0 || contractIds.has(contract.id ?? "")
  );

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Contracts</h1>
          <p className="mt-2 text-slate-500">
            {procurementDrilldownDescription ??
              financialDrilldownDescription ??
              "Filter by review status, expiring contracts, or auto-renewal behavior."}
          </p>
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
      <ContractsTable contracts={filteredContracts as never[]} />
    </section>
  );
}

function describeProcurementDrilldown(view: string | undefined) {
  switch (view) {
    case "top_vendors_exposure":
      return "Viewing the underlying contracts for one procurement exposure slice in the active organization.";
    case "vendor_due_soon":
      return "Viewing vendor contracts due soon in the active organization.";
    case "owner_gaps_by_department":
      return "Viewing contracts that still need owner assignment in the active organization.";
    case "decision_gaps_by_owner":
      return "Viewing contracts that still need a renewal decision in the active organization.";
    case "auto_renewals_needing_decision":
      return "Viewing auto-renewal contracts that still need a decision in the active organization.";
    case "duplicate_counterparty_cleanup":
      return "Viewing contracts tied to one duplicate vendor cleanup slice in the active organization.";
    case "renewal_outcome_history":
      return "Viewing contracts behind one renewal outcome slice in the active organization.";
    default:
      return null;
  }
}
