import type {
  CommercialImpactMetric,
  RevenueForecastScenario,
  RevenueForecastScenarioType,
  RevenueRiskSignal
} from "@/lib/revenue-intelligence/revenue-types";

function sum(metrics: Array<Pick<CommercialImpactMetric, "metric_type" | "amount">>, type: CommercialImpactMetric["metric_type"]) {
  return metrics.filter((metric) => metric.metric_type === type).reduce((total, metric) => total + metric.amount, 0);
}

function confidencePenalty(signals: Array<Pick<RevenueRiskSignal, "signal_type" | "severity">>) {
  const blocked = signals.filter((signal) => ["decision_blocked", "expired_notice_deadline", "weak_contract_evidence"].includes(signal.signal_type)).length;
  const critical = signals.filter((signal) => signal.severity === "critical").length;
  return Math.min(0.55, blocked * 0.08 + critical * 0.07);
}

function scenarioFactor(scenario: RevenueForecastScenarioType) {
  if (scenario === "conservative") return { savings: 0.35, exposure: 1.15, confidence: 0.65 };
  if (scenario === "aggressive") return { savings: 0.85, exposure: 0.9, confidence: 0.78 };
  if (scenario === "risk_adjusted") return { savings: 0.5, exposure: 1.25, confidence: 0.7 };
  return { savings: 0.6, exposure: 1, confidence: 0.75 };
}

export function buildRevenueForecastScenarios(input: {
  metrics: Array<Pick<CommercialImpactMetric, "metric_type" | "amount" | "currency">>;
  signals: Array<Pick<RevenueRiskSignal, "signal_type" | "severity">>;
  snapshotId?: string | null;
}): Array<Omit<RevenueForecastScenario, "id" | "organization_id" | "created_at" | "updated_at">> {
  const renewalAtRisk = sum(input.metrics, "renewal_value_at_risk");
  const priceExposure = sum(input.metrics, "price_increase_exposure");
  const savingsIdentified = sum(input.metrics, "savings_identified") + sum(input.metrics, "savings_approved");
  const currency = input.metrics.find((metric) => metric.currency)?.currency ?? null;
  const penalty = confidencePenalty(input.signals);

  return (["conservative", "expected", "aggressive", "risk_adjusted"] as RevenueForecastScenarioType[]).map((scenario) => {
    const factor = scenarioFactor(scenario);
    const forecastedSavings = Math.round(savingsIdentified * factor.savings);
    const riskAdjustedExposure = Math.round((renewalAtRisk + priceExposure) * factor.exposure * (1 + penalty));
    const confidenceScore = Math.max(0.15, Math.min(1, factor.confidence - penalty));
    return {
      snapshot_id: input.snapshotId ?? null,
      scenario,
      forecasted_renewal_spend: Math.round(renewalAtRisk + priceExposure - forecastedSavings),
      forecasted_savings: forecastedSavings,
      net_commercial_impact: Math.round(forecastedSavings - riskAdjustedExposure),
      risk_adjusted_exposure: riskAdjustedExposure,
      currency,
      confidence_score: confidenceScore,
      assumptions: [
        `${scenario} savings realization factor applied`,
        "Blocked decisions and expired deadlines reduce confidence",
        "Values are derived from active revenue intelligence metrics only"
      ],
      warning_codes: [
        ...(input.metrics.some((metric) => metric.metric_type === "price_increase_exposure") ? [] : ["missing_quote_comparison"]),
        ...(input.signals.some((signal) => signal.signal_type === "weak_contract_evidence") ? ["weak_evidence"] : []),
        ...(input.signals.some((signal) => signal.signal_type === "decision_blocked") ? ["blocked_decisions"] : [])
      ],
      source_module: "revenue_intelligence",
      source_fingerprint: `revenue_forecast:${scenario}`,
      status: "active",
      created_by_user_id: null
    };
  });
}
