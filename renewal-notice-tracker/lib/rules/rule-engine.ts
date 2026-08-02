import type { Rule, RuleOutcome } from "@/lib/rules/rule-types";

export function evaluateRules<TInput>(input: TInput, rules: Array<Rule<TInput>>): RuleOutcome[] {
  return rules.flatMap((rule) => rule.evaluate(input));
}

export function summarizeRuleOutcomes(outcomes: RuleOutcome[]) {
  return {
    findingCount: outcomes.filter((outcome) => outcome.outcomeType === "finding").length,
    recommendationCount: outcomes.filter((outcome) => outcome.outcomeType === "recommendation" || outcome.outcomeType === "next_action").length,
    blockerCount: outcomes.filter((outcome) => outcome.outcomeType === "blocker").length,
    criticalCount: outcomes.filter((outcome) => outcome.severity === "critical").length,
    highCount: outcomes.filter((outcome) => outcome.severity === "high").length
  };
}
