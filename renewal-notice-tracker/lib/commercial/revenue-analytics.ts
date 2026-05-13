export type RevenueMetricDefinition = {
  name: string;
  category:
    | "pricing_funnel"
    | "upgrade"
    | "checkout"
    | "feature_gate"
    | "plan_mix"
    | "expansion"
    | "downgrade_cancellation"
    | "trial_to_paid"
    | "usage_correlation"
    | "revenue_warning"
    | "vanity"
    | "misleading"
    | "leading_indicator";
  formula: string;
  eventDependencies: string[];
  warningThreshold: string;
  whyItMatters: string;
};

export type RevenueDashboardSection = {
  title: string;
  purpose: string;
  widgets: string[];
};

export const revenueMetrics: RevenueMetricDefinition[] = [
  {
    name: "Pricing page to signup rate",
    category: "pricing_funnel",
    formula: "Unique workspaces created from attributed pricing page traffic divided by unique pricing_page_viewed sessions.",
    eventDependencies: ["pricing_page_viewed", "auth_signup_completed"],
    warningThreshold: "Investigate if it falls materially below recent baseline for 2 consecutive weeks.",
    whyItMatters: "Shows whether the pricing page is converting real intent into starts."
  },
  {
    name: "Signup to activation rate",
    category: "pricing_funnel",
    formula: "Activated workspaces divided by newly created workspaces in the same cohort window.",
    eventDependencies: [
      "auth_signup_completed",
      "contract_upload_completed",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created"
    ],
    warningThreshold: "Danger if activation drops below half of qualified signups.",
    whyItMatters: "Weak activation destroys paid conversion before pricing even matters."
  },
  {
    name: "Activation to checkout start rate",
    category: "pricing_funnel",
    formula: "Activated workspaces with billing_checkout_started divided by activated workspaces.",
    eventDependencies: ["billing_checkout_started"],
    warningThreshold: "Danger if activated users rarely start checkout after proving value.",
    whyItMatters: "Measures whether product value is translating into purchase intent."
  },
  {
    name: "Upgrade CTA click-through rate",
    category: "upgrade",
    formula: "upgrade_prompt_clicked divided by upgrade_prompt_viewed by prompt_context.",
    eventDependencies: ["upgrade_prompt_viewed", "upgrade_prompt_clicked"],
    warningThreshold: "Low single-digit CTR on a high-intent prompt means the prompt is weak or mistimed.",
    whyItMatters: "Shows which prompts actually create buying intent."
  },
  {
    name: "Starter to Growth upgrade rate",
    category: "upgrade",
    formula: "Workspaces changing from Starter to Growth divided by active Starter workspaces.",
    eventDependencies: ["plan_changed"],
    warningThreshold: "Stalling upgrades alongside rising coordination usage is a pricing or packaging mismatch.",
    whyItMatters: "Key expansion path for this product."
  },
  {
    name: "Checkout completion rate",
    category: "checkout",
    formula: "checkout_completed divided by billing_checkout_started.",
    eventDependencies: ["billing_checkout_started", "checkout_completed"],
    warningThreshold: "A persistent drop suggests checkout friction, pricing resistance, or billing-provider issues.",
    whyItMatters: "Shows whether purchase intent converts cleanly into revenue."
  },
  {
    name: "Checkout abandonment rate",
    category: "checkout",
    formula: "1 minus checkout completion rate.",
    eventDependencies: ["billing_checkout_started", "checkout_completed"],
    warningThreshold: "Danger if abandonment rises sharply after pricing or packaging changes.",
    whyItMatters: "Early warning on pricing and billing friction."
  },
  {
    name: "Feature-gate click-through rate",
    category: "feature_gate",
    formula: "commercial_gate_clicked divided by commercial_gate_shown by feature.",
    eventDependencies: ["commercial_gate_shown", "commercial_gate_clicked"],
    warningThreshold: "Near-zero CTR means the gate is weak or annoying rather than monetizing.",
    whyItMatters: "Separates real commercial pressure from cosmetic gating."
  },
  {
    name: "Feature-gate conversion rate",
    category: "feature_gate",
    formula: "checkout_completed within attribution window after a gate click divided by commercial_gate_clicked.",
    eventDependencies: ["commercial_gate_clicked", "checkout_completed"],
    warningThreshold: "Low gate conversion means the gate may be mistimed or low-value.",
    whyItMatters: "Measures monetization quality at actual workflow pressure points."
  },
  {
    name: "Plan mix by workspace",
    category: "plan_mix",
    formula: "Active workspaces by plan divided by total active paid workspaces.",
    eventDependencies: ["plan_changed", "checkout_completed", "plan_cancelled"],
    warningThreshold: "Too much low-end mix with high support burden erodes economics.",
    whyItMatters: "Shows where the customer base and revenue base are concentrating."
  },
  {
    name: "Plan mix by MRR",
    category: "plan_mix",
    formula: "MRR attributed to each plan divided by total MRR.",
    eventDependencies: ["checkout_completed", "plan_changed", "plan_cancelled"],
    warningThreshold: "Overreliance on low-ARPU mix is a structural warning.",
    whyItMatters: "Revenue mix matters more than logo mix."
  },
  {
    name: "Expansion MRR rate",
    category: "expansion",
    formula: "Expansion MRR in period divided by opening-period MRR.",
    eventDependencies: ["plan_changed", "checkout_completed"],
    warningThreshold: "Weak expansion with strong usage depth means packaging leaves money on the table.",
    whyItMatters: "Core measure of monetization depth after initial sale."
  },
  {
    name: "Contract-band expansion rate",
    category: "expansion",
    formula: "Workspaces moving into higher contract bands divided by band-eligible workspaces.",
    eventDependencies: ["contract_creation_denied", "plan_changed"],
    warningThreshold: "If contract-cap pressure rises but expansions do not, pricing logic is failing.",
    whyItMatters: "Best value-metric expansion path for this product."
  },
  {
    name: "Downgrade rate",
    category: "downgrade_cancellation",
    formula: "Downgraded workspaces divided by active paid workspaces in the period.",
    eventDependencies: ["plan_changed"],
    warningThreshold: "Rising downgrade rate often signals pricing mismatch or weak embedded value.",
    whyItMatters: "Detects contraction before full churn."
  },
  {
    name: "Cancellation rate",
    category: "downgrade_cancellation",
    formula: "Cancelled paid workspaces divided by active paid workspaces in the period.",
    eventDependencies: ["plan_cancelled"],
    warningThreshold: "Any sustained increase should trigger churn-cause review by segment and source.",
    whyItMatters: "Core revenue-retention indicator."
  },
  {
    name: "Trial to paid rate",
    category: "trial_to_paid",
    formula: "Workspaces with checkout_completed during or immediately after trial divided by trial-started workspaces.",
    eventDependencies: ["auth_signup_completed", "checkout_completed"],
    warningThreshold: "Weak trial-to-paid with healthy activation means pricing or commercial motion is off.",
    whyItMatters: "Primary self-serve monetization KPI."
  },
  {
    name: "Time to paid",
    category: "trial_to_paid",
    formula: "Median days from auth_signup_completed to checkout_completed.",
    eventDependencies: ["auth_signup_completed", "checkout_completed"],
    warningThreshold: "If time to paid drifts later without better conversion, monetization urgency is weakening.",
    whyItMatters: "Useful for trial design, lifecycle campaigns, and payback."
  },
  {
    name: "Usage-to-paid correlation",
    category: "usage_correlation",
    formula: "Compare conversion rates across cohorts segmented by reviewed contracts, owner coverage, reminders, and decisions.",
    eventDependencies: [
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "renewal_decision_recorded",
      "checkout_completed"
    ],
    warningThreshold: "If deeper workflow usage does not correlate with paid conversion, the buying story or packaging is weak.",
    whyItMatters: "Shows which product behaviors actually predict revenue."
  },
  {
    name: "Plan usage depth correlation",
    category: "usage_correlation",
    formula: "Compare retention and expansion by plan against contract coverage, coordination depth, and reporting usage.",
    eventDependencies: [
      "plan_changed",
      "contract_review_completed",
      "contract_owner_assigned",
      "multi_recipient_reminder_attempted",
      "digest_sent"
    ],
    warningThreshold: "If higher plans are not showing deeper workflow usage, plan logic may be misaligned.",
    whyItMatters: "Validates plan packaging against real customer behavior."
  },
  {
    name: "Revenue warning score",
    category: "revenue_warning",
    formula: "Composite signal from falling activation, falling checkout completion, rising gate exposure without conversion, rising billing portal opens, and rising cancellations.",
    eventDependencies: [
      "auth_signup_completed",
      "billing_checkout_started",
      "checkout_completed",
      "commercial_gate_shown",
      "commercial_gate_clicked",
      "billing_portal_opened",
      "plan_cancelled"
    ],
    warningThreshold: "Escalate when 3 or more warning indicators deteriorate together over 2 review cycles.",
    whyItMatters: "Gives leadership one early warning system instead of waiting for revenue to miss."
  },
  {
    name: "Pricing-page traffic volume",
    category: "vanity",
    formula: "Count of pricing_page_viewed sessions.",
    eventDependencies: ["pricing_page_viewed"],
    warningThreshold: "No standalone threshold; use only with conversion quality.",
    whyItMatters: "By itself it is not meaningful."
  },
  {
    name: "Checkout starts without completion context",
    category: "misleading",
    formula: "Raw billing_checkout_started count.",
    eventDependencies: ["billing_checkout_started"],
    warningThreshold: "Misleading if celebrated without completion rate and segment quality.",
    whyItMatters: "Intent alone is not revenue."
  },
  {
    name: "Leading monetization indicators",
    category: "leading_indicator",
    formula: "Monitor activation rate, reviewed contract depth, owner coverage, first reminder rate, contract-cap pressure, and upgrade CTA CTR.",
    eventDependencies: [
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "contract_creation_denied",
      "upgrade_prompt_clicked"
    ],
    warningThreshold: "If these soften before revenue does, expect weaker paid conversion and expansion next.",
    whyItMatters: "Best early read on monetization health before lagging revenue changes."
  }
];

export const revenueDashboard: RevenueDashboardSection[] = [
  {
    title: "Pricing funnel",
    purpose: "Measure how top-of-funnel pricing intent moves into signup, activation, and paid intent.",
    widgets: [
      "pricing page views",
      "pricing page to signup",
      "signup to activation",
      "activation to checkout",
      "time to paid"
    ]
  },
  {
    title: "Upgrade and gates",
    purpose: "Measure whether upgrade prompts and workflow gates create real monetization pressure.",
    widgets: [
      "upgrade CTA CTR by prompt context",
      "gate CTR by feature",
      "gate-to-paid conversion",
      "contract-cap pressure",
      "Starter to Growth upgrade rate"
    ]
  },
  {
    title: "Checkout and billing",
    purpose: "Measure purchase intent, billing friction, and revenue realization.",
    widgets: [
      "checkout starts",
      "checkout completion rate",
      "checkout abandonment rate",
      "billing portal opens",
      "annual vs monthly conversion"
    ]
  },
  {
    title: "Expansion and contraction",
    purpose: "Track plan mix quality, upsell depth, and revenue leakage.",
    widgets: [
      "plan mix by workspace",
      "plan mix by MRR",
      "expansion MRR",
      "contract-band expansion",
      "downgrade rate",
      "cancellation rate"
    ]
  },
  {
    title: "Usage correlation and warnings",
    purpose: "Tie product behavior to monetization quality and catch revenue problems early.",
    widgets: [
      "usage-to-paid correlation",
      "plan usage depth correlation",
      "trial-to-paid by activation depth",
      "leading monetization indicators",
      "revenue warning score"
    ]
  }
];

export const revenueBlindSpots = [
  "Celebrating pricing-page traffic without activation and paid quality.",
  "Counting gate exposure without measuring whether it converts or just annoys.",
  "Looking at upgrade clicks without checkout completion.",
  "Looking at plan mix by logos but not by MRR or support burden.",
  "Measuring trial-to-paid without segmenting by activation depth and ICP quality."
];
