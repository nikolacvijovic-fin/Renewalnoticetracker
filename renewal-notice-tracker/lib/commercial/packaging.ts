export type PricingModelOption = {
  name: string;
  model: string;
  strengths: string[];
  weaknesses: string[];
  recommended?: boolean;
};

export type PackagingFeature = {
  feature: string;
  entryPlan: string;
  growthPlan: string;
  topTier: string;
  gateType: "included" | "usage_gated" | "add_on" | "service_led";
  rationale: string;
};

export type PackagingCategory = {
  name:
    | "core_workflow"
    | "team_collaboration"
    | "reminders_escalations"
    | "imports_exports"
    | "visibility_reporting"
    | "admin_security"
    | "integrations"
    | "support_onboarding";
  label: string;
  critique: string;
  features: PackagingFeature[];
};

export const pricingModelOptions: PricingModelOption[] = [
  {
    name: "Seat-Based Tiering",
    model: "Per seat with feature tiers",
    strengths: [
      "Easy to understand at a glance",
      "Familiar SaaS billing motion",
      "Simple to operationalize in billing"
    ],
    weaknesses: [
      "Misaligned to contract risk under management",
      "Punishes collaboration",
      "Underprices large portfolios with few users"
    ]
  },
  {
    name: "Flat Workspace Pricing",
    model: "Per workspace with feature tiers",
    strengths: [
      "Simple commercial story",
      "Low buying friction",
      "Works for early self-serve motion"
    ],
    weaknesses: [
      "Underprices bigger portfolios",
      "Weak natural expansion logic",
      "Does not capture rising contract-risk value well"
    ]
  },
  {
    name: "Hybrid Contract-Band Pricing",
    model: "Workspace plus active tracked contract bands plus included editors",
    strengths: [
      "Best alignment to risk under management",
      "Creates natural expansion as portfolios centralize",
      "Preserves collaboration with included editor seats"
    ],
    weaknesses: [
      "Slightly more complex than flat workspace pricing",
      "Requires a clear active-contract definition",
      "Needs disciplined expansion rules above Growth"
    ],
    recommended: true
  }
];

export const pricingAnchors = [
  "One missed notice window can cost more than a year of software.",
  "Cheaper than a surprise auto-renewal or an unmanaged vendor renewal cycle.",
  "Built for renewal control without paying for CLM overhead.",
  "Annual plans include rollout help so teams reach operational value faster."
];

export const chargeFor = [
  "Active tracked contract capacity",
  "Deeper coordination and escalation workflows",
  "Broader operational usage across departments",
  "Governance and admin controls at higher maturity",
  "Implementation-heavy services such as onboarding and import cleanup"
];

export const doNotChargeFor = [
  "Basic reminders",
  "Core review workflow",
  "Core dashboard visibility",
  "ICS export",
  "Commodity actions like every export click or reminder send",
  "Viewer access"
];

export const pricingMistakesToAvoid = [
  "Pricing like a generic reminder app instead of risk-control software",
  "Leading with seat pricing",
  "Making Starter too weak to become operationally useful",
  "Charging separately for basics that feel intrinsic to the wedge",
  "Using freemium to attract low-urgency, support-heavy accounts",
  "Letting CLM-shaped enterprise buyers distort packaging early"
];

export const packagingCategories: PackagingCategory[] = [
  {
    name: "core_workflow",
    label: "Core workflow",
    critique:
      "The core workflow should be strong in Entry. If you cripple upload, review, and basic reminders too early, adoption dies before monetization starts.",
    features: [
      {
        feature: "Contract upload and AI extraction",
        entryPlan: "Included with active tracked contract cap",
        growthPlan: "Included with higher contract cap",
        topTier: "Included with custom contract bands",
        gateType: "usage_gated",
        rationale: "This is core value, but it must be bounded by contract capacity."
      },
      {
        feature: "Manual review and correction",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Do not monetize trust-building workflow directly."
      },
      {
        feature: "Owner assignment and renewal decisions",
        entryPlan: "Included",
        growthPlan: "Included with more workflow depth",
        topTier: "Included with governance reporting",
        gateType: "included",
        rationale: "This is what makes the product operationally sticky."
      }
    ]
  },
  {
    name: "team_collaboration",
    label: "Team collaboration",
    critique:
      "This is where Growth should start to separate. Collaboration depth is monetizable, but seat taxes should not block early adoption.",
    features: [
      {
        feature: "Included editor seats",
        entryPlan: "5 editors",
        growthPlan: "15 editors",
        topTier: "Custom included seats",
        gateType: "usage_gated",
        rationale: "Generous included seats avoid early collaboration friction."
      },
      {
        feature: "Unlimited viewers",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "View-only access should not be a monetization lever."
      },
      {
        feature: "Multi-department workflow",
        entryPlan: "Lightweight use",
        growthPlan: "Full use",
        topTier: "Full use with governance",
        gateType: "included",
        rationale: "Natural Growth trigger when workflows spread across teams."
      }
    ]
  },
  {
    name: "reminders_escalations",
    label: "Reminders and escalations",
    critique:
      "Basic reminders belong in Entry. Multi-recipient routing and escalation logic are premium because they reflect organizational complexity.",
    features: [
      {
        feature: "Single-recipient reminders",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Core wedge functionality."
      },
      {
        feature: "Multi-recipient reminders",
        entryPlan: "Limited",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Strong natural Growth upgrade trigger."
      },
      {
        feature: "Escalation chains and routing",
        entryPlan: "Not included",
        growthPlan: "Included",
        topTier: "Included with advanced controls",
        gateType: "included",
        rationale: "Premium coordination value with real WTP."
      }
    ]
  },
  {
    name: "imports_exports",
    label: "Imports and exports",
    critique:
      "These are high-intent commercial moments. They should not be free forever, but they also should not be fragmented into tiny paid actions.",
    features: [
      {
        feature: "Bulk spreadsheet import",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Import is part of adoption, but cleanup work should be service-led."
      },
      {
        feature: "Spreadsheet cleanup and mapping",
        entryPlan: "Available as service",
        growthPlan: "Available as service",
        topTier: "Included or discounted in implementation package",
        gateType: "service_led",
        rationale: "High-margin implementation work, not product feature value."
      },
      {
        feature: "CSV / Excel export",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Useful, but not strong enough to be the main monetization lever alone."
      }
    ]
  },
  {
    name: "visibility_reporting",
    label: "Visibility and reporting",
    critique:
      "Basic visibility belongs in Entry. Executive-ready reporting and recurring portfolio review are monetizable layers.",
    features: [
      {
        feature: "Dashboard and due-soon visibility",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Without this, the wedge falls apart."
      },
      {
        feature: "Executive-ready reporting packs",
        entryPlan: "Not included",
        growthPlan: "Add-on",
        topTier: "Included or bundled",
        gateType: "add_on",
        rationale: "Good add-on for finance and procurement leadership."
      },
      {
        feature: "Quarterly portfolio review",
        entryPlan: "Not included",
        growthPlan: "Add-on",
        topTier: "Add-on or packaged success motion",
        gateType: "add_on",
        rationale: "Supports retention and expansion without bloating the core product."
      }
    ]
  },
  {
    name: "admin_security",
    label: "Admin and security",
    critique:
      "Higher governance belongs at the top tier. Do not pollute Entry and Growth with enterprise-style control complexity too early.",
    features: [
      {
        feature: "Operational admin tooling",
        entryPlan: "Light",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Growth teams need operational control without full enterprise governance."
      },
      {
        feature: "Approval controls and advanced governance",
        entryPlan: "Not included",
        growthPlan: "Limited",
        topTier: "Included",
        gateType: "included",
        rationale: "Clear top-tier separation."
      },
      {
        feature: "SSO and security requirements",
        entryPlan: "Not included",
        growthPlan: "Not included",
        topTier: "Included",
        gateType: "included",
        rationale: "Classic top-tier monetization for larger buyers."
      }
    ]
  },
  {
    name: "integrations",
    label: "Integrations",
    critique:
      "Simple delivery integrations are strong Growth triggers. Avoid building a huge integration surface without proof of monetization.",
    features: [
      {
        feature: "Email delivery",
        entryPlan: "Included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Core reminder channel."
      },
      {
        feature: "Slack / Teams delivery",
        entryPlan: "Not included",
        growthPlan: "Included",
        topTier: "Included",
        gateType: "included",
        rationale: "Natural Growth trigger when the product becomes team-operational."
      }
    ]
  },
  {
    name: "support_onboarding",
    label: "Support and onboarding",
    critique:
      "This is where margin discipline matters. Setup help should be monetized and templatized, not absorbed as free custom support.",
    features: [
      {
        feature: "Standard onboarding package",
        entryPlan: "Available as add-on",
        growthPlan: "Available as add-on or annual incentive",
        topTier: "Bundled with implementation",
        gateType: "add_on",
        rationale: "High-margin, retention-positive package."
      },
      {
        feature: "Admin / training package",
        entryPlan: "Available as add-on",
        growthPlan: "Available as add-on",
        topTier: "Bundled or discounted",
        gateType: "add_on",
        rationale: "Reduces support burden and increases adoption."
      },
      {
        feature: "Renewal operations setup",
        entryPlan: "Service-led",
        growthPlan: "Service-led",
        topTier: "Included in higher-touch implementation",
        gateType: "service_led",
        rationale: "Best delivered as templated services, not as bespoke product customization."
      }
    ]
  }
];

export const weakCurrentGates = [
  "Relying too heavily on exports as a monetization lever",
  "Treating digest access as a major commercial gate",
  "Using seat constraints too early would hurt adoption more than it would help monetization"
];

export const naturalUpgradeTriggers = [
  "Approaching the active tracked contract cap",
  "Needing multi-recipient reminders",
  "Needing escalation chains or departmental routing",
  "Wanting Slack or Teams delivery",
  "Needing executive-ready reporting or quarterly portfolio review",
  "Rolling out to more operational editors across teams"
];

export const fastestPackagingProfitabilityWins = [
  "Keep the core workflow strong in Entry but usage-gated by active tracked contracts",
  "Make coordination depth the primary Growth differentiator",
  "Push reporting, quarterly review, and rollout work into add-ons and services",
  "Reserve governance and SSO for the top tier"
];

export const cutForPackagingDiscipline = [
  "Anything that pulls the product toward drafting or negotiation",
  "Enterprise approval logic without top-tier demand",
  "Broad integration sprawl without clear monetization power",
  "Feature flags that create complexity but not natural upgrade intent"
];
