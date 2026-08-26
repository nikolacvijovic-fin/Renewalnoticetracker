import { buildCommercialAnalysis } from "@/lib/contract-intelligence/commercial-analysis";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";
import type { ContractDocumentRelationship } from "@/lib/contract-intelligence/extraction-types";

function amount(value: number | null, currency: string | null) {
  if (value === null) return "Not confirmed";
  return `${currency ? `${currency} ` : ""}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function CommercialAnalysisPanel({
  fields,
  organizationTimezone,
  relationships = []
}: {
  fields: ContractExtractedField[];
  organizationTimezone?: string | null;
  relationships?: ContractDocumentRelationship[];
}) {
  const analysis = buildCommercialAnalysis(fields, undefined, organizationTimezone, relationships);
  const annualCost = analysis.calculations.find((entry) => entry.calculationType === "normalized_annual_cost");
  const totalCost = analysis.calculations.find((entry) => entry.calculationType === "total_committed_cost");
  const remainingCost = analysis.calculations.find((entry) => entry.calculationType === "remaining_committed_cost");
  const renewalExposure = analysis.calculations.find((entry) => entry.calculationType === "renewal_term_exposure");

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Commercial analysis</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Reviewed evidence only</h3>
          <p className="mt-1 text-sm text-slate-600">
            Calculations are separated from extracted facts. Missing or conflicting evidence remains blocked.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {analysis.acceptedFieldCount} reviewed | {analysis.pendingFieldCount} pending
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Annual committed cost</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{amount(annualCost?.amount ?? null, annualCost?.currency ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500">{annualCost?.status.replaceAll("_", " ") ?? "insufficient evidence"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total committed cost</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{amount(totalCost?.amount ?? null, totalCost?.currency ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500">{totalCost?.status.replaceAll("_", " ") ?? "insufficient evidence"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Remaining commitment</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{amount(remainingCost?.amount ?? null, remainingCost?.currency ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500">{remainingCost?.status.replaceAll("_", " ") ?? "insufficient evidence"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Renewal-term exposure</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{amount(renewalExposure?.amount ?? null, renewalExposure?.currency ?? null)}</p>
          <p className="mt-1 text-xs text-slate-500">{renewalExposure?.status.replaceAll("_", " ") ?? "insufficient evidence"}</p>
        </div>
      </div>

      {analysis.conflicts.filter((conflict) => conflict.status === "unresolved").length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {analysis.conflicts.filter((conflict) => conflict.status === "unresolved").length} document conflict(s) require human precedence review.
        </div>
      ) : null}

      {analysis.conflicts.some((conflict) => conflict.status === "supported_precedence") ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {analysis.conflicts.filter((conflict) => conflict.status === "supported_precedence").length} conflict(s) use a reviewed amendment or supersession relationship. Source values remain unchanged and visible.
        </div>
      ) : null}

      <div className="space-y-2">
        {analysis.findings.map((finding, index) => (
          <div key={`${finding.reasonCode}-${index}`} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-950">{finding.reasonCode.replaceAll("_", " ")}</p>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{finding.severity}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{finding.explanation}</p>
            <p className="mt-2 text-xs text-slate-500">Action: {finding.recommendedHumanAction}</p>
            {finding.limitations.length ? (
              <p className="mt-1 text-xs text-amber-700">Limitations: {finding.limitations.join(" ")}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
