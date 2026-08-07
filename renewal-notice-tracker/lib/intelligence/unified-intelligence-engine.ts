import { summarizeRuleOutcomes } from "@/lib/rules/rule-engine";
import { createGovernedActionRecord } from "@/lib/action-governance/action-records";
import {
  governedActionCandidatesFromDecisionRecords,
  summarizeGovernedActionQueues
} from "@/lib/action-governance/action-engine";
import type { UnifiedIntelligenceInput, UnifiedIntelligenceSummary } from "@/lib/intelligence/intelligence-types";

export function buildUnifiedIntelligenceSummary(input: UnifiedIntelligenceInput): UnifiedIntelligenceSummary {
  const ruleSummary = summarizeRuleOutcomes(input.ruleOutcomes ?? []);
  const decisions = input.decisionRecords ?? [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const governedActions = input.governedActionRecords ??
    governedActionCandidatesFromDecisionRecords(decisions).map((candidate) => createGovernedActionRecord(candidate, generatedAt));
  const actionGovernance = summarizeGovernedActionQueues({ actions: governedActions, now: generatedAt });
  const openDecisions = decisions.filter((decision) => decision.status === "open" || decision.status === "acknowledged");
  const decisionBlockers = openDecisions.filter((decision) =>
    decision.decisionType === "blocker" || decision.decisionType === "trust_gap"
  );
  const saasItems = input.saasOptOutItems ?? [];
  const dataQualityIssues = Array.from(new Set([
    ...(input.ruleOutcomes ?? [])
      .filter((outcome) => ["weak_evidence", "missing_notice_deadline", "metadata_conflict", "untrusted_ai_extraction", "ai_fact_requires_review"].includes(outcome.code))
      .map((outcome) => outcome.code),
    ...decisions
      .filter((decision) => ["weak", "conflicted", "blocked"].includes(decision.trustStatus))
      .map((decision) => decision.ruleId ?? decision.decisionType)
  ]));
  const trustGaps = Array.from(new Set([
    ...(input.ruleOutcomes ?? [])
      .filter((outcome) => outcome.outcomeType === "blocker")
      .map((outcome) => outcome.code),
    ...decisionBlockers.map((decision) => decision.ruleId ?? decision.id)
  ]));
  const totalSignals = Math.max(1, (input.contracts?.length ?? 0) + saasItems.length + (input.ruleOutcomes?.length ?? 0) + decisions.length);
  const penalty = Math.min(95, (ruleSummary.blockerCount + decisionBlockers.length) * 15 + ruleSummary.criticalCount * 10 + dataQualityIssues.length * 8);
  const trustPenalty = Math.min(95, decisions.filter((decision) =>
    ["proposed", "weak", "conflicted", "blocked"].includes(decision.trustStatus)
  ).length * 12 + dataQualityIssues.length * 8);
  const acceptedRisks = decisions.filter((decision) => decision.status === "accepted_risk");
  const staleOrSupersededDecisions = decisions.filter((decision) => decision.status === "superseded");
  const blockedActions = decisionBlockers.map((decision) => ({
    id: decision.id,
    title: decision.title,
    reason: decision.blockedReason,
    severity: decision.severity,
    ruleId: decision.ruleId,
    source: decision.source
  }));

  return {
    organizationId: input.organizationId,
    generatedAt,
    riskSegments: [
      {
        id: "critical",
        label: "Critical renewal risk",
        count: ruleSummary.criticalCount + decisions.filter((decision) => decision.severity === "critical" && decision.status === "open").length,
        severity: "critical"
      },
      {
        id: "high",
        label: "High priority renewal risk",
        count: ruleSummary.highCount + decisions.filter((decision) => decision.severity === "high" && decision.status === "open").length,
        severity: "high"
      },
      {
        id: "blocked",
        label: "Blocked by trust gaps",
        count: ruleSummary.blockerCount + decisionBlockers.length,
        severity: "medium"
      },
      { id: "saas_opt_out", label: "SaaS opt-out records", count: saasItems.length, severity: "medium" }
    ],
    recommendedActions: [
      ...(input.ruleOutcomes ?? [])
        .filter((outcome) => outcome.outcomeType === "recommendation" || outcome.outcomeType === "next_action")
        .map((outcome) => ({
          code: outcome.code,
          label: outcome.recommendedAction ?? outcome.message,
          severity: outcome.severity,
          source: "rule"
        })),
      ...openDecisions
        .filter((decision) => decision.decisionType === "recommendation" || decision.decisionType === "next_action")
        .map((decision) => ({
          code: decision.ruleId ?? decision.id,
          label: decision.title,
          severity: decision.severity,
          source: decision.source
        }))
    ],
    blockers: [
      ...(input.ruleOutcomes ?? [])
        .filter((outcome) => outcome.outcomeType === "blocker")
        .map((outcome) => ({ code: outcome.code, label: outcome.message, severity: outcome.severity })),
      ...decisionBlockers.map((decision) => ({
        code: decision.ruleId ?? decision.id,
        label: decision.summary,
        severity: decision.severity
      }))
    ],
    blockedActions,
    acceptedRisks: acceptedRisks.map((decision) => ({ id: decision.id, title: decision.title, summary: decision.summary })),
    staleOrSupersededDecisions: staleOrSupersededDecisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status
    })),
    actionGovernance,
    confidenceScore: Math.max(0, Math.round(100 - penalty + Math.min(10, totalSignals))),
    trustScore: Math.max(0, Math.round(100 - trustPenalty)),
    overallRiskScore: Math.min(100, Math.round(penalty + ruleSummary.criticalCount * 10 + decisionBlockers.length * 5)),
    trustGaps,
    importReviewBlockers: trustGaps.filter((gap) => gap.includes("import") || gap.includes("duplicate")).length,
    aiReviewBlockers: trustGaps.filter((gap) => gap.includes("ai")).length,
    reminderHealthBlockers: trustGaps.filter((gap) => gap.includes("reminder")).length,
    upcomingDeadlines: saasItems
      .filter((item) => ["expired", "due_7_days", "due_30_days", "due_60_days"].includes(item.deadlineWindow))
      .map((item) => ({
        contractId: item.contractId ?? null,
        deadlineWindow: item.deadlineWindow,
        spendAtRiskAmount: Math.max(0, Number(item.spendAtRiskAmount ?? 0))
      })),
    spendAtRiskAmount: saasItems.reduce((total, item) => total + Math.max(0, Number(item.spendAtRiskAmount ?? 0)), 0),
    dataQualityIssues,
    whyThisMatters: [
      decisionBlockers.length > 0 ? `${decisionBlockers.length} decision${decisionBlockers.length === 1 ? "" : "s"} are blocked until review.` : null,
      acceptedRisks.length > 0 ? `${acceptedRisks.length} accepted risk decision${acceptedRisks.length === 1 ? "" : "s"} should stay visible for audit.` : null,
      saasItems.length > 0 ? `${saasItems.length} SaaS opt-out record${saasItems.length === 1 ? "" : "s"} contribute to renewal-defense exposure.` : null
    ].filter((item): item is string => Boolean(item))
  };
}
