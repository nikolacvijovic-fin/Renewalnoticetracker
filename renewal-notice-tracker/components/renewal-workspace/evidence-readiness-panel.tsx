import type { EvidenceReadinessAssessment, EvidenceReadinessItem } from "@/lib/evidence-readiness/types";
import { Badge } from "@/components/ui/badge";

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionHref(contractId: string, item: EvidenceReadinessItem) {
  if (["contract_identity", "renewal_timing", "financial"].includes(item.category)) return `/dashboard/contracts/${contractId}/review`;
  if (item.category === "usage_optimization") return "/dashboard/subscription-optimization";
  if (item.category === "renewal_quote") return `/dashboard/contracts/${contractId}/commercial-decision#quote-comparison`;
  if (item.category === "ownership") return `/dashboard/contracts/${contractId}`;
  return `/dashboard/contracts/${contractId}/commercial-decision`;
}

function stateTone(state: EvidenceReadinessAssessment["readinessState"]) {
  if (state === "decision_ready") return "success" as const;
  if (state === "blocked") return "danger" as const;
  return "warning" as const;
}

export function EvidenceReadinessPanel({ assessment }: { assessment: EvidenceReadinessAssessment }) {
  const actionItem = assessment.criticalBlockers[0]
    ?? assessment.items.find((item) => item.state === "present_unreviewed")
    ?? assessment.items.find((item) => ["missing", "stale", "conflicting", "insufficient"].includes(item.state));
  const attention = assessment.items.filter((item) =>
    item.state !== "verified" && item.state !== "not_applicable"
  );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="evidence-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Evidence readiness</p>
          <h2 id="evidence-readiness-title" className="mt-1 text-xl font-semibold text-ink">Evidence Completeness Score</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Measures reviewed evidence completeness. It is not legal advice or a guarantee that a renewal decision is correct.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-ink">{assessment.score}<span className="text-base text-slate-500">/100</span></p>
          <Badge tone={stateTone(assessment.readinessState)}>{title(assessment.readinessState)}</Badge>
        </div>
      </div>

      {assessment.criticalBlockers.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="font-semibold text-red-900">Decision readiness blocked</p>
          <p className="mt-1 text-sm text-red-800">
            {assessment.criticalBlockers.length} critical requirement{assessment.criticalBlockers.length === 1 ? "" : "s"} must be resolved. A high score cannot override a critical blocker.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {assessment.categories.map((category) => (
          <div key={category.category} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title(category.category)}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{category.score}%</p>
            <p className="text-xs text-slate-600">{category.blockerCount ? `${category.blockerCount} critical blocker(s)` : "No critical blockers"}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next highest-value action</p>
        <p className="mt-1 font-semibold text-blue-950">{assessment.nextRecommendedAction}</p>
        {actionItem ? <a className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline" href={actionHref(assessment.contractId, actionItem)}>Open action</a> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold text-ink">Needs attention</h3>
          <div className="mt-2 space-y-2">
            {attention.slice(0, 12).map((item) => (
              <div key={item.requirementKey} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{item.label}</p>
                  <Badge tone={item.critical ? "danger" : "warning"}>{item.critical ? `Critical: ${title(item.state)}` : title(item.state)}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>
              </div>
            ))}
            {!attention.length ? <p className="text-sm text-slate-600">All applicable evidence requirements are verified.</p> : null}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-ink">Verified evidence</h3>
          <div className="mt-2 space-y-2">
            {assessment.verifiedEvidence.slice(0, 12).map((item) => (
              <div key={item.requirementKey} className="rounded-lg bg-emerald-50 p-3">
                <p className="font-medium text-emerald-950">{item.label}</p>
                <p className="mt-1 text-xs text-emerald-800">Source: {item.evidenceSource ? title(item.evidenceSource) : "Bounded system evidence"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Calculated {new Date(assessment.calculatedAt).toLocaleString()} · {assessment.calculationVersion} · Profile: {title(assessment.decisionProfile)}
      </p>
    </section>
  );
}

