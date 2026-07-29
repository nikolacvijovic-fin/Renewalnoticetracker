import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import type {
  CommercialImpactMetricType,
  ExecutiveInsightSeverity,
  RevenueAggregationOutput,
  RevenueRiskSignalType
} from "@/lib/revenue-intelligence/revenue-types";
import type {
  RevenueIntelligenceSourceData,
  RevenueSourceContract
} from "@/lib/revenue-intelligence/revenue-intelligence-source-queries";

const SOURCE_MODULE = "revenue_intelligence";

function text(value: string | null | undefined, fallback = "Unknown") {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (/raw\s+(contract|quote|ocr)|ocr output|provider payload|storage path|secret|token|uploaded document|generated outreach/i.test(normalized)) {
    return "[redacted]";
  }
  return normalized.slice(0, 180);
}

function amount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function confidence(value: unknown, fallback = 0.75) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function contractValue(contract: RevenueSourceContract | undefined) {
  return amount(contract?.metadata?.contract_value_amount);
}

function contractCurrency(contract: RevenueSourceContract | undefined, fallback?: string | null) {
  return contract?.metadata?.contract_value_currency ?? fallback ?? null;
}

function vendor(contract: RevenueSourceContract | undefined) {
  return text(contract?.metadata?.counterparty_name, "Unassigned vendor");
}

function category(contract: RevenueSourceContract | undefined) {
  return text(contract?.metadata?.contract_type ?? contract?.department ?? contract?.status_tag, "Uncategorized");
}

function severityFromRisk(value: string | null | undefined): ExecutiveInsightSeverity {
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  if (value === "low") return "low";
  return "info";
}

function signal(
  type: RevenueRiskSignalType,
  sourceId: string,
  values: Partial<RevenueAggregationOutput["signals"][number]> & {
    contractId?: string | null;
    title: string;
    summary: string;
    severity: ExecutiveInsightSeverity;
  }
): RevenueAggregationOutput["signals"][number] {
  return {
    contract_id: values.contractId ?? null,
    commercial_decision_id: values.commercial_decision_id ?? null,
    quote_comparison_id: values.quote_comparison_id ?? null,
    savings_opportunity_id: values.savings_opportunity_id ?? null,
    negotiation_brief_id: values.negotiation_brief_id ?? null,
    outreach_opportunity_id: values.outreach_opportunity_id ?? null,
    signal_type: type,
    severity: values.severity,
    title: text(values.title),
    summary: text(values.summary, "Revenue intelligence signal"),
    vendor_name: values.vendor_name ?? null,
    category_name: values.category_name ?? null,
    amount: amount(values.amount),
    currency: values.currency ?? null,
    evidence_confidence: values.evidence_confidence ?? null,
    source_module: values.source_module ?? SOURCE_MODULE,
    source_fingerprint: `revenue_signal:${type}:${sourceId}`,
    status: "active",
    warning_codes: values.warning_codes ?? [],
    created_by_user_id: values.created_by_user_id ?? null
  };
}

function metric(
  type: CommercialImpactMetricType,
  sourceId: string,
  values: Partial<RevenueAggregationOutput["metrics"][number]> & { label: string; amount: number }
): RevenueAggregationOutput["metrics"][number] {
  return {
    contract_id: values.contract_id ?? null,
    commercial_decision_id: values.commercial_decision_id ?? null,
    quote_comparison_id: values.quote_comparison_id ?? null,
    savings_opportunity_id: values.savings_opportunity_id ?? null,
    metric_type: type,
    label: text(values.label),
    amount: amount(values.amount),
    currency: values.currency ?? null,
    source_module: values.source_module ?? SOURCE_MODULE,
    source_fingerprint: `revenue_metric:${type}:${sourceId}`,
    status: "active",
    evidence_confidence: values.evidence_confidence ?? null,
    metadata: sanitizeQuoteEvidence(values.metadata ?? {}) as RevenueAggregationOutput["metrics"][number]["metadata"],
    created_by_user_id: values.created_by_user_id ?? null
  };
}

function evidence(
  type: string,
  sourceId: string,
  values: Partial<RevenueAggregationOutput["evidenceLinks"][number]> & { label: string }
): RevenueAggregationOutput["evidenceLinks"][number] {
  return {
    contract_id: values.contract_id ?? null,
    commercial_decision_id: values.commercial_decision_id ?? null,
    quote_comparison_id: values.quote_comparison_id ?? null,
    savings_opportunity_id: values.savings_opportunity_id ?? null,
    negotiation_brief_id: values.negotiation_brief_id ?? null,
    outreach_opportunity_id: values.outreach_opportunity_id ?? null,
    evidence_type: type,
    evidence_id: values.evidence_id ?? null,
    evidence_label: text(values.label, "Revenue intelligence evidence"),
    evidence_url: values.evidence_url ?? null,
    evidence_confidence: values.evidence_confidence ?? null,
    source_module: values.source_module ?? SOURCE_MODULE,
    source_fingerprint: `revenue_evidence:${type}:${sourceId}`,
    status: "active",
    created_by_user_id: values.created_by_user_id ?? null
  };
}

export function aggregateRevenueIntelligence(
  data: RevenueIntelligenceSourceData,
  options: { now?: Date } = {}
): RevenueAggregationOutput {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const contractsById = new Map(data.contracts.map((contract) => [contract.id, contract]));
  const signals: RevenueAggregationOutput["signals"] = [];
  const metrics: RevenueAggregationOutput["metrics"] = [];
  const evidenceLinks: RevenueAggregationOutput["evidenceLinks"] = [];

  for (const decision of data.commercialDecisions) {
    const contract = contractsById.get(decision.contract_id);
    const value = Math.max(contractValue(contract), amount(decision.estimated_savings_amount));
    if (["critical", "high"].includes(decision.commercial_risk_level)) {
      signals.push(signal("renewal_at_risk", decision.id, {
        contractId: decision.contract_id,
        commercial_decision_id: decision.id,
        severity: severityFromRisk(decision.commercial_risk_level),
        title: `${vendor(contract)} renewal is at risk`,
        summary: `Commercial decision is ${decision.commercial_risk_level} and requires action.`,
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: value,
        currency: contractCurrency(contract, decision.currency),
        evidence_confidence: confidence(decision.evidence_confidence)
      }));
      metrics.push(metric("renewal_value_at_risk", decision.id, {
        contract_id: decision.contract_id,
        commercial_decision_id: decision.id,
        label: `${vendor(contract)} renewal value at risk`,
        amount: value,
        currency: contractCurrency(contract, decision.currency),
        evidence_confidence: confidence(decision.evidence_confidence)
      }));
    }
    if (decision.blocker_codes.length || !decision.owner_user_id || !decision.approver_user_id) {
      signals.push(signal("decision_blocked", decision.id, {
        contractId: decision.contract_id,
        commercial_decision_id: decision.id,
        severity: decision.commercial_risk_level === "critical" ? "critical" : "high",
        title: "Commercial decision is blocked",
        summary: `Decision blockers: ${[...decision.blocker_codes, !decision.owner_user_id ? "missing_owner" : "", !decision.approver_user_id ? "missing_approver" : ""].filter(Boolean).join(", ")}`,
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: value,
        currency: contractCurrency(contract, decision.currency),
        evidence_confidence: confidence(decision.evidence_confidence),
        warning_codes: decision.blocker_codes
      }));
      metrics.push(metric("blocked_decision_value", decision.id, {
        contract_id: decision.contract_id,
        commercial_decision_id: decision.id,
        label: "Blocked decision value",
        amount: value,
        currency: contractCurrency(contract, decision.currency),
        evidence_confidence: confidence(decision.evidence_confidence)
      }));
    }
    if (decision.decision_status === "in_approval") {
      const daysStalled = Math.floor((nowMs - new Date(decision.updated_at).getTime()) / (24 * 60 * 60 * 1000));
      if (daysStalled >= 7) {
        signals.push(signal("approval_stalled", decision.id, {
          contractId: decision.contract_id,
          commercial_decision_id: decision.id,
          severity: "high",
          title: "Approval is stalled",
          summary: `Commercial approval has been in progress for ${daysStalled} days.`,
          vendor_name: vendor(contract),
          category_name: category(contract),
          amount: value,
          currency: contractCurrency(contract, decision.currency),
          evidence_confidence: confidence(decision.evidence_confidence),
          warning_codes: ["approval_stalled"]
        }));
      }
    }
    evidenceLinks.push(evidence("commercial_decision", decision.id, {
      contract_id: decision.contract_id,
      commercial_decision_id: decision.id,
      evidence_id: decision.id,
      label: `Commercial decision: ${decision.decision_status}`,
      evidence_confidence: confidence(decision.evidence_confidence)
    }));
  }

  for (const comparison of data.quoteComparisons.filter((entry) => entry.status === "completed")) {
    const contract = contractsById.get(comparison.contract_id);
    if (amount(comparison.price_delta_amount) > 0 || (comparison.price_delta_percent ?? 0) > 0) {
      signals.push(signal("price_increase", comparison.id, {
        contractId: comparison.contract_id,
        quote_comparison_id: comparison.id,
        severity: severityFromRisk(comparison.overall_risk_level),
        title: `${vendor(contract)} price increase detected`,
        summary: `Quote comparison shows a price increase${comparison.price_delta_percent ? ` of ${comparison.price_delta_percent}%` : ""}.`,
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: amount(comparison.price_delta_amount),
        currency: comparison.currency ?? contractCurrency(contract)
      }));
      metrics.push(metric("price_increase_exposure", comparison.id, {
        contract_id: comparison.contract_id,
        quote_comparison_id: comparison.id,
        label: "Price increase exposure",
        amount: amount(comparison.price_delta_amount),
        currency: comparison.currency ?? contractCurrency(contract),
        metadata: { priceDeltaPercent: comparison.price_delta_percent ?? null }
      }));
    }
    evidenceLinks.push(evidence("quote_comparison", comparison.id, {
      contract_id: comparison.contract_id,
      quote_comparison_id: comparison.id,
      evidence_id: comparison.id,
      label: "Completed renewal quote comparison"
    }));
  }

  for (const finding of data.quoteFindings.filter((entry) => ["critical", "high"].includes(entry.severity) && entry.status !== "dismissed")) {
    const contract = contractsById.get(finding.contract_id);
    signals.push(signal(finding.severity === "critical" ? "critical_quote_finding" : "price_increase", finding.id, {
      contractId: finding.contract_id,
      quote_comparison_id: finding.comparison_id,
      severity: severityFromRisk(finding.severity),
      title: `${finding.severity} quote finding`,
      summary: `${finding.finding_type.replaceAll("_", " ")} requires review.`,
      vendor_name: vendor(contract),
      category_name: category(contract),
      amount: contractValue(contract),
      currency: contractCurrency(contract),
      evidence_confidence: confidence(finding.confidence)
    }));
  }

  for (const opportunity of data.savingsOpportunities.filter((entry) => entry.status !== "dismissed")) {
    const contract = contractsById.get(opportunity.contract_id);
    signals.push(signal("savings_opportunity", opportunity.id, {
      contractId: opportunity.contract_id,
      quote_comparison_id: opportunity.comparison_id,
      savings_opportunity_id: opportunity.id,
      severity: amount(opportunity.estimated_savings_amount) >= 50000 ? "high" : "medium",
      title: text(opportunity.title, "Savings opportunity"),
      summary: "Savings opportunity requires review or approval.",
      vendor_name: vendor(contract),
      category_name: category(contract),
      amount: amount(opportunity.estimated_savings_amount),
      currency: opportunity.currency ?? contractCurrency(contract),
      evidence_confidence: confidence(opportunity.confidence)
    }));
    const metricType =
      opportunity.status === "realized"
        ? "savings_realized"
        : ["accepted", "approved"].includes(opportunity.status)
          ? "savings_approved"
          : "savings_identified";
    metrics.push(metric(metricType, opportunity.id, {
      contract_id: opportunity.contract_id,
      quote_comparison_id: opportunity.comparison_id,
      savings_opportunity_id: opportunity.id,
      label: text(opportunity.title, "Savings opportunity"),
      amount: amount(opportunity.estimated_savings_amount),
      currency: opportunity.currency ?? contractCurrency(contract),
      evidence_confidence: confidence(opportunity.confidence),
      metadata: { status: opportunity.status, opportunityType: opportunity.opportunity_type }
    }));
  }

  for (const brief of data.negotiationBriefs.filter((entry) => !["archived", "rejected"].includes(entry.status))) {
    const contract = contractsById.get(brief.contract_id);
    const value = amount(brief.target_savings_amount) || contractValue(contract);
    signals.push(signal("negotiation_in_progress", brief.id, {
      contractId: brief.contract_id,
      commercial_decision_id: brief.commercial_decision_id,
      negotiation_brief_id: brief.id,
      severity: "medium",
      title: "Negotiation workflow is active",
      summary: `Negotiation brief status is ${brief.status}.`,
      vendor_name: vendor(contract),
      category_name: category(contract),
      amount: value,
      currency: brief.currency ?? contractCurrency(contract),
      evidence_confidence: confidence(brief.evidence_confidence)
    }));
    metrics.push(metric("negotiation_pipeline_value", brief.id, {
      contract_id: brief.contract_id,
      commercial_decision_id: brief.commercial_decision_id,
      label: "Negotiation pipeline value",
      amount: value,
      currency: brief.currency ?? contractCurrency(contract),
      evidence_confidence: confidence(brief.evidence_confidence)
    }));
  }

  for (const outreach of data.outreachOpportunities.filter((entry) => !["dismissed", "archived"].includes(entry.status))) {
    const contract = outreach.contract_id ? contractsById.get(outreach.contract_id) : undefined;
    const impact = outreach.expected_commercial_impact ?? {};
    const value = amount((impact as { estimatedSavingsAmount?: unknown }).estimatedSavingsAmount) ||
      amount((impact as { priceDeltaAmount?: unknown }).priceDeltaAmount) ||
      contractValue(contract);
    signals.push(signal(outreach.opportunity_type === "churn_prevention" ? "churn_prevention" : outreach.opportunity_type === "expansion_signal" ? "expansion_signal" : "outreach_pending", outreach.id, {
      contractId: outreach.contract_id,
      commercial_decision_id: outreach.commercial_decision_id,
      negotiation_brief_id: outreach.negotiation_brief_id,
      outreach_opportunity_id: outreach.id,
      severity: outreach.priority === "critical" ? "critical" : outreach.priority === "high" ? "high" : "medium",
      title: "Internal outreach workflow is pending",
      summary: `Internal outreach opportunity is ${outreach.status}.`,
      vendor_name: vendor(contract),
      category_name: category(contract),
      amount: value,
      currency: contractCurrency(contract),
      evidence_confidence: confidence(outreach.evidence_confidence)
    }));
    metrics.push(metric("outreach_pipeline_value", outreach.id, {
      contract_id: outreach.contract_id,
      commercial_decision_id: outreach.commercial_decision_id,
      savings_opportunity_id: null,
      label: "Internal outreach pipeline value",
      amount: value,
      currency: contractCurrency(contract),
      evidence_confidence: confidence(outreach.evidence_confidence)
    }));
  }

  for (const contract of data.contracts) {
    const value = contractValue(contract);
    const notice = contract.metadata?.notice_deadline_date ? new Date(contract.metadata.notice_deadline_date) : null;
    if (notice && notice.getTime() < nowMs && !["closed", "superseded"].includes(contract.cycle_status ?? "")) {
      signals.push(signal("expired_notice_deadline", contract.id, {
        contractId: contract.id,
        severity: "critical",
        title: "Notice deadline has expired",
        summary: "A renewal notice deadline is already past and needs escalation.",
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: value,
        currency: contractCurrency(contract),
        warning_codes: ["expired_notice_deadline"]
      }));
    }
    if (contract.metadata?.has_weak_evidence || contract.metadata?.needs_review) {
      signals.push(signal("weak_contract_evidence", contract.id, {
        contractId: contract.id,
        severity: "medium",
        title: "Contract evidence is weak",
        summary: "Contract metadata needs review before relying on automation.",
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: value,
        currency: contractCurrency(contract),
        warning_codes: ["weak_contract_evidence"]
      }));
    }
    if ((contract.reminders ?? []).some((reminder) => ["blocked", "failed"].includes(reminder.status ?? ""))) {
      signals.push(signal("trusted_reminder_blocked", contract.id, {
        contractId: contract.id,
        severity: "high",
        title: "Trusted reminder is blocked",
        summary: "A trusted reminder needs review before dispatch.",
        vendor_name: vendor(contract),
        category_name: category(contract),
        amount: value,
        currency: contractCurrency(contract),
        warning_codes: ["trusted_reminder_blocked"]
      }));
    }
  }

  const summaries = buildVendorCategorySummaries(data.contracts, signals);
  for (const summary of summaries.filter((entry) => entry.renewal_value > 0 && entry.contract_count >= 2)) {
    const concentrationType = summary.summary_type === "vendor" ? "vendor_concentration" : "category_concentration";
    const metricType = summary.summary_type === "vendor" ? "vendor_concentration_value" : "category_concentration_value";
    const label = summary.vendor_name ?? summary.category_name ?? "Portfolio concentration";
    signals.push(signal(concentrationType, summary.source_fingerprint, {
      severity: summary.renewal_value >= 100000 || summary.risk_signal_count >= 2 ? "high" : "medium",
      title: `${label} concentration`,
      summary: `${summary.contract_count} contracts share this ${summary.summary_type} exposure.`,
      vendor_name: summary.vendor_name,
      category_name: summary.category_name,
      amount: summary.renewal_value,
      currency: summary.currency,
      warning_codes: [`${summary.summary_type}_concentration`]
    }));
    metrics.push(metric(metricType, summary.source_fingerprint, {
      label: `${label} concentration value`,
      amount: summary.renewal_value,
      currency: summary.currency,
      metadata: {
        summaryType: summary.summary_type,
        contractCount: summary.contract_count,
        riskSignalCount: summary.risk_signal_count
      }
    }));
  }

  return {
    snapshotSummary: {
      contractCount: data.contracts.length,
      decisionCount: data.commercialDecisions.length,
      quoteComparisonCount: data.quoteComparisons.length,
      savingsOpportunityCount: data.savingsOpportunities.length,
      generatedAt: now.toISOString()
    },
    signals,
    metrics,
    vendorCategorySummaries: summaries,
    evidenceLinks
  };
}

function buildVendorCategorySummaries(
  contracts: RevenueSourceContract[],
  signals: RevenueAggregationOutput["signals"]
): RevenueAggregationOutput["vendorCategorySummaries"] {
  const summaries = new Map<string, RevenueAggregationOutput["vendorCategorySummaries"][number]>();
  for (const contract of contracts) {
    for (const type of ["vendor", "category"] as const) {
      const name = type === "vendor" ? vendor(contract) : category(contract);
      const key = `${type}:${name}`;
      const current = summaries.get(key) ?? {
        vendor_name: type === "vendor" ? name : null,
        category_name: type === "category" ? name : null,
        summary_type: type,
        contract_count: 0,
        renewal_value: 0,
        risk_signal_count: 0,
        currency: contractCurrency(contract),
        severity: "info" as ExecutiveInsightSeverity,
        source_module: SOURCE_MODULE,
        source_fingerprint: `revenue_summary:${key}`,
        status: "active" as const,
        created_by_user_id: null
      };
      current.contract_count += 1;
      current.renewal_value += contractValue(contract);
      current.risk_signal_count = signals.filter((signal) =>
        type === "vendor" ? signal.vendor_name === name : signal.category_name === name
      ).length;
      current.severity = current.risk_signal_count >= 3 ? "high" : current.risk_signal_count > 0 ? "medium" : "info";
      summaries.set(key, current);
    }
  }
  return Array.from(summaries.values()).filter((summary) => summary.contract_count > 1 || summary.risk_signal_count > 0);
}
