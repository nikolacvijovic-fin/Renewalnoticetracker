export type MetricGroup = {
  title: string;
  northStar?: string;
  activation?: string;
  metrics: string[];
};

export type AnalyticsEventDefinition = {
  eventName: string;
  triggerCondition: string;
  importantProperties: string[];
  whyItMatters: string;
};

export type DashboardDefinition = {
  audience: "founder" | "product" | "growth" | "finance" | "customer_success" | "support_operations";
  title: string;
  focus: string;
  widgets: string[];
};

export const profitabilityMetrics: MetricGroup[] = [
  {
    title: "Core metrics",
    northStar:
      "Active tracked contracts with reviewed dates and assigned owners in paying workspaces",
    activation:
      "Workspaces that reach one reviewed contract, one owner assigned, and one live obligation surfaced",
    metrics: []
  },
  {
    title: "Revenue metrics",
    metrics: ["MRR", "ARR", "ACV", "new MRR", "expansion MRR", "contraction MRR", "net revenue retention"]
  },
  {
    title: "Pricing metrics",
    metrics: [
      "plan mix",
      "annual mix",
      "price realization by plan",
      "tracked-contract band distribution",
      "upgrade rate after commercial gate exposure"
    ]
  },
  {
    title: "Conversion metrics",
    metrics: [
      "pricing page to signup rate",
      "trial-to-activation rate",
      "activation-to-paid rate",
      "checkout start to checkout complete rate",
      "conversion by acquisition source"
    ]
  },
  {
    title: "Retention metrics",
    metrics: [
      "logo retention",
      "gross revenue retention",
      "reviewed contract coverage",
      "owner assignment coverage",
      "workspaces with live obligations surfaced",
      "renewal decision coverage"
    ]
  },
  {
    title: "Expansion metrics",
    metrics: [
      "contract-band upgrades",
      "Starter to Growth conversion",
      "service package attach rate",
      "reporting package attach rate",
      "Portfolio qualification rate"
    ]
  },
  {
    title: "Support cost metrics",
    metrics: [
      "support hours per account",
      "support tickets per account",
      "import cleanup hours per account",
      "time-to-resolution for onboarding issues"
    ]
  },
  {
    title: "Margin metrics",
    metrics: [
      "gross margin by segment",
      "extraction cost per account",
      "notification cost per account",
      "onboarding cost per account",
      "support cost as percent of ACV"
    ]
  },
  {
    title: "Churn indicators",
    metrics: [
      "no upload after signup",
      "no review after upload",
      "no owner assignment",
      "no reminder created",
      "no renewal decision recorded",
      "stalled contract coverage expansion",
      "billing portal opens before cancellation"
    ]
  },
  {
    title: "Vanity metrics to ignore",
    metrics: [
      "raw signups without activation context",
      "page views without source quality",
      "total reminders sent",
      "total stored contracts across all plans",
      "viewer seat count"
    ]
  }
];

export const analyticsEventCatalog: AnalyticsEventDefinition[] = [
  {
    eventName: "pricing_page_viewed",
    triggerCondition: "The pricing page loads.",
    importantProperties: ["source", "campaign", "referrer", "persona_guess"],
    whyItMatters: "Shows top-of-funnel pricing intent and helps connect acquisition source to monetization quality."
  },
  {
    eventName: "upgrade_cta_clicked",
    triggerCondition: "A user clicks any upgrade CTA.",
    importantProperties: ["source", "cta_location", "current_plan", "target_plan", "feature_context"],
    whyItMatters: "Measures which prompts create real buying intent."
  },
  {
    eventName: "commercial_gate_shown",
    triggerCondition: "A pricing or feature denial notice is rendered to the user.",
    importantProperties: ["feature", "plan_tier", "location", "current_contract_count", "trial_state"],
    whyItMatters: "Helps assess whether gates are being encountered at the right workflow moments."
  },
  {
    eventName: "commercial_gate_clicked",
    triggerCondition: "A user clicks the CTA inside a commercial gate.",
    importantProperties: ["feature", "plan_tier", "cta_label", "location"],
    whyItMatters: "Measures whether a gate is commercially persuasive or just annoying."
  },
  {
    eventName: "checkout_started",
    triggerCondition: "A checkout session is created.",
    importantProperties: ["source", "provider", "target_plan", "billing_term"],
    whyItMatters: "Marks hard purchase intent and supports funnel analysis."
  },
  {
    eventName: "checkout_completed",
    triggerCondition: "Billing confirms a successful subscription purchase.",
    importantProperties: ["provider", "plan_tier", "billing_term", "source", "price_id"],
    whyItMatters: "The core paid conversion event for monetization analysis."
  },
  {
    eventName: "billing_portal_opened",
    triggerCondition: "A billing management session is started.",
    importantProperties: ["source", "provider", "plan_tier", "subscription_status"],
    whyItMatters: "Can signal churn risk, pricing confusion, or upgrade/downgrade intent."
  },
  {
    eventName: "plan_changed",
    triggerCondition: "The plan tier changes after checkout or billing webhook processing.",
    importantProperties: ["previous_plan", "new_plan", "billing_term", "provider"],
    whyItMatters: "Tracks expansions, downgrades, and pricing mix changes."
  },
  {
    eventName: "plan_cancelled",
    triggerCondition: "The subscription is cancelled or marked to cancel.",
    importantProperties: ["plan_tier", "provider", "tenure_days", "cancellation_reason"],
    whyItMatters: "Core churn event."
  },
  {
    eventName: "export_attempted",
    triggerCondition: "A CSV or XLSX export route is requested.",
    importantProperties: ["format", "plan_tier", "source"],
    whyItMatters: "Shows reporting intent and can reveal which accounts need paid reporting access."
  },
  {
    eventName: "export_denied",
    triggerCondition: "Export is blocked by a commercial rule.",
    importantProperties: ["format", "plan_tier", "reason", "source"],
    whyItMatters: "Measures export-gate pressure and upgrade opportunity."
  },
  {
    eventName: "manual_contract_creation_attempted",
    triggerCondition: "A manual contract creation flow is submitted.",
    importantProperties: ["plan_tier", "source", "current_contract_count"],
    whyItMatters: "Captures activation and usage depth around high-intent data entry."
  },
  {
    eventName: "manual_contract_creation_denied",
    triggerCondition: "Manual contract creation is blocked by plan rules.",
    importantProperties: ["plan_tier", "reason", "current_contract_count"],
    whyItMatters: "Measures pressure from a meaningful operational workflow."
  },
  {
    eventName: "multi_recipient_reminder_attempted",
    triggerCondition: "A reminder flow includes more than one recipient.",
    importantProperties: ["recipient_count", "plan_tier", "contract_id", "source"],
    whyItMatters: "Strong Growth intent signal."
  },
  {
    eventName: "multi_recipient_reminder_denied",
    triggerCondition: "A multi-recipient reminder request is blocked.",
    importantProperties: ["recipient_count", "plan_tier", "reason", "source"],
    whyItMatters: "Tracks the best collaboration-driven upgrade moment."
  },
  {
    eventName: "digest_attempted",
    triggerCondition: "A digest send is manually or automatically attempted.",
    importantProperties: ["plan_tier", "source", "recipient_count"],
    whyItMatters: "Shows retention-oriented reporting usage."
  },
  {
    eventName: "digest_denied",
    triggerCondition: "Digest usage is blocked by plan rules.",
    importantProperties: ["plan_tier", "reason", "source"],
    whyItMatters: "Measures paid reporting pressure."
  },
  {
    eventName: "first_contract_uploaded",
    triggerCondition: "The first contract upload completes for a workspace.",
    importantProperties: ["source", "days_since_trial_start", "plan_tier"],
    whyItMatters: "First major activation milestone."
  },
  {
    eventName: "first_contract_reviewed",
    triggerCondition: "The first contract review is completed for a workspace.",
    importantProperties: ["days_since_signup", "plan_tier", "contract_id"],
    whyItMatters: "Value becomes trustworthy here."
  },
  {
    eventName: "first_owner_assigned",
    triggerCondition: "The first contract owner is assigned in a workspace.",
    importantProperties: ["days_since_signup", "plan_tier", "department"],
    whyItMatters: "Accountability is a retention and conversion milestone."
  },
  {
    eventName: "first_reminder_created",
    triggerCondition: "The first reminder is created in a workspace.",
    importantProperties: ["source", "plan_tier", "reminder_type"],
    whyItMatters: "Signals that the workflow is becoming operational."
  },
  {
    eventName: "first_renewal_decision_recorded",
    triggerCondition: "The first renewal decision is saved in a workspace.",
    importantProperties: ["status", "plan_tier", "days_since_signup"],
    whyItMatters: "A deep retention and workflow maturity signal."
  },
  {
    eventName: "import_initiated",
    triggerCondition: "An import file is submitted and job creation starts.",
    importantProperties: ["file_name", "estimated_row_count", "plan_tier"],
    whyItMatters: "High-intent activation and services opportunity."
  },
  {
    eventName: "import_completed",
    triggerCondition: "An import job finishes successfully or with partial success.",
    importantProperties: ["row_count", "imported_count", "error_count", "plan_tier"],
    whyItMatters: "Measures migration success and portfolio expansion."
  },
  {
    eventName: "import_failed",
    triggerCondition: "An import job fails.",
    importantProperties: ["file_name", "row_count", "error_message", "plan_tier"],
    whyItMatters: "Highlights onboarding friction, services demand, and support burden."
  },
  {
    eventName: "inactivity_signal",
    triggerCondition: "A workspace crosses an inactivity threshold or misses a critical milestone.",
    importantProperties: ["signal_type", "days_inactive", "plan_tier", "last_meaningful_action"],
    whyItMatters: "Supports early churn intervention."
  }
];

export const dashboardDefinitions: DashboardDefinition[] = [
  {
    audience: "founder",
    title: "Founder dashboard",
    focus: "Company-level growth, payback, retention, and biggest profitability leaks.",
    widgets: ["MRR and ARR", "new vs expansion MRR", "trial-to-paid rate", "NRR", "gross margin alerts", "top churn indicators"]
  },
  {
    audience: "product",
    title: "Product dashboard",
    focus: "Activation, workflow completion, and which gates create or kill value.",
    widgets: ["first-value funnel", "commercial gate exposure", "feature denial rate", "reviewed contract coverage", "owner assignment coverage", "import success rate"]
  },
  {
    audience: "growth",
    title: "Growth dashboard",
    focus: "Pricing page, acquisition source quality, and paid conversion performance.",
    widgets: ["pricing page to signup", "signup to activation", "activation to checkout", "checkout completion", "conversion by source", "upgrade CTA performance"]
  },
  {
    audience: "finance",
    title: "Finance / unit economics dashboard",
    focus: "Segment economics, payback, margin, and pricing quality.",
    widgets: ["ACV by segment", "gross margin by segment", "support cost per account", "extraction cost per account", "payback by channel", "plan mix"]
  },
  {
    audience: "customer_success",
    title: "Customer success dashboard",
    focus: "Health scoring, churn risk, and expansion opportunities.",
    widgets: ["accounts at risk", "inactivity signals", "owner-gap accounts", "decision-gap accounts", "expansion-ready accounts", "service attach opportunities"]
  },
  {
    audience: "support_operations",
    title: "Support / operations dashboard",
    focus: "Operational drag, import failures, extraction issues, and reminder reliability.",
    widgets: ["import failures", "extraction failures", "reminder failure rate", "notification retries", "support tickets per account", "time-to-resolution"]
  }
];
