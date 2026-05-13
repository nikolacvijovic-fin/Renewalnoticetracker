export type BreadthClassification =
  | "wedge-critical"
  | "monetization-supporting"
  | "retention-supporting"
  | "breadth-secondary"
  | "defer / cut";

export type BreadthTier = "Tier 1" | "Tier 2" | "Tier 3";

export type BreadthRegisterItem = {
  name: string;
  purpose: string;
  targetPersona: string;
  wedgeRelevance: "high" | "medium" | "low";
  monetizationImpact: "high" | "medium" | "low";
  retentionImpact: "high" | "medium" | "low";
  supportBurden: "low" | "medium" | "high";
  implementationComplexity: "low" | "medium" | "high";
  placement: "Starter" | "Growth" | "Portfolio" | "add-on" | "services" | "later";
  classification: BreadthClassification;
  tier: BreadthTier;
};

export const breadthRegister: BreadthRegisterItem[] = [
  {
    name: "Contract upload and extraction",
    purpose: "Turn buried dates into a trackable workflow quickly.",
    targetPersona: "Finance ops, procurement ops, legal ops-lite",
    wedgeRelevance: "high",
    monetizationImpact: "high",
    retentionImpact: "high",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Starter",
    classification: "wedge-critical",
    tier: "Tier 1"
  },
  {
    name: "Essential review workflow",
    purpose: "Confirm reviewed truth before reminders become trusted automation.",
    targetPersona: "Operational owner",
    wedgeRelevance: "high",
    monetizationImpact: "high",
    retentionImpact: "high",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Starter",
    classification: "wedge-critical",
    tier: "Tier 1"
  },
  {
    name: "Owner assignment and renewal decisions",
    purpose: "Embed accountability and recurring workflow depth.",
    targetPersona: "Department owners and ops admins",
    wedgeRelevance: "high",
    monetizationImpact: "medium",
    retentionImpact: "high",
    supportBurden: "low",
    implementationComplexity: "low",
    placement: "Starter",
    classification: "wedge-critical",
    tier: "Tier 1"
  },
  {
    name: "Multi-recipient reminders and escalations",
    purpose: "Add team coordination depth that naturally supports upgrades.",
    targetPersona: "Cross-functional ops teams",
    wedgeRelevance: "high",
    monetizationImpact: "high",
    retentionImpact: "high",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Growth",
    classification: "monetization-supporting",
    tier: "Tier 1"
  },
  {
    name: "Slack and Teams delivery",
    purpose: "Move reminders into the channels teams already watch.",
    targetPersona: "Ops-led teams with broader coordination needs",
    wedgeRelevance: "medium",
    monetizationImpact: "high",
    retentionImpact: "high",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Growth",
    classification: "retention-supporting",
    tier: "Tier 2"
  },
  {
    name: "Portfolio reporting and executive visibility",
    purpose: "Make renewal exposure visible to leadership.",
    targetPersona: "Ops leaders and finance leaders",
    wedgeRelevance: "medium",
    monetizationImpact: "high",
    retentionImpact: "medium",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Portfolio",
    classification: "monetization-supporting",
    tier: "Tier 2"
  },
  {
    name: "Templates and playbooks",
    purpose: "Standardize recurring workflow setups after first value is reached.",
    targetPersona: "Admins and repeat operators",
    wedgeRelevance: "medium",
    monetizationImpact: "medium",
    retentionImpact: "high",
    supportBurden: "medium",
    implementationComplexity: "medium",
    placement: "Growth",
    classification: "breadth-secondary",
    tier: "Tier 2"
  },
  {
    name: "Broader governance and security controls",
    purpose: "Support wider rollout and portfolio maturity.",
    targetPersona: "Portfolio admins",
    wedgeRelevance: "medium",
    monetizationImpact: "high",
    retentionImpact: "medium",
    supportBurden: "medium",
    implementationComplexity: "high",
    placement: "Portfolio",
    classification: "breadth-secondary",
    tier: "Tier 2"
  },
  {
    name: "CLM-like workflow expansion",
    purpose: "Generalize into broader contract lifecycle software.",
    targetPersona: "Enterprise-lite CLM seekers",
    wedgeRelevance: "low",
    monetizationImpact: "low",
    retentionImpact: "low",
    supportBurden: "high",
    implementationComplexity: "high",
    placement: "later",
    classification: "defer / cut",
    tier: "Tier 3"
  },
  {
    name: "Bespoke approval chains and custom workflow branches",
    purpose: "Handle edge-case enterprise process variation.",
    targetPersona: "Custom-work buyers",
    wedgeRelevance: "low",
    monetizationImpact: "low",
    retentionImpact: "low",
    supportBurden: "high",
    implementationComplexity: "high",
    placement: "later",
    classification: "defer / cut",
    tier: "Tier 3"
  }
];
