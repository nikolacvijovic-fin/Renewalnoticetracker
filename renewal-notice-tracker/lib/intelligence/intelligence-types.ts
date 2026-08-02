import type { RuleOutcome } from "@/lib/rules/rule-types";
import type { DecisionRecord } from "@/lib/decision-intelligence/decision-types";

export type UnifiedIntelligenceInput = {
  organizationId: string;
  generatedAt?: string;
  contracts?: Array<{
    id: string;
    title?: string | null;
    ownerUserId?: string | null;
    noticeDeadlineDate?: string | null;
    renewalDate?: string | null;
    contractValueAmount?: number | null;
  }>;
  saasOptOutItems?: Array<{
    contractId?: string | null;
    deadlineWindow: "expired" | "due_7_days" | "due_30_days" | "due_60_days" | "future" | "missing";
    workflowStatus: string;
    ownerUserId?: string | null;
    spendAtRiskAmount?: number | null;
  }>;
  ruleOutcomes?: RuleOutcome[];
  decisionRecords?: DecisionRecord[];
};

export type UnifiedIntelligenceSummary = {
  organizationId: string;
  generatedAt: string;
  riskSegments: Array<{ id: string; label: string; count: number; severity: "info" | "low" | "medium" | "high" | "critical" }>;
  recommendedActions: Array<{ code: string; label: string; severity: "info" | "low" | "medium" | "high" | "critical" }>;
  blockers: Array<{ code: string; label: string; severity: "info" | "low" | "medium" | "high" | "critical" }>;
  blockedActions: Array<{ id: string; title: string; reason: string | null; severity: "info" | "low" | "medium" | "high" | "critical" }>;
  acceptedRisks: Array<{ id: string; title: string; summary: string }>;
  staleOrSupersededDecisions: Array<{ id: string; title: string; status: string }>;
  confidenceScore: number;
  trustScore: number;
  overallRiskScore: number;
  trustGaps: string[];
  importReviewBlockers: number;
  aiReviewBlockers: number;
  reminderHealthBlockers: number;
  upcomingDeadlines: Array<{ contractId: string | null; deadlineWindow: string; spendAtRiskAmount: number }>;
  spendAtRiskAmount: number;
  dataQualityIssues: string[];
  whyThisMatters: string[];
};
