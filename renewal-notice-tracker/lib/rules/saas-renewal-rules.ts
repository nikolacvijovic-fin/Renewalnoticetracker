import { evaluateRules } from "@/lib/rules/rule-engine";
import { decisionCandidatesFromRuleOutcomes } from "@/lib/decision-intelligence/decision-records";
import { createDecisionRecord } from "@/lib/decision-intelligence/decision-records";
import { governedActionCandidatesFromDecisionRecords } from "@/lib/action-governance/action-engine";
import type { DecisionCandidate } from "@/lib/decision-intelligence/decision-types";
import type { GovernedActionCandidate } from "@/lib/action-governance/action-types";
import type { Rule, RuleOutcome } from "@/lib/rules/rule-types";

export type SaasRenewalRulesInput = {
  noticeDeadline: string | null;
  today?: string;
  autoRenewal?: boolean | null;
  ownerUserId?: string | null;
  evidenceConfidence?: number | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
  metadataConflictCount?: number;
  duplicateImportSuspected?: boolean;
  manualWithoutEvidence?: boolean;
  untrustedAiCriticalFactCount?: number;
  unresolvedTrustOverrideCount?: number;
};

const HIGH_SPEND_AT_RISK_THRESHOLD = 25000;
const WEAK_EVIDENCE_THRESHOLD = 0.75;

function daysUntil(date: string | null, today = new Date().toISOString().slice(0, 10)) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const current = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(current.getTime())) return null;
  return Math.ceil((parsed.getTime() - current.getTime()) / 86400000);
}

function outcome(input: Omit<RuleOutcome, "evidence"> & { evidence?: RuleOutcome["evidence"] }): RuleOutcome {
  return {
    evidence: [],
    ...input
  };
}

export const saasRenewalRules: Array<Rule<SaasRenewalRulesInput>> = [
  {
    id: "missing_notice_deadline",
    evaluate(input) {
      if (input.noticeDeadline) return [];
      return [outcome({
        ruleId: "missing_notice_deadline",
        outcomeType: "blocker",
        code: "missing_notice_deadline",
        severity: "high",
        message: "Notice deadline is missing, so the opt-out clock cannot be trusted.",
        recommendedAction: "Review source evidence and record a trusted notice deadline.",
        evidence: [{ code: "notice_deadline_missing", source: "system_rule" }]
      })];
    }
  },
  {
    id: "weak_evidence",
    evaluate(input) {
      if (input.evidenceConfidence === null || input.evidenceConfidence === undefined || input.evidenceConfidence >= WEAK_EVIDENCE_THRESHOLD) return [];
      return [outcome({
        ruleId: "weak_evidence",
        outcomeType: "blocker",
        code: "weak_evidence",
        severity: "high",
        message: "Evidence confidence is below the trusted renewal-defense threshold.",
        recommendedAction: "Accept weak evidence explicitly or replace it with stronger source evidence.",
        evidence: [{ code: "evidence_confidence", value: input.evidenceConfidence, confidence: input.evidenceConfidence, source: "saas_import" }]
      })];
    }
  },
  {
    id: "missing_owner",
    evaluate(input) {
      if (input.ownerUserId) return [];
      return [outcome({
        ruleId: "missing_owner",
        outcomeType: "blocker",
        code: "missing_owner",
        severity: "medium",
        message: "No accountable owner is assigned.",
        recommendedAction: "Assign an owner before relying on the workflow.",
        evidence: [{ code: "owner_missing", source: "system_rule" }]
      })];
    }
  },
  {
    id: "opt_out_window",
    evaluate(input) {
      const days = daysUntil(input.noticeDeadline, input.today);
      if (days === null) return [];
      if (days < 0) {
        return [outcome({
          ruleId: "expired_opt_out_window",
          outcomeType: "finding",
          code: "expired_opt_out_window",
          severity: "critical",
          message: "The opt-out deadline has passed.",
          recommendedAction: "Escalate renewal decision review.",
          evidence: [{ code: "days_until_opt_out", value: days, source: "system_rule" }]
        })];
      }
      if (days <= 14) {
        return [outcome({
          ruleId: "critical_opt_out_window",
          outcomeType: "finding",
          code: "critical_opt_out_window",
          severity: "critical",
          message: "The opt-out deadline is in the critical window.",
          recommendedAction: "Prioritize review before the deadline.",
          evidence: [{ code: "days_until_opt_out", value: days, source: "system_rule" }]
        })];
      }
      if (days <= 60) {
        return [outcome({
          ruleId: "deadline_soon",
          outcomeType: "recommendation",
          code: "deadline_soon",
          severity: days <= 30 ? "high" : "medium",
          message: "The opt-out deadline is approaching.",
          recommendedAction: "Confirm owner and next action.",
          evidence: [{ code: "days_until_opt_out", value: days, source: "system_rule" }]
        })];
      }
      return [];
    }
  },
  {
    id: "auto_renewal",
    evaluate(input) {
      if (!input.autoRenewal) return [];
      const days = daysUntil(input.noticeDeadline, input.today);
      return [outcome({
        ruleId: "auto_renewal",
        outcomeType: "finding",
        code: "auto_renewal",
        severity: days !== null && days <= 14 ? "critical" : "medium",
        message: "Auto-renewal is enabled.",
        recommendedAction: "Confirm the opt-out decision before the notice deadline.",
        evidence: [{ code: "auto_renewal_true", value: true, source: "saas_term" }]
      })];
    }
  },
  {
    id: "high_spend_at_risk",
    evaluate(input) {
      const amount = Number(input.contractValueAmount ?? 0);
      if (!input.noticeDeadline || amount < HIGH_SPEND_AT_RISK_THRESHOLD) return [];
      const days = daysUntil(input.noticeDeadline, input.today);
      return [outcome({
        ruleId: "high_spend_at_risk",
        outcomeType: "finding",
        code: "high_spend_at_risk",
        severity: days !== null && days <= 14 ? "critical" : "high",
        message: "High spend is attached to this opt-out window.",
        recommendedAction: "Prioritize finance/procurement review.",
        evidence: [
          { code: "contract_value_amount", value: amount, source: "saas_term" },
          { code: "contract_value_currency", value: input.contractValueCurrency ?? null, source: "saas_term" }
        ]
      })];
    }
  },
  {
    id: "metadata_conflict",
    evaluate(input) {
      if (!input.metadataConflictCount) return [];
      return [outcome({
        ruleId: "metadata_conflict",
        outcomeType: "blocker",
        code: "metadata_conflict",
        severity: "high",
        message: "Contract metadata and SaaS term data disagree on controlled renewal fields.",
        recommendedAction: "Record a trusted overlay decision.",
        evidence: [{ code: "metadata_conflict_count", value: input.metadataConflictCount, source: "system_rule" }]
      })];
    }
  },
  {
    id: "duplicate_import_suspected",
    evaluate(input) {
      if (!input.duplicateImportSuspected) return [];
      return [outcome({
        ruleId: "duplicate_import_suspected",
        outcomeType: "blocker",
        code: "duplicate_import_suspected",
        severity: "medium",
        message: "Imported SaaS row may duplicate an existing renewal-defense record.",
        recommendedAction: "Confirm duplicate status before activation.",
        evidence: [{ code: "duplicate_import_suspected", value: true, source: "saas_import" }]
      })];
    }
  },
  {
    id: "trust_boundaries",
    evaluate(input) {
      const outcomes: RuleOutcome[] = [];
      if (input.manualWithoutEvidence) {
        outcomes.push(outcome({
          ruleId: "manual_without_evidence",
          outcomeType: "blocker",
          code: "manual_without_evidence",
          severity: "medium",
          message: "Manual data without source evidence requires review.",
          recommendedAction: "Add evidence or record explicit accepted risk.",
          evidence: [{ code: "manual_without_evidence", value: true, source: "manual_review" }]
        }));
      }
      if ((input.untrustedAiCriticalFactCount ?? 0) > 0) {
        outcomes.push(outcome({
          ruleId: "untrusted_ai_extraction",
          outcomeType: "blocker",
          code: "untrusted_ai_extraction",
          severity: "high",
          message: "AI-derived critical facts remain proposed until reviewed.",
          recommendedAction: "Review AI evidence before trusting renewal-control fields.",
          evidence: [{ code: "untrusted_ai_critical_fact_count", value: input.untrustedAiCriticalFactCount ?? 0, source: "ai_proposed_fact" }]
        }));
      }
      if ((input.unresolvedTrustOverrideCount ?? 0) > 0) {
        outcomes.push(outcome({
          ruleId: "unresolved_trust_override",
          outcomeType: "blocker",
          code: "unresolved_trust_override",
          severity: "high",
          message: "A trusted override is still unresolved.",
          recommendedAction: "Resolve or reopen the trust decision explicitly.",
          evidence: [{ code: "unresolved_trust_override_count", value: input.unresolvedTrustOverrideCount ?? 0, source: "system_rule" }]
        }));
      }
      return outcomes;
    }
  },
  {
    id: "no_send_boundary",
    evaluate() {
      return [outcome({
        ruleId: "no_send_boundary",
        outcomeType: "blocker",
        code: "no_send_boundary",
        severity: "info",
        message: "Renewal-defense rules may recommend action but must not send external notices.",
        recommendedAction: "Keep external delivery as a human-controlled action.",
        evidence: [{ code: "no_external_send", value: true, source: "system_rule" }]
      })];
    }
  }
];

export function evaluateSaasRenewalRules(input: SaasRenewalRulesInput) {
  return evaluateRules(input, saasRenewalRules);
}

export function saasRenewalRuleMetadata() {
  return saasRenewalRules.map((rule) => ({
    ruleId: rule.id,
    name: rule.name ?? rule.id.replaceAll("_", " "),
    description: rule.description ?? "Deterministic SaaS renewal-defense rule.",
    category: rule.category ?? (rule.id.includes("ai") ? "ai" : rule.id.includes("import") || rule.id.includes("duplicate") ? "import" : rule.id.includes("evidence") || rule.id.includes("trust") || rule.id.includes("metadata") ? "trust" : "saas"),
    severity: rule.severity ?? "medium",
    requiredInputs: rule.requiredInputs ?? ["noticeDeadline", "ownerUserId", "evidenceConfidence", "contractValueAmount"],
    outputDecisionType: rule.outputDecisionType ?? "finding",
    noSendBoundary: rule.noSendBoundary ?? rule.id === "no_send_boundary"
  }));
}

export function evaluateSaasRenewalDecisionCandidates(input: {
  organizationId: string;
  entityType: string;
  entityId?: string | null;
  rulesInput: SaasRenewalRulesInput;
  ownerUserId?: string | null;
  dueAt?: string | null;
}): DecisionCandidate[] {
  return decisionCandidatesFromRuleOutcomes({
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    outcomes: evaluateSaasRenewalRules(input.rulesInput),
    ownerUserId: input.ownerUserId,
    dueAt: input.dueAt
  });
}

export function evaluateSaasRenewalGovernedActionCandidates(input: {
  organizationId: string;
  entityType: string;
  entityId?: string | null;
  rulesInput: SaasRenewalRulesInput;
  ownerUserId?: string | null;
  dueAt?: string | null;
  now?: string;
}): GovernedActionCandidate[] {
  const now = input.now ?? new Date().toISOString();
  const decisions = evaluateSaasRenewalDecisionCandidates(input).map((candidate) =>
    createDecisionRecord(candidate, now)
  );
  return governedActionCandidatesFromDecisionRecords(decisions);
}
