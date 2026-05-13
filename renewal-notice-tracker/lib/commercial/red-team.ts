export type ProfitabilityRisk = {
  title: string;
  critique: string;
  whyItIsDangerous: string;
};

export const redTeamAnalysis = {
  brutalCritique:
    "The product has a real wedge, but it is still at risk of behaving like an impressive contract-ops demo rather than a durable, high-margin business. Too much of the strategy assumes disciplined ICP selection, healthy activation, and clean services execution. If the team relaxes on any of those, the business degrades fast.",
  hiddenProfitLeaks: [
    "Free and trial users can still create meaningful support and extraction load before proving buying intent.",
    "Imports create operational value but also create hidden delivery cost when source data is messy.",
    "Some monetization still depends on feature gates that are not as economically strong as coverage and coordination depth."
  ],
  fakeMonetizationLogic: [
    "If exports or digest gating are treated as primary monetization, that is fake leverage compared with tracked-contract coverage and team coordination.",
    "If the business celebrates plan upgrades without measuring support burden and gross margin by account, the monetization picture is incomplete."
  ],
  weakUpgradeGates: [
    "Exports are a useful prompt but not the deepest source of willingness to pay.",
    "Digest gating helps, but it is not a strong enough engine by itself.",
    "Starter to Growth pressure can still be too soft if multi-team coordination is not made operationally obvious."
  ],
  lowValueCustomerTraps: [
    "Tiny SMBs that want hand-holding but do not have enough contract exposure to justify spend.",
    "Accounts treating the product like a one-time cleanup tool instead of an operating system."
  ],
  supportHeavyCustomerTraps: [
    "Messy spreadsheet migrations with no willingness to buy implementation help.",
    "Enterprise-lite teams asking for CLM behavior under SMB pricing."
  ],
  pricingIllusions: [
    "Believing the current price points are validated before segment-level retention and margin data exist.",
    "Assuming contract-band pricing is enough if activation and workflow depth remain weak."
  ],
  featureBloatRisks: [
    "Adding governance, reporting, or workflow depth without enforcing clear monetization or retention value.",
    "Letting roadmap decisions drift toward negotiation, drafting, or approvals."
  ],
  falseGtmAssumptions: [
    "Assuming founder-led outbound will scale without tight messaging and proof points.",
    "Assuming partner channels will work before defining a repeatable referral motion.",
    "Assuming self-serve buyers will convert if the onboarding remains even slightly ambiguous."
  ],
  optimisticRetentionAssumptions: [
    "Assuming reminders alone create stickiness.",
    "Assuming accounts that upload contracts will naturally expand coverage later.",
    "Assuming reporting or quarterly review will be adopted without structured success motion."
  ],
  impressiveButNotProfitable: [
    "Sophisticated admin/debug tooling can look impressive while masking operational fragility.",
    "AI extraction and broad import support can make the product feel advanced while quietly hurting gross margin.",
    "A large feature list can create demos that sell well but support badly."
  ],
  topMistakesBeingRisked: [
    "Confusing activation with retention",
    "Overestimating willingness to pay from small teams",
    "Treating support-heavy imports as growth instead of cost",
    "Underpricing Growth coordination value",
    "Letting services become custom consulting",
    "Believing broad trials are harmless",
    "Assuming all contract volume is equally valuable",
    "Measuring top-line conversion without margin",
    "Chasing enterprise buyers too early",
    "Letting CLM adjacency creep into the roadmap"
  ],
  mustChange: [
    "Keep monetization centered on tracked-contract coverage and coordination depth.",
    "Treat messy imports and workflow setup as paid, scoped work.",
    "Disqualify low-fit and CLM-seeking accounts faster.",
    "Track gross margin, support hours, and onboarding burden by segment, not just revenue.",
    "Make activation and retention milestones much more operationally explicit."
  ],
  leanerStrongerStrategy: [
    "Sell to a narrower ICP with real renewal pain and moderate complexity.",
    "Make the product win on renewal control, not broad contract management.",
    "Use services only to accelerate adoption and expansion, never to replace product value.",
    "Cut features and customers that look exciting but do not improve margin, retention, or ACV."
  ]
};

export const redTeamRisks: ProfitabilityRisk[] = [
  {
    title: "The app may still be over-serving free and trial accounts",
    critique:
      "The team has improved gating, but the product still risks giving meaningful extraction, import, and support value away before buying intent is proven.",
    whyItIsDangerous:
      "This creates hidden gross-margin loss while making the funnel look healthier than it really is."
  },
  {
    title: "Some monetization still feels cosmetic",
    critique:
      "If the business leans too hard on export or digest gating, it is monetizing peripheral behavior instead of the deepest value driver.",
    whyItIsDangerous:
      "Cosmetic gates irritate users without creating strong upgrade pressure."
  },
  {
    title: "Services can still slip into low-margin work",
    critique:
      "The service catalog is disciplined on paper, but delivery can still drift into exceptions and custom asks.",
    whyItIsDangerous:
      "One or two bad service habits can turn a software business into a consulting business."
  },
  {
    title: "The wrong customers can still poison economics",
    critique:
      "Tiny teams and enterprise-lite CLM seekers are still tempting because they show pain in demos.",
    whyItIsDangerous:
      "They either underpay or overload the product and support model."
  },
  {
    title: "The product can look sticky before it is actually embedded",
    critique:
      "A workspace with uploaded contracts and some reminders can still churn if owners, decisions, and reporting are weak.",
    whyItIsDangerous:
      "The team may overestimate retention quality based on surface activity."
  }
];
