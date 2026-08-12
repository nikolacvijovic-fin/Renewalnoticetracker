import { requireOrganization } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import {
  commitSubscriptionUsageImportAction,
  runSubscriptionUsageReconciliationAction
} from "@/lib/actions/subscription-usage-optimization";

export default async function SubscriptionOptimizationPage() {
  const context = await requireOrganization();
  const snapshot = await getBillingSnapshot(context.organizationId);
  const access = await evaluateSubscriptionUsageOptimizationAccess(snapshot);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          Starter add-on
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Subscription Usage Optimization
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Import a SaaS usage CSV/XLSX file to produce reviewable savings findings for unused
          seats, low utilization, stale usage, and duplicate-product candidates before renewal.
          NoticeControl never cancels subscriptions or sends vendor messages from this workflow.
        </p>
      </section>

      {!access.allowed ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold">Add-on unavailable</h2>
          <p className="mt-2">{access.customerSafeMessage}</p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <form action={async (formData) => {
            "use server";
            await commitSubscriptionUsageImportAction(formData);
          }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Import usage file</h2>
            <p className="mt-2 text-sm text-slate-600">
              Required columns: vendor, product, category, annual_cost, currency, purchased_seats,
              assigned_seats, active_users_30d, active_users_90d, last_activity_at, department,
              owner, contract_reference.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="sourceLabel">
              Source label
            </label>
            <input
              id="sourceLabel"
              name="sourceLabel"
              required
              placeholder="Example: manually exported Okta usage CSV"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="file">
              CSV/XLSX file
            </label>
            <input
              id="file"
              name="file"
              required
              type="file"
              accept=".csv,.xlsx,.xls"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="mt-5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              Commit reviewed import
            </button>
          </form>

          <form action={async (formData) => {
            "use server";
            await runSubscriptionUsageReconciliationAction(String(formData.get("batchId") ?? ""));
          }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Run reconciliation</h2>
            <p className="mt-2 text-sm text-slate-600">
              Paste an import batch ID after commit. The Python add-on receives only bounded,
              organization-scoped normalized rows.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="batchId">
              Usage import batch ID
            </label>
            <input
              id="batchId"
              name="batchId"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Analyze usage
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
