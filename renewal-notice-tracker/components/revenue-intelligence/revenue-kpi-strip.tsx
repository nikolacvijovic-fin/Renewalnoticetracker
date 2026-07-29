import type { RevenueIntelligenceDashboard } from "@/lib/revenue-intelligence/revenue-types";

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function RevenueKpiStrip({ dashboard }: { dashboard: RevenueIntelligenceDashboard }) {
  const kpis = [
    ["Renewal value at risk", money(dashboard.kpis.totalRenewalValueAtRisk)],
    ["Price increase exposure", money(dashboard.kpis.priceIncreaseExposure)],
    ["Savings identified", money(dashboard.kpis.savingsIdentified)],
    ["Savings approved", money(dashboard.kpis.savingsApproved)],
    ["Forecasted savings", money(dashboard.kpis.forecastedSavings)],
    ["Net commercial impact", money(dashboard.kpis.netCommercialImpact)],
    ["Critical risks", String(dashboard.kpis.criticalRiskCount)],
    ["Blocked decisions", String(dashboard.kpis.blockedDecisionCount)]
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
      ))}
    </div>
  );
}
