import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import {
  activateSaasRenewalImportRowAction,
  activateValidSaasRenewalImportBatchRowsFormAction,
  acceptSaasRenewalImportWeakEvidenceAction,
  bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction,
  confirmSaasRenewalImportDuplicateAction,
  correctSaasRenewalImportRowAction,
  createSaasContractTermAction,
  createSaasSoftwareAction,
  dismissSaasRenewalImportRowAction,
  previewSaasRenewalImportFormAction,
  resolveSaasMetadataConflictAction,
  updateSaasOptOutWindowWorkflowAction,
  updateSaasRiskFindingStatusAction
} from "@/lib/actions/saas-renewal-defense";
import { getOrganizationMembers } from "@/lib/contracts/kernel-queries";
import {
  getSaasOptOutClock,
  getSaasRenewalImportReviewQueue,
  type SaasOptOutClockItem,
  type SaasRenewalImportReviewRow
} from "@/lib/saas/queries";
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

function displayTrustedValue(value: string | number | boolean | null) {
  if (value === null || value === undefined || value === "") return "Not captured";
  return String(value);
}

const IMPORT_REVIEW_GROUPS = [
  { id: "ready", label: "Ready", statuses: ["ready", "corrected"] },
  { id: "needs_review", label: "Needs review", statuses: ["needs_review"] },
  { id: "rejected", label: "Rejected", statuses: ["rejected"] },
  { id: "closed", label: "Closed", statuses: ["activated", "dismissed"] }
] as const;

function rowsForGroup(rows: SaasRenewalImportReviewRow[], statuses: readonly string[]) {
  return rows.filter((row) => statuses.includes(row.status));
}

export default async function SaasOptOutClockPage() {
  const context = await requireOrganization();
  const [clock, members, importBatches] = await Promise.all([
    getSaasOptOutClock(context.organizationId),
    getOrganizationMembers(context.organizationId),
    getSaasRenewalImportReviewQueue(context.organizationId)
  ]);
  const canWrite = ["admin", "operator"].includes(context.role);
  const canResolveConflict = (item: SaasOptOutClockItem) =>
    ["admin", "operator", "reviewer"].includes(context.role) ||
    (context.role === "owner" && item.linkedContractOwnerUserId === context.user.id);

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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/dashboard/saas-opt-out-clock/ics">Download opt-out calendar</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts">Open contracts</Link>
          </Button>
        </div>
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
          <form action={previewSaasRenewalImportFormAction} encType="multipart/form-data" className="panel space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import SaaS renewals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload the fixed SaaS renewal CSV/XLSX template into a review batch. Rows are not trusted
                until they pass cleanup or receive explicit review evidence.
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
            <Button type="submit">Upload for review</Button>
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

      {canWrite ? (
        <section id="import-review" className="panel overflow-hidden p-0">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Import review queue</h2>
            <p className="mt-1 text-sm text-muted">
              Correct messy SaaS renewal rows before they become trusted Opt-Out Clock records.
              Weak evidence and duplicate signals stay blocked until explicitly reviewed.
            </p>
          </div>
          {importBatches.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No SaaS renewal imports are waiting for review.</div>
          ) : (
            <div className="space-y-5 p-5">
              {importBatches.map((batch) => (
                <div key={batch.id} className="rounded-3xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">{batch.original_filename}</p>
                      <p className="text-xs text-slate-500">
                        {batch.ready_count} ready | {batch.needs_review_count} needs review | {batch.rejected_count} rejected |
                        {" "}{batch.activated_count} activated | {batch.dismissed_count} dismissed of {batch.total_rows}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {batch.ready_count > 0 ? (
                        <form action={activateValidSaasRenewalImportBatchRowsFormAction}>
                          <input type="hidden" name="batch_id" value={batch.id} />
                          <Button type="submit" variant="secondary">Activate valid rows</Button>
                        </form>
                      ) : null}
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {batch.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Row</th>
                          <th className="px-4 py-3">Vendor / product</th>
                          <th className="px-4 py-3">Dates / owner</th>
                          <th className="px-4 py-3">Issues</th>
                          <th className="px-4 py-3">Correction</th>
                          <th className="px-4 py-3">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {IMPORT_REVIEW_GROUPS.flatMap((group) => {
                          const groupedRows = rowsForGroup(batch.rows, group.statuses);
                          if (groupedRows.length === 0) return [];
                          return [
                            <tr key={`${batch.id}-${group.id}`} className="bg-slate-50/70">
                              <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {group.label} ({groupedRows.length})
                              </td>
                            </tr>,
                            ...groupedRows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-4 align-top">
                              <p className="font-semibold text-slate-900">#{row.row_number}</p>
                              <p className="text-xs text-slate-500">{row.status.replaceAll("_", " ")}</p>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <p className="font-medium text-slate-900">{row.normalized?.vendorName || "Missing vendor"}</p>
                              <p className="text-slate-500">{row.normalized?.productName || "Missing product"}</p>
                              <p className="mt-1 text-xs text-slate-500">{row.normalized?.departmentCategory ?? "No category"}</p>
                            </td>
                            <td className="px-4 py-4 align-top text-slate-600">
                              <p>Renewal: {row.normalized?.renewalDate ?? "Missing"}</p>
                              <p>Notice: {row.normalized?.calculatedNoticeDeadline ?? "Missing"}</p>
                              <p>Owner: {row.normalized?.ownerLabel ?? row.normalized?.ownerEmail ?? "Unassigned"}</p>
                            </td>
                            <td className="px-4 py-4 align-top">
                              {row.issues.length === 0 ? (
                                <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">Ready</span>
                              ) : (
                                <ul className="space-y-1 text-xs text-slate-600">
                                  {row.issues.map((issue) => (
                                    <li key={`${row.id}-${issue.code}`} title={issue.message}>
                                      <span className={issue.severity === "error" ? "font-semibold text-critical" : "font-semibold text-urgent"}>
                                        {issue.code.replaceAll("_", " ")}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {row.status === "activated" ? (
                                <span className="text-xs text-slate-500">Activated</span>
                              ) : (
                                <form action={correctSaasRenewalImportRowAction} className="grid min-w-[260px] gap-2">
                                  <input type="hidden" name="row_id" value={row.id} />
                                  <input name="vendor_name" defaultValue={row.normalized?.vendorName ?? ""} placeholder="Vendor" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <input name="product_name" defaultValue={row.normalized?.productName ?? ""} placeholder="Product" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input name="renewal_date" type="date" defaultValue={row.normalized?.renewalDate ?? ""} className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                    <input name="notice_deadline_date" type="date" defaultValue={row.normalized?.noticeDeadlineDate ?? ""} className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  </div>
                                  <input name="notice_period" defaultValue={row.normalized?.noticePeriodValue && row.normalized.noticePeriodUnit ? `${row.normalized.noticePeriodValue} ${row.normalized.noticePeriodUnit}` : ""} placeholder="30 days" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input name="contract_value_amount" type="number" min="0" step="0.01" defaultValue={row.normalized?.contractValueAmount ?? ""} placeholder="Amount" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                    <input name="contract_value_currency" defaultValue={row.normalized?.contractValueCurrency ?? ""} placeholder="USD" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  </div>
                                  <input name="owner_email" defaultValue={row.normalized?.ownerEmail ?? ""} placeholder="owner@company.com" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <input name="department_category" defaultValue={row.normalized?.departmentCategory ?? ""} placeholder="Department/category" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <textarea name="source_notes" defaultValue={row.normalized?.sourceNotes ?? ""} placeholder="Source notes" rows={2} className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <textarea name="review_notes" placeholder="Safe review note, no private contract text" rows={2} className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                  <Button type="submit" variant="secondary">Recheck row</Button>
                                </form>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex min-w-[140px] flex-col gap-2">
                                {row.status === "ready" || row.status === "corrected" ? (
                                  <form action={activateSaasRenewalImportRowAction}>
                                    <input type="hidden" name="row_id" value={row.id} />
                                    <Button type="submit">Activate</Button>
                                  </form>
                                ) : null}
                                {row.issues.some((issue) => issue.code === "weak_evidence") ? (
                                  <form action={acceptSaasRenewalImportWeakEvidenceAction}>
                                    <input type="hidden" name="row_id" value={row.id} />
                                    <input type="hidden" name="review_notes" value="Weak evidence accepted for SaaS renewal import activation review." />
                                    <Button type="submit" variant="secondary">Accept weak evidence</Button>
                                  </form>
                                ) : null}
                                {row.issues.some((issue) => issue.code === "duplicate_suspected") ? (
                                  <form action={confirmSaasRenewalImportDuplicateAction}>
                                    <input type="hidden" name="row_id" value={row.id} />
                                    <input type="hidden" name="review_notes" value="Duplicate signal reviewed and confirmed as intentional." />
                                    <Button type="submit" variant="secondary">Confirm duplicate</Button>
                                  </form>
                                ) : null}
                                {row.status !== "activated" && row.status !== "dismissed" ? (
                                  <form action={dismissSaasRenewalImportRowAction}>
                                    <input type="hidden" name="row_id" value={row.id} />
                                    <input type="hidden" name="review_notes" value="Row dismissed during SaaS import review." />
                                    <button type="submit" className="text-left text-xs font-semibold text-critical">Dismiss row</button>
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                            ))
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

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
                            <li className="space-y-2">
                              <p>
                                {item.metadataConflicts.length} contract/SaaS metadata conflict
                                {item.metadataConflicts.length === 1 ? "" : "s"}
                              </p>
                              {item.latestTerm?.id && canResolveConflict(item) ? (
                                <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3">
                                  <form action={bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction} className="mb-3">
                                    <input type="hidden" name="saas_term_id" value={item.latestTerm.id} />
                                    <Button type="submit" variant="secondary">Use recommended defaults</Button>
                                  </form>
                                  <div className="space-y-3">
                                    {item.metadataConflicts.map((conflict) => (
                                      <div key={`${item.latestTerm!.id}-${conflict.field}`} className="space-y-2 border-t border-warning/20 pt-3 first:border-t-0 first:pt-0">
                                        <p className="font-semibold text-slate-900">
                                          {conflict.field.replaceAll("_", " ")} | {conflict.severity}
                                        </p>
                                        <p className="text-xs text-slate-600">
                                          Contract: {String(conflict.contractValue)} | SaaS: {String(conflict.saasValue)}
                                        </p>
                                        <p className="text-xs text-slate-500">{conflict.recommendationReason}</p>
                                        <div className="flex flex-wrap gap-2">
                                          <form action={resolveSaasMetadataConflictAction}>
                                            <input type="hidden" name="saas_term_id" value={item.latestTerm!.id} />
                                            <input type="hidden" name="field_name" value={conflict.field} />
                                            <input type="hidden" name="trusted_source" value="contract_metadata" />
                                            <input type="hidden" name="resolution_reason" value="Trusting reviewed contract metadata for this SaaS conflict." />
                                            <button type="submit" className="text-xs font-semibold text-brand-700">Trust contract</button>
                                          </form>
                                          <form action={resolveSaasMetadataConflictAction}>
                                            <input type="hidden" name="saas_term_id" value={item.latestTerm!.id} />
                                            <input type="hidden" name="field_name" value={conflict.field} />
                                            <input type="hidden" name="trusted_source" value="saas_term" />
                                            <input type="hidden" name="resolution_reason" value="Trusting reviewed SaaS term data for this field." />
                                            <button type="submit" className="text-xs font-semibold text-brand-700">Trust SaaS</button>
                                          </form>
                                        </div>
                                        <form action={resolveSaasMetadataConflictAction} className="grid gap-2">
                                          <input type="hidden" name="saas_term_id" value={item.latestTerm!.id} />
                                          <input type="hidden" name="field_name" value={conflict.field} />
                                          <input type="hidden" name="trusted_source" value="manual_override" />
                                          <input name="manual_override" placeholder="Manual trusted value" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                          <input name="resolution_reason" placeholder="Required reason for manual override" className="rounded-xl border border-slate-200 px-2 py-1 text-xs" />
                                          <button type="submit" className="text-left text-xs font-semibold text-urgent">Record manual override</button>
                                        </form>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-xs text-slate-500">
                                    Resolution changes trusted display behavior only. Raw contract and SaaS values remain unchanged for history.
                                  </p>
                                </div>
                              ) : null}
                            </li>
                          ) : null}
                          {item.trustedValueExplanations.length > 0 ? (
                            <li className="space-y-2 rounded-2xl border border-success/20 bg-success/5 p-3 text-xs text-slate-600">
                              <p className="font-semibold text-slate-900">
                                Trusted overlay evidence: {item.resolvedMetadataConflicts.length} human-resolved,{" "}
                                {item.metadataConflicts.length} recommended only.
                              </p>
                              <div className="space-y-2">
                                {item.trustedValueDetails.slice(0, 4).map((detail) => (
                                  <div key={`${item.software.id}-${detail.field}-${detail.trustedSource}`} className="rounded-xl bg-white/70 p-2">
                                    <p className="font-semibold text-slate-800">
                                      {detail.field.replaceAll("_", " ")} uses {detail.trustedSource.replaceAll("_", " ")}
                                      {detail.resolved ? " as trusted" : " recommendation"}
                                    </p>
                                    <p>
                                      Contract: {displayTrustedValue(detail.contractValue)} | SaaS: {displayTrustedValue(detail.saasValue)}
                                    </p>
                                    {detail.resolved ? (
                                      <p>
                                        Resolved by {detail.resolvedByLabel ?? "recorded reviewer"}
                                        {detail.resolvedAt ? ` on ${detail.resolvedAt.slice(0, 10)}` : ""}.
                                        {detail.resolutionReason ? ` Reason: ${detail.resolutionReason}` : ""}
                                      </p>
                                    ) : (
                                      <p>Recommended only. A permitted reviewer has not recorded a trust decision yet.</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </li>
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
