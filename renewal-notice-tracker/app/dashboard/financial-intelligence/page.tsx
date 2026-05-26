import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getContracts } from "@/lib/contracts/kernel-queries";
import { buildFinancialDashboardView } from "@/lib/intelligence/financial/dashboard";
import { buildFinancialIntelligenceViewedAuditPayload } from "@/lib/intelligence/financial/page-model";
import { FinancialExposureCard } from "@/components/dashboard/financial-exposure-card";
import { FinancialExposureBreakdown } from "@/components/dashboard/financial-exposure-breakdown";
import { auditFinancialIntelligenceViewed } from "@/lib/intelligence/audit";
import { requireIntelligencePageContext } from "@/lib/intelligence/page-access";

export default async function FinancialIntelligencePage() {
  const context = await requireIntelligencePageContext("financial_dashboard");

  const { organizationId } = context;
  const contracts = await getContracts(organizationId, "all");
  const view = buildFinancialDashboardView(contracts);
  await auditFinancialIntelligenceViewed(
    buildFinancialIntelligenceViewedAuditPayload({
      organizationId,
      actorUserId: context.user.id,
      contractCount: contracts.length,
      view
    })
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Financial Intelligence</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            See renewal exposure from reviewed workflow truth. Every figure stays linked to the contracts that need action.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts">Open contracts</Link>
        </Button>
      </div>

      {view.emptyState ? (
        <div className="panel rounded-3xl border border-dashed border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Financial exposure is empty until the workflow is trusted</h2>
          <p className="mt-2 text-sm text-slate-600">{view.emptyState}</p>
          <p className="mt-3 text-sm text-slate-500">
            Required for useful exposure: contract value amount, contract value currency, and at least one reviewed notice deadline, renewal date, or expiration date.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {view.cards.map((card) => (
          <FinancialExposureCard key={card.slug} card={card} />
        ))}
      </div>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-900">Trust and data warnings</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Low-trust values</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{view.lowTrustContractCount}</p>
            <p className="mt-1 text-sm text-slate-500">
              Imported or unreviewed contract values that should not be treated like finance-grade truth.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Missing value or currency</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{view.missingFinancialValueCount}</p>
            <p className="mt-1 text-sm text-slate-500">
              Contracts excluded because value or currency is still missing.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Warnings</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{view.warnings.length}</p>
            <p className="mt-1 text-sm text-slate-500">
              Multi-currency blocking and low-trust exclusions are shown before any amount is presented.
            </p>
          </div>
        </div>
        {view.warnings.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-amber-700">
            {view.warnings.slice(0, 6).map((warning) => (
              <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No active warning signals. Exposure is still limited to renewal-control decisions, not savings or forecast claims.
          </p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <FinancialExposureBreakdown
          title="Exposure by counterparty"
          description="Find which counterparties carry the largest reviewed renewal exposure."
          rows={view.exposureByCounterparty}
          emptyState="Counterparty exposure appears after contracts have reviewed financial values and renewal-control dates."
        />
        <FinancialExposureBreakdown
          title="Exposure by department"
          description="See which departments still carry the most reviewed renewal exposure."
          rows={view.exposureByDepartment}
          emptyState="Department exposure appears after contracts are tagged and financially reviewable."
        />
        <FinancialExposureBreakdown
          title="Exposure by owner"
          description="See which owners carry the largest reviewed renewal exposure."
          rows={view.exposureByOwner}
          emptyState="Owner exposure appears after contracts have an assigned owner and reviewed financial values."
        />
      </div>
    </section>
  );
}
