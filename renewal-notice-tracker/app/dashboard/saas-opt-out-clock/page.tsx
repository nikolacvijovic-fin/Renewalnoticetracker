import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import {
  activateReadySaasRenewalImportRowsFormAction,
  createSaasContractTermAction,
  createSaasSoftwareAction,
  updateSaasOptOutWindowWorkflowAction,
  updateSaasRiskFindingStatusAction
} from "@/lib/actions/saas-renewal-defense";
import { getOrganizationMembers } from "@/lib/contracts/kernel-queries";
import { getSaasOptOutClock, type SaasOptOutClockItem } from "@/lib/saas/queries";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";

function urgencyTone(item: SaasOptOutClockItem) {
  switch (item.urgency) {
    case "expired":
    case "critical":
      return "bg-critical/10 text-critical";
    case "high":
      return "bg-urgent/10 text-urgent";
    case "medium":
      return "bg-warning/15 text-amber-800";
    case "low":
      return "bg-success/10 text-success";
    default:
      return "bg-locked/10 text-locked";
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

function money(amount: number, currency: string | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

export default async function SaasOptOutClockPage() {
  const context = await requireOrganization();
  const [clock, members] = await Promise.all([
    getSaasOptOutClock(context.organizationId),
    getOrganizationMembers(context.organizationId)
  ]);
  const canWrite = ["admin", "operator"].includes(context.role);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">SaaS Renewal Defense</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">CFO Opt-Out Clock</h1>
          <p className="mt-2 max-w-3xl text-muted">
            Track which SaaS renewals can still be stopped, who owns the decision, what spend is at risk,
            and what action is due next. This stays inside renewal control: no external delivery or integrations.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts">Open contracts</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="SaaS products" value={clock.metrics.softwareCount} accent="bg-locked" />
        <MetricCard label="Critical or expired" value={clock.metrics.criticalCount + clock.metrics.expiredCount} accent="bg-critical" />
        <MetricCard label="Due within 30 days" value={clock.metrics.dueIn7DaysCount + clock.metrics.dueIn30DaysCount} accent="bg-urgent" />
        <MetricCard label="Spend at risk" value={money(clock.metrics.spendAtRiskAmount, clock.metrics.spendAtRiskCurrency)} accent="bg-warning" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Missing notice dates" value={clock.metrics.missingNoticeDeadlineCount} accent="bg-warning" />
        <MetricCard label="Due within 60 days" value={clock.metrics.dueIn60DaysCount} accent="bg-brand-600" />
        <MetricCard label="Assigned owners" value={clock.metrics.assignedOwnerCount} accent="bg-success" />
        <MetricCard label="Unassigned owners" value={clock.metrics.unassignedOwnerCount} accent="bg-critical" />
      </section>

      {canWrite ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <form action={activateReadySaasRenewalImportRowsFormAction} encType="multipart/form-data" className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import SaaS renewals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload the fixed SaaS renewal CSV/XLSX template. Only rows that pass cleanup are activated;
                rows with missing deadlines, weak evidence, duplicate signals, or unmapped owners stay out of the Opt-Out Clock.
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Required columns: vendor_name, product_name, renewal_date, notice_deadline_date,
              notice_period, contract_value_amount, contract_value_currency, owner_email,
              department_category, source_notes.
            </div>
            <label className="text-sm font-medium text-slate-700">
              CSV or XLSX file
              <input
                name="file"
                type="file"
                accept=".csv,.xlsx"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <Button type="submit">Activate ready rows</Button>
          </form>

          <form action={createSaasSoftwareAction} className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add SaaS software</h2>
              <p className="mt-1 text-sm text-slate-500">Inventory records are scoped to the active organization.</p>
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
                <input name="category" placeholder="Finance, security, collaboration..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>
            <Button type="submit">Add software</Button>
          </form>

          <form action={createSaasContractTermAction} className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add contract terms</h2>
              <p className="mt-1 text-sm text-slate-500">
                Notice deadlines are explicit or calculated from renewal/expiration date minus notice period.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Software
                <select name="software_id" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                  <option value="">Select software</option>
                  {clock.items.map((item) => (
                    <option key={item.software.id} value={item.software.id}>{item.software.name}</option>
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
            <Button type="submit" disabled={clock.items.length === 0}>Add terms</Button>
          </form>
        </div>
      ) : (
        <div className="panel rounded-3xl border border-line p-5 text-sm text-muted">
          SaaS renewal-defense records are visible here. Ask an admin or operator to add or update software and terms.
        </div>
      )}

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Opt-out queue</h2>
          <p className="mt-1 text-sm text-muted">Sorted by the closest active opt-out deadline for the active organization.</p>
        </div>
        {clock.items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Add SaaS software to start tracking opt-out windows.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">Software</th>
                  <th className="px-5 py-3">Deadline</th>
                  <th className="px-5 py-3">Urgency</th>
                  <th className="px-5 py-3">Owner / action</th>
                  <th className="px-5 py-3">Risks</th>
                  {canWrite ? <th className="px-5 py-3">Control</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clock.items.map((item) => (
                  <tr key={item.software.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{item.software.name}</p>
                      <p className="text-slate-500">
                        {[item.software.vendor_name, item.software.category].filter(Boolean).join(" | ") || "No vendor/category yet"}
                      </p>
                      {item.contractId ? (
                        <Link href={`/dashboard/contracts/${item.contractId}`} className="mt-1 block text-xs font-semibold text-brand-700">
                          Linked contract
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{item.optOutWindow?.opt_out_deadline ?? item.latestTerm?.notice_deadline_date ?? "Missing"}</p>
                      <p className="text-xs text-slate-500">{item.daysUntilOptOut ?? "-"} days</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone(item)}`}>
                        {urgencyLabel(item)}
                      </span>
                      <p className="mt-2 text-xs text-slate-500">{item.workflowStatus.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p className="font-medium">{item.ownerLabel}</p>
                      <p className="text-xs text-slate-500">{item.nextAction ?? "No next action recorded"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.openFindings.length > 0 || item.metadataConflicts.length > 0 ? (
                        <ul className="space-y-2">
                          {item.openFindings.slice(0, 3).map((finding) => (
                            <li key={finding.id}>
                              <span>{finding.finding_type.replaceAll("_", " ")} | {finding.severity}</span>
                              {canWrite ? (
                                <form action={updateSaasRiskFindingStatusAction} className="mt-1 flex gap-2">
                                  <input type="hidden" name="finding_id" value={finding.id} />
                                  <button name="status" value="resolved" className="text-xs font-semibold text-success">Resolve</button>
                                  <button name="status" value="accepted_risk" className="text-xs font-semibold text-urgent">Accept risk</button>
                                </form>
                              ) : null}
                            </li>
                          ))}
                          {item.metadataConflicts.length > 0 ? (
                            <li>{item.metadataConflicts.length} contract/SaaS metadata conflict{item.metadataConflicts.length === 1 ? "" : "s"}</li>
                          ) : null}
                        </ul>
                      ) : (
                        "No open findings"
                      )}
                    </td>
                    {canWrite ? (
                      <td className="px-5 py-4">
                        {item.optOutWindow ? (
                          <form action={updateSaasOptOutWindowWorkflowAction} className="space-y-2">
                            <input type="hidden" name="opt_out_window_id" value={item.optOutWindow.id} />
                            <select name="owner_user_id" defaultValue={item.ownerUserId ?? ""} className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs">
                              <option value="">Unassigned</option>
                              {members.map((member) => (
                                <option key={member.user_id} value={member.user_id}>
                                  {member.user?.full_name ?? member.user?.notification_email ?? member.user_id}
                                </option>
                              ))}
                            </select>
                            <input name="next_action" defaultValue={item.nextAction ?? ""} placeholder="Next action" className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                            <select name="workflow_status" defaultValue={item.workflowStatus} className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs">
                              {["needs_review", "ready", "owner_assigned", "decision_needed", "resolved", "accepted_risk", "ignored"].map((status) => (
                                <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                              ))}
                            </select>
                            <Button type="submit" variant="secondary">Update</Button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-500">Add terms first</span>
                        )}
                      </td>
                    ) : null}
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
