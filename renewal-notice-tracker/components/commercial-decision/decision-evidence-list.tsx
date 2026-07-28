import type { CommercialDecisionEvidenceLink } from "@/lib/commercial-decision-workbench/decision-types";
import { formatDate } from "@/lib/utils";

export function DecisionEvidenceList({ evidenceLinks }: { evidenceLinks: CommercialDecisionEvidenceLink[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-ink">Evidence links</h2>
      <div className="mt-4 space-y-3">
        {evidenceLinks.length ? (
          evidenceLinks.map((evidence) => (
            <div key={evidence.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{evidence.evidence_label}</p>
                  <p className="mt-1 text-xs text-slate-500">{evidence.evidence_type.replaceAll("_", " ")}</p>
                </div>
                <p className="text-xs text-slate-500">{formatDate(evidence.created_at)}</p>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Confidence {evidence.confidence === null ? "not scored" : `${Math.round(evidence.confidence * 100)}%`}
                {evidence.risk_level ? ` | Risk ${evidence.risk_level}` : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No explicit evidence links have been attached yet. The score still uses contract, quote, savings, and reminder state.</p>
        )}
      </div>
    </div>
  );
}
