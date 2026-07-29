import type { RevenueRiskSignal } from "@/lib/revenue-intelligence/revenue-types";

export function BlockedDecisionsPanel({ signals }: { signals: RevenueRiskSignal[] }) {
  const blocked = signals.filter((signal) => signal.signal_type === "decision_blocked" || signal.signal_type === "approval_stalled");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Blocked decisions</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {blocked.length ? blocked.slice(0, 8).map((signal) => (
          <li key={signal.id} className="rounded-xl bg-slate-50 p-3">
            <span className="font-semibold text-ink">{signal.title}</span>
            <span className="block">{signal.summary}</span>
          </li>
        )) : <li>No blocked decisions detected.</li>}
      </ul>
    </div>
  );
}
