import type { CommercialImpactMetric } from "@/lib/revenue-intelligence/revenue-types";

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function CommercialImpactChart({ metrics }: { metrics: CommercialImpactMetric[] }) {
  const totals = new Map<string, number>();
  for (const metric of metrics) totals.set(metric.metric_type, (totals.get(metric.metric_type) ?? 0) + metric.amount);
  const max = Math.max(...Array.from(totals.values()), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Commercial impact</h2>
      <div className="mt-4 space-y-3">
        {Array.from(totals.entries()).map(([type, value]) => (
          <div key={type}>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{type.replaceAll("_", " ")}</span>
              <span className="font-semibold text-ink">{money(value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {!totals.size ? <p className="text-sm text-muted">No commercial impact metrics yet.</p> : null}
      </div>
    </div>
  );
}
