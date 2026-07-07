import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createSaasContractTermAction, createSaasSoftwareAction } from "@/lib/actions/saas-renewal-defense";
import { getSaasOptOutClock, type SaasOptOutClockItem } from "@/lib/saas/queries";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";

function urgencyTone(item: SaasOptOutClockItem) {
  switch (item.urgency) {
    case "expired":
      return "bg-red-100 text-red-800";
    case "critical":
      return "bg-rose-100 text-rose-800";
    case "high":
      return "bg-amber-100 text-amber-800";
    case "medium":
      return "bg-sky-100 text-sky-800";
    case "low":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function urgencyLabel(item: SaasOptOutClockItem) {
  if (!item.optOutWindow) return "Missing deadline";
  if (item.urgency === "expired") return "Expired";
  if (item.urgency === "critical") return "Critical";
  if (item.urgency === "high") return "High";
  if (item.urgency === "medium") return "Medium";
  return "Low";
}

export default async function SaasOptOutClockPage() {
  const context = await requireOrganization();
  const clock = await getSaasOptOutClock(context.organizationId);
  const canWrite = ["admin", "operator"].includes(context.role);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">CFO Opt-Out Clock</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Track SaaS renewal-defense dates: software inventory, contract terms, opt-out windows, and risk findings. This slice records deadlines and risk only; it does not send notices or run external integrations.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts">Open contracts</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="SaaS products" value={clock.metrics.softwareCount} accent="bg-slate-400" />
        <MetricCard label="Open opt-out windows" value={clock.metrics.openWindowCount} accent="bg-sky-400" />
        <MetricCard label="Critical or expired" value={clock.metrics.criticalCount + clock.metrics.expiredCount} accent="bg-rose-400" />
        <MetricCard label="Missing notice dates" value={clock.metrics.missingNoticeDeadlineCount} accent="bg-amber-400" />
      </section>

      {canWrite ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <form action={createSaasSoftwareAction} className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add SaaS software</h2>
              <p className="mt-1 text-sm text-slate-500">
                Inventory records are scoped to the active organization.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Software name
                <input name="name" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Vendor
                <input name="vendor_name" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Category
                <input name="category" placeholder="CRM, security, finance, collaboration..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>
            <Button type="submit">Add software</Button>
          </form>

          <form action={createSaasContractTermAction} className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add contract terms</h2>
              <p className="mt-1 text-sm text-slate-500">
                Notice deadlines are either explicit or calculated from renewal/expiration date minus notice period.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Software
                <select name="software_id" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                  <option value="">Select software</option>
                  {clock.items.map((item) => (
                    <option key={item.software.id} value={item.software.id}>
                      {item.software.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Renewal date
                <input name="renewal_date" type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Expiration date
                <input name="expiration_date" type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Notice deadline
                <input name="notice_deadline_date" type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Notice value
                  <input name="notice_period_value" type="number" min="1" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Unit
                  <select name="notice_period_unit" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                    <option value="">Unit</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </label>
              </div>
              <label className="text-sm font-medium text-slate-700">
                Value amount
                <input name="contract_value_amount" type="number" min="0" step="0.01" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Currency
                <input name="contract_value_currency" placeholder="USD" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="auto_renewal" type="checkbox" className="rounded border-slate-300" />
                Auto-renewal applies
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Term summary
                <textarea name="term_summary" rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>
            <Button type="submit" disabled={clock.items.length === 0}>
              Add terms
            </Button>
          </form>
        </div>
      ) : (
        <div className="panel rounded-3xl border border-slate-200 p-5 text-sm text-slate-600">
          SaaS renewal-defense records are visible here. Ask an admin or operator to add or update software and terms.
        </div>
      )}

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Opt-out clock</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sorted by the closest active opt-out deadline for the active organization.
          </p>
        </div>
        {clock.items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            Add SaaS software to start tracking opt-out windows.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">Software</th>
                  <th className="px-5 py-3">Opt-out deadline</th>
                  <th className="px-5 py-3">Days</th>
                  <th className="px-5 py-3">Urgency</th>
                  <th className="px-5 py-3">Risks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clock.items.map((item) => (
                  <tr key={item.software.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{item.software.name}</p>
                      <p className="text-slate-500">
                        {[item.software.vendor_name, item.software.category].filter(Boolean).join(" · ") || "No vendor/category yet"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.optOutWindow?.opt_out_deadline ?? item.latestTerm?.notice_deadline_date ?? "Missing"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.daysUntilOptOut ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone(item)}`}>
                        {urgencyLabel(item)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.openFindings.length > 0 ? (
                        <ul className="space-y-1">
                          {item.openFindings.slice(0, 3).map((finding) => (
                            <li key={finding.id}>
                              {finding.finding_type.replaceAll("_", " ")} · {finding.severity}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "No open findings"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
