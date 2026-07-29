import type { RevenueForecastScenario } from "@/lib/revenue-intelligence/revenue-types";
import { Badge } from "@/components/ui/badge";

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function ForecastScenarioPanel({ forecasts }: { forecasts: RevenueForecastScenario[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Forecast scenarios</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {forecasts.map((forecast) => (
          <div key={forecast.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Badge tone="automation">{forecast.scenario}</Badge>
            <p className="mt-2 text-sm text-muted">Forecasted spend</p>
            <p className="text-xl font-semibold text-ink">{money(forecast.forecasted_renewal_spend)}</p>
            <p className="mt-2 text-sm text-muted">Savings {money(forecast.forecasted_savings)} | Net impact {money(forecast.net_commercial_impact)}</p>
            <p className="mt-1 text-xs text-muted">Confidence {Math.round(forecast.confidence_score * 100)}%</p>
          </div>
        ))}
        {!forecasts.length ? <p className="text-sm text-muted">No forecast scenarios yet.</p> : null}
      </div>
    </div>
  );
}
