export type ProfitabilityMetric = {
  name: string;
  category:
    | "core_profitability"
    | "ltv_proxy"
    | "payback"
    | "support_burden"
    | "onboarding_burden"
    | "ai_extraction_cost"
    | "notification_cost"
    | "gross_margin_warning"
    | "segment_profitability"
    | "leading_indicator";
  formula: string;
  eventDependencies: string[];
  warningThreshold: string;
  whyItMatters: string;
};

export type ProfitabilityDashboardSection = {
  title: string;
  purpose: string;
  widgets: string[];
};

export type ProfitabilityDrilldown = {
  name: string;
  cuts: string[];
  whyItMatters: string;
};

export type SegmentComparison = {
  segment: string;
  compareAgainst: string;
  metrics: string[];
  decisionUse: string;
};

export type InstrumentationRequirement = {
  eventOrLog: string;
  requiredProperties: string[];
  whyItMatters: string;
};

export const profitabilityAnalyticsMetrics: ProfitabilityMetric[] = [
  {
    name: "Gross margin by segment",
    category: "core_profitability",
    formula:
      "(Segment revenue minus segment-level support, onboarding, extraction, notification, storage, and ops costs) divided by segment revenue.",
    eventDependencies: ["plan_changed", "checkout_completed", "support logs", "cost allocation tables"],
    warningThreshold: "Warning below 75%, critical below 65% for SMB software economics.",
    whyItMatters: "This is the clearest measure of whether a segment is actually worth serving."
  },
  {
    name: "Contribution margin per account",
    category: "core_profitability",
    formula:
      "Account revenue minus directly attributable support, onboarding, extraction, notification, and rescue costs.",
    eventDependencies: ["plan_changed", "support tickets", "manual rescue logs", "cost allocation tables"],
    warningThreshold: "Warning when repeatedly negative after onboarding period.",
    whyItMatters: "Healthy topline can hide accounts that are individually unprofitable."
  },
  {
    name: "Support cost as percent of ACV",
    category: "core_profitability",
    formula: "Support labor cost per account divided by annualized contract value for that account.",
    eventDependencies: ["support tickets", "support time logs", "plan_changed"],
    warningThreshold: "Warning above 15%, critical above 25%.",
    whyItMatters: "Support-heavy customers quietly destroy margin."
  },
  {
    name: "Coverage expansion LTV proxy",
    category: "ltv_proxy",
    formula:
      "Share of retained accounts that increase active tracked contract coverage over the last two monthly periods.",
    eventDependencies: ["contract_created", "contract_archived", "plan_changed"],
    warningThreshold: "Warning if expansion stalls broadly across healthy cohorts.",
    whyItMatters: "Accounts that centralize more of their portfolio tend to stay longer and expand more."
  },
  {
    name: "Workflow depth LTV proxy",
    category: "ltv_proxy",
    formula:
      "Composite of owner coverage, reminder continuity, and due-soon decision coverage for paying accounts.",
    eventDependencies: [
      "first_owner_assigned",
      "reminder_created",
      "renewal_decision_recorded",
      "contract_review_completed"
    ],
    warningThreshold: "Warning if depth weakens in accounts older than 60 days.",
    whyItMatters: "Retention quality comes from embedded workflow depth, not raw contract count."
  },
  {
    name: "Activation-to-paid payback proxy",
    category: "payback",
    formula:
      "Median days from trial or signup to checkout_completed for qualified activated accounts, segmented by source.",
    eventDependencies: [
      "trial_started",
      "checkout_completed",
      "first_contract_reviewed",
      "first_owner_assigned",
      "first_reminder_created"
    ],
    warningThreshold: "Warning if payback trend lengthens for the same source or ICP.",
    whyItMatters: "Faster activation-to-paid motion usually means lower payback risk."
  },
  {
    name: "CAC recovery by segment",
    category: "payback",
    formula:
      "Estimated customer acquisition cost divided by monthly contribution margin, segmented by ICP, source, and plan.",
    eventDependencies: ["pricing_page_viewed", "checkout_completed", "plan_changed", "cost allocation tables"],
    warningThreshold: "Warning above 12 months, critical above 18 months.",
    whyItMatters: "Payback should be evaluated on contribution margin, not just MRR."
  },
  {
    name: "Support touches per active account",
    category: "support_burden",
    formula: "Count of support interactions per active paying account per month.",
    eventDependencies: ["support tickets", "cs interventions", "organization_id"],
    warningThreshold: "Warning when rising without higher ACV or plan depth.",
    whyItMatters: "Support intensity is a leading signal of margin pressure."
  },
  {
    name: "Time to support resolution for onboarding blockers",
    category: "support_burden",
    formula: "Median time from onboarding-related issue opened to resolved.",
    eventDependencies: ["support tickets", "issue tags", "resolution timestamps"],
    warningThreshold: "Warning if onboarding blockers remain unresolved across the trial window.",
    whyItMatters: "Slow rescue during onboarding hurts both conversion and margin."
  },
  {
    name: "Onboarding hours per converted account",
    category: "onboarding_burden",
    formula:
      "Total manual onboarding and migration hours for newly converted accounts divided by number of converted accounts.",
    eventDependencies: ["trial_converted", "onboarding time logs", "service delivery logs"],
    warningThreshold: "Warning if rising without ACV lift or service revenue coverage.",
    whyItMatters: "Too much onboarding labor compresses payback."
  },
  {
    name: "Messy-import burden rate",
    category: "onboarding_burden",
    formula: "Accounts requiring import cleanup or repeated import rescue divided by imported accounts.",
    eventDependencies: ["import_initiated", "import_failed", "service delivery logs", "support tickets"],
    warningThreshold: "Warning if common in low-ACV segments.",
    whyItMatters: "Messy imports are a predictable support and services cost driver."
  },
  {
    name: "Extraction cost per active tracked contract",
    category: "ai_extraction_cost",
    formula:
      "Allocated extraction cost divided by net active tracked contracts created through upload or extraction workflows.",
    eventDependencies: ["extraction_completed", "extraction_failed", "provider usage logs", "contract_created"],
    warningThreshold: "Warning when cost rises faster than price realization.",
    whyItMatters: "The core AI-heavy workflow must stay economically aligned with pricing."
  },
  {
    name: "Extraction cost per paying account",
    category: "ai_extraction_cost",
    formula: "Allocated extraction cost for the period divided by paying accounts using extraction in the period.",
    eventDependencies: ["extraction_completed", "provider usage logs", "plan_changed"],
    warningThreshold: "Warning if low-paying accounts consume disproportionate extraction cost.",
    whyItMatters: "Helps spot free-rider or underpriced cohorts."
  },
  {
    name: "Notification cost per live obligation",
    category: "notification_cost",
    formula:
      "Notification delivery and retry cost divided by obligations with active reminders in the period.",
    eventDependencies: ["reminder_sent", "reminder_failed", "notification_logs", "cost allocation tables"],
    warningThreshold: "Warning if retries or channel complexity push cost materially upward.",
    whyItMatters: "Reminder economics must remain healthy as workflow depth increases."
  },
  {
    name: "Retry-driven notification cost rate",
    category: "notification_cost",
    formula: "Retry-related notification cost divided by total notification cost.",
    eventDependencies: ["notification_logs", "attempt_count", "cost allocation tables"],
    warningThreshold: "Warning if retries become a large share of send cost.",
    whyItMatters: "This catches silent reliability-driven margin erosion."
  },
  {
    name: "Negative-margin account rate",
    category: "gross_margin_warning",
    formula: "Accounts with negative contribution margin divided by paying accounts.",
    eventDependencies: ["plan_changed", "support time logs", "service delivery logs", "cost allocation tables"],
    warningThreshold: "Warning above low single digits; critical if it becomes systemic in any segment.",
    whyItMatters: "Even small pockets of bad-fit customers can distort team focus and margin."
  },
  {
    name: "High-touch low-ACV account rate",
    category: "gross_margin_warning",
    formula:
      "Accounts below target ACV band with above-threshold onboarding or support effort divided by paying accounts.",
    eventDependencies: ["plan_changed", "support time logs", "onboarding time logs"],
    warningThreshold: "Warning when persistent in SMB cohorts.",
    whyItMatters: "This is one of the clearest signs of low-value customer trap risk."
  },
  {
    name: "Segment contribution comparison",
    category: "segment_profitability",
    formula:
      "Compare contribution margin, support load, onboarding burden, churn risk, and expansion rate across ICP segments.",
    eventDependencies: ["plan_changed", "support logs", "onboarding logs", "churn events", "contract coverage metrics"],
    warningThreshold: "Escalate when a segment consistently underperforms on both margin and retention.",
    whyItMatters: "Not every source or ICP deserves equal GTM effort."
  },
  {
    name: "Source quality comparison",
    category: "segment_profitability",
    formula:
      "Compare activation depth, paid conversion, contribution margin, and churn risk across acquisition sources.",
    eventDependencies: [
      "pricing_page_viewed",
      "trial_started",
      "checkout_completed",
      "plan_cancelled",
      "support logs"
    ],
    warningThreshold: "Cut channels that look busy but produce weak activation or poor margin.",
    whyItMatters: "CAC quality matters more than lead volume."
  },
  {
    name: "Healthy expansion candidate rate",
    category: "leading_indicator",
    formula:
      "Paying accounts with high workflow depth and contract-cap or coordination pressure divided by paying accounts.",
    eventDependencies: [
      "commercial_gate_shown",
      "upgrade_cta_clicked",
      "multi_recipient_reminder_attempted",
      "plan_changed"
    ],
    warningThreshold: "Warning if healthy accounts rarely create expansion pressure.",
    whyItMatters: "Strong unit economics come from expansion inside healthy accounts, not forced upsells."
  },
  {
    name: "Embedded workflow rate",
    category: "leading_indicator",
    formula:
      "Paying accounts with reviewed coverage, owner coverage, reminder continuity, and due-soon decision discipline divided by paying accounts.",
    eventDependencies: [
      "contract_review_completed",
      "first_owner_assigned",
      "reminder_created",
      "renewal_decision_recorded"
    ],
    warningThreshold: "Warning if this rate weakens in cohorts older than one month.",
    whyItMatters: "This is one of the best leading indicators of durable retention and healthy LTV."
  }
];

export const profitabilityDashboards: ProfitabilityDashboardSection[] = [
  {
    title: "Profitability command center",
    purpose: "Single view for contribution margin, payback risk, and gross-margin quality.",
    widgets: [
      "gross margin by segment",
      "negative-margin account rate",
      "support cost as percent of ACV",
      "CAC recovery by segment",
      "embedded workflow rate"
    ]
  },
  {
    title: "Support and onboarding burden",
    purpose: "Track whether services, onboarding, and support are helping or hurting economics.",
    widgets: [
      "support touches per active account",
      "time to support resolution for onboarding blockers",
      "onboarding hours per converted account",
      "messy-import burden rate",
      "high-touch low-ACV account rate"
    ]
  },
  {
    title: "AI and reminder cost quality",
    purpose: "Monitor variable cost drivers tied to extraction and notifications.",
    widgets: [
      "extraction cost per active tracked contract",
      "extraction cost per paying account",
      "notification cost per live obligation",
      "retry-driven notification cost rate"
    ]
  },
  {
    title: "Segment and source economics",
    purpose: "Compare ICPs and channels by activation depth, margin quality, and expansion behavior.",
    widgets: [
      "segment contribution comparison",
      "source quality comparison",
      "coverage expansion LTV proxy",
      "healthy expansion candidate rate"
    ]
  }
];

export const profitabilityDrilldowns: ProfitabilityDrilldown[] = [
  {
    name: "Segment drilldown",
    cuts: ["plan tier", "company size band", "contract volume band", "persona", "annual vs monthly"],
    whyItMatters: "Shows which ICPs are actually economically attractive."
  },
  {
    name: "Source drilldown",
    cuts: ["acquisition source", "campaign", "landing page", "demo-led vs self-serve"],
    whyItMatters: "Connects CAC to activation depth and downstream margin."
  },
  {
    name: "Workflow-depth drilldown",
    cuts: ["review coverage", "owner coverage", "reminder continuity", "decision discipline"],
    whyItMatters: "Separates accounts that merely signed up from accounts that are likely to retain and expand."
  },
  {
    name: "Reliability-cost drilldown",
    cuts: ["failed reminders", "retry burden", "extraction failures", "manual rescue volume"],
    whyItMatters: "Shows where reliability problems are becoming margin problems."
  }
];

export const profitabilitySegmentComparisons: SegmentComparison[] = [
  {
    segment: "Operational SMB",
    compareAgainst: "Tiny SMB",
    metrics: ["contribution margin per account", "support cost as percent of ACV", "coverage expansion LTV proxy"],
    decisionUse: "Proves why low-urgency tiny accounts should not get the same CS or GTM attention."
  },
  {
    segment: "Midsize Ops-Led",
    compareAgainst: "Operational SMB",
    metrics: ["CAC recovery by segment", "healthy expansion candidate rate", "gross margin by segment"],
    decisionUse: "Tests whether higher-ACV mid-market accounts deliver better business quality."
  },
  {
    segment: "Partner referral",
    compareAgainst: "Broad paid acquisition",
    metrics: ["activation-to-paid payback proxy", "source quality comparison", "negative-margin account rate"],
    decisionUse: "Helps cut channels that look scalable but create weak unit economics."
  }
];

export const profitabilityInstrumentationRequirements: InstrumentationRequirement[] = [
  {
    eventOrLog: "Support time log",
    requiredProperties: ["organization_id", "issue_type", "minutes_spent", "owner", "resolution_type"],
    whyItMatters: "Support cost cannot be modeled seriously without time allocation."
  },
  {
    eventOrLog: "Onboarding time log",
    requiredProperties: ["organization_id", "service_type", "minutes_spent", "paid_vs_included"],
    whyItMatters: "Onboarding burden is a major payback driver."
  },
  {
    eventOrLog: "Extraction usage log",
    requiredProperties: ["organization_id", "contract_id", "provider", "pages_or_tokens", "estimated_cost"],
    whyItMatters: "AI extraction cost needs per-account attribution."
  },
  {
    eventOrLog: "Notification cost log",
    requiredProperties: ["organization_id", "reminder_id", "channel", "attempt_count", "estimated_cost"],
    whyItMatters: "Reminder economics depend on both delivery volume and retry cost."
  },
  {
    eventOrLog: "Commercial milestone event",
    requiredProperties: ["organization_id", "plan_tier", "contract_count", "source", "trial_state"],
    whyItMatters: "Pricing, packaging, activation, and expansion need to be linked at the workspace level."
  },
  {
    eventOrLog: "Manual rescue log",
    requiredProperties: ["organization_id", "incident_type", "minutes_spent", "root_cause", "resolved"],
    whyItMatters: "Hidden ops work is a margin leak unless it is counted."
  }
];
