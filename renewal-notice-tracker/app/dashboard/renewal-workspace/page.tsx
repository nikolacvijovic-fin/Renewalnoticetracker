import { requireOrganization } from "@/lib/auth";
import { getOrganizationMembers } from "@/lib/contracts/kernel-queries";
import { listRenewalWorkspacePortfolio } from "@/lib/renewal-workspace/renewal-workspace-service";
import { attachEvidenceReadinessToPortfolio, filterRenewalPortfolio, normalizeRenewalPortfolioRows } from "@/lib/renewal-workspace/portfolio";
import { RENEWAL_DECISION_TYPES } from "@/lib/renewal-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { listEvidenceReadinessPortfolio } from "@/lib/evidence-readiness/evidence-readiness-service";
import { EVIDENCE_CATEGORIES, EVIDENCE_READINESS_STATES } from "@/lib/evidence-readiness/types";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] ?? "" : input ?? "";
}

function title(input: string) {
  return input.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RenewalWorkspacePortfolioPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const context = await requireOrganization();
  const [rows, members, readinessAssessments] = await Promise.all([
    listRenewalWorkspacePortfolio({ organizationId: context.organizationId, limit: 200 }),
    getOrganizationMembers(context.organizationId),
    listEvidenceReadinessPortfolio({ organizationId: context.organizationId, limit: 500 })
  ]);
  const allItems = attachEvidenceReadinessToPortfolio(normalizeRenewalPortfolioRows(rows), readinessAssessments);
  const items = filterRenewalPortfolio(allItems, {
    owner: value(searchParams.owner),
    vendor: value(searchParams.vendor),
    decisionType: value(searchParams.decisionType),
    approvalState: value(searchParams.approvalState),
    risk: value(searchParams.risk),
    currency: value(searchParams.currency),
    department: value(searchParams.department),
    readinessState: value(searchParams.readinessState),
    missingEvidenceCategory: value(searchParams.missingEvidenceCategory)
  });
  const totals = (field: "expectedSavings" | "confirmedSavings") => items.reduce<Record<string, number>>((result, item) => {
    if (!item.currency || item[field] === null) return result;
    result[item.currency] = (result[item.currency] ?? 0) + item[field];
    return result;
  }, {});
  const formatTotals = (values: Record<string, number>) => Object.entries(values)
    .map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`).join(" · ") || "No value recorded";
  const confirmed = totals("confirmedSavings");
  const expected = totals("expectedSavings");
  const atRisk = items.filter((item) => item.daysRemaining !== null && item.daysRemaining <= 14 && item.approvalState !== "outcome_confirmed").length;
  const memberLabel = new Map(members.map((member) => [
    member.user_id,
    member.user?.full_name ?? member.user?.notification_email ?? member.user_id
  ]));
  const departments = [...new Set(allItems.map((item) => item.department).filter((item): item is string => Boolean(item)))].sort();
  const currencies = [...new Set(allItems.map((item) => item.currency).filter((item): item is string => Boolean(item)))].sort();

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Renewal portfolio</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Decision and negotiation pipeline</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Track evidence, approvals, tasks, deadlines, and customer-confirmed outcomes without executing vendor actions.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Deadlines at risk</p><p className="mt-1 text-2xl font-semibold text-ink">{atRisk}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Expected savings</p><p className="mt-1 text-lg font-semibold text-ink">{formatTotals(expected)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Confirmed savings</p><p className="mt-1 text-lg font-semibold text-ink">{formatTotals(confirmed)}</p></div>
        </div>
      </header>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4 xl:grid-cols-9">
        <input name="vendor" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Vendor" defaultValue={value(searchParams.vendor)} />
        <select name="owner" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.owner)}><option value="">All owners</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel.get(member.user_id)}</option>)}</select>
        <select name="decisionType" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.decisionType)}><option value="">All decisions</option>{RENEWAL_DECISION_TYPES.map((entry) => <option key={entry} value={entry}>{title(entry)}</option>)}</select>
        <select name="approvalState" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.approvalState)}><option value="">All states</option>{["draft", "evidence_pending", "ready_for_review", "in_approval", "approved", "returned_for_changes", "outcome_confirmed"].map((entry) => <option key={entry} value={entry}>{title(entry)}</option>)}</select>
        <select name="department" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.department)}><option value="">All departments</option>{departments.map((entry) => <option key={entry}>{entry}</option>)}</select>
        <select name="currency" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.currency)}><option value="">All currencies</option>{currencies.map((entry) => <option key={entry}>{entry}</option>)}</select>
        <select name="readinessState" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.readinessState)}><option value="">All readiness states</option>{EVIDENCE_READINESS_STATES.map((entry) => <option key={entry} value={entry}>{title(entry)}</option>)}</select>
        <select name="missingEvidenceCategory" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={value(searchParams.missingEvidenceCategory)}><option value="">All missing categories</option>{EVIDENCE_CATEGORIES.map((entry) => <option key={entry} value={entry}>{title(entry)}</option>)}</select>
        <Button type="submit">Apply filters</Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Deadline</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Confirmed</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.decisionId}>
                  <td className="px-4 py-3"><a className="font-semibold text-blue-700 hover:underline" href={`/dashboard/contracts/${item.contractId}/commercial-decision`}>{item.contractTitle}</a><p className="text-xs text-slate-500">{item.vendor}</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-ink">{formatDate(item.noticeDeadline)}</p><p className={`text-xs ${(item.daysRemaining ?? 999) <= 7 ? "text-red-700" : "text-slate-500"}`}>{item.daysRemaining === null ? "No trusted notice date" : `${item.daysRemaining} days`}</p></td>
                  <td className="px-4 py-3"><p className="font-semibold text-ink">{item.evidenceScore === null ? "Not calculated" : `${item.evidenceScore}/100`}</p><p className="text-xs text-slate-500">{item.evidenceReadinessState ? title(item.evidenceReadinessState) : "Open contract to calculate"}{item.criticalBlockerCount ? ` · ${item.criticalBlockerCount} critical` : ""}</p></td>
                  <td className="px-4 py-3">{item.decisionType ? title(item.decisionType) : "Not classified"}</td>
                  <td className="px-4 py-3"><Badge tone={item.approvalState === "outcome_confirmed" ? "success" : item.approvalState === "in_approval" ? "warning" : "locked"}>{title(item.approvalState)}</Badge></td>
                  <td className="px-4 py-3">{item.ownerUserId ? memberLabel.get(item.ownerUserId) ?? "Unknown member" : "Unassigned"}</td>
                  <td className="px-4 py-3">{item.currency ?? ""} {item.expectedSavings?.toLocaleString() ?? "-"}</td>
                  <td className="px-4 py-3">{item.currency ?? ""} {item.confirmedSavings?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
              {!items.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-600">No renewal decisions match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
