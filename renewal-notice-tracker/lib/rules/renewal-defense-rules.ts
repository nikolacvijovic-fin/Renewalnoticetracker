import type { RuleOutcome } from "@/lib/rules/rule-types";
import { evaluateSaasRenewalRules, type SaasRenewalRulesInput } from "@/lib/rules/saas-renewal-rules";

export type RenewalDefenseRuleInput = {
  saas?: SaasRenewalRulesInput | null;
};

export function evaluateRenewalDefenseRules(input: RenewalDefenseRuleInput): RuleOutcome[] {
  return [
    ...(input.saas ? evaluateSaasRenewalRules(input.saas) : [])
  ];
}
