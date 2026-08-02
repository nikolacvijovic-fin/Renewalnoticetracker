export type RuleSeverity = "info" | "low" | "medium" | "high" | "critical";
export type RuleOutcomeType = "finding" | "recommendation" | "blocker" | "status_change" | "next_action";
export type RuleCategory = "renewal" | "saas" | "import" | "trust" | "ai" | "reminder" | "security";

export type RuleEvidence = {
  code: string;
  value?: string | number | boolean | null;
  confidence?: number | null;
  source?: "contract_metadata" | "saas_import" | "saas_term" | "ai_proposed_fact" | "manual_review" | "system_rule";
};

export type RuleOutcome = {
  ruleId: string;
  outcomeType: RuleOutcomeType;
  code: string;
  severity: RuleSeverity;
  message: string;
  evidence: RuleEvidence[];
  recommendedAction?: string | null;
};

export type Rule<TInput> = {
  id: string;
  name?: string;
  description?: string;
  category?: RuleCategory;
  severity?: RuleSeverity;
  requiredInputs?: string[];
  outputDecisionType?: RuleOutcomeType;
  noSendBoundary?: boolean;
  evaluate(input: TInput): RuleOutcome[];
};
