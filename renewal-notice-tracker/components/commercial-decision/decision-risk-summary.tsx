import { Badge } from "@/components/ui/badge";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";

function money(amount: number | null, currency: string | null) {
  if (typeof amount !== "number") return "No savings estimate";
  return `${currency ?? "USD"} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function tone(risk: string): "default" | "success" | "warning" | "urgent" | "critical" {
  if (risk === "critical") return "critical";
  if (risk === "high") return "urgent";
  if (risk === "medium") return "warning";
  if (risk === "low" || risk === "info") return "success";
  return "default";
}

export function DecisionRiskSummary({ decision }: { decision: CommercialDecision }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recommendation</p>
        <p className="mt-2 text-lg font-semibold text-ink">{decision.recommended_action.replaceAll("_", " ")}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Risk</p>
        <div className="mt-2">
          <Badge tone={tone(decision.commercial_risk_level)}>{decision.commercial_risk_level}</Badge>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Posture</p>
        <p className="mt-2 text-sm font-semibold text-ink">{decision.negotiation_posture.replaceAll("_", " ")}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Savings</p>
        <p className="mt-2 text-sm font-semibold text-ink">{money(decision.estimated_savings_amount, decision.currency)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence</p>
        <p className="mt-2 text-sm font-semibold text-ink">{Math.round(decision.evidence_confidence * 100)}% confidence</p>
      </div>
    </div>
  );
}
