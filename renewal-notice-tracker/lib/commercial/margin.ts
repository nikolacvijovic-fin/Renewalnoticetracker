export type CostRisk = {
  area:
    | "onboarding_cost"
    | "support_cost"
    | "ai_extraction_cost"
    | "notification_cost"
    | "storage_cost"
    | "cron_ops_cost"
    | "admin_debug_complexity"
    | "custom_work_risk"
    | "low_value_customer_risk"
    | "feature_support_mismatch";
  label: string;
  threat: string;
  whyItHurts: string;
};

export const marginAnalysis = {
  biggestCostLeaks: [
    "Free or underpriced extraction-heavy usage",
    "Spreadsheet cleanup and onboarding work treated as support instead of paid packages",
    "Small accounts consuming disproportionate support time",
    "Pseudo-enterprise workflow requests increasing implementation and maintenance cost"
  ],
  biggestSupportBurdenRisks: [
    "Messy imports with bad source data",
    "Users who never complete review and owner setup",
    "Billing and plan confusion from accounts with low buying intent",
    "Customers asking for CLM-like workflow behavior"
  ],
  automateFirst: [
    "Import validation and preflight checks",
    "Onboarding checklist and contextual guidance",
    "Low-confidence extraction triage",
    "Common support diagnostics for reminders, billing, and imports"
  ],
  acceptableManualEarly: [
    "Paid onboarding for qualified accounts",
    "Paid spreadsheet cleanup and import mapping",
    "Renewal workflow configuration for Growth accounts",
    "Quarterly review sessions for high-value customers"
  ],
  dangerousManualLater: [
    "Unscoped import cleanup as free support",
    "Custom report-building for individual customers",
    "Repeated admin training without standardized materials",
    "Hand-built workflow logic for one-off enterprise demands"
  ],
  marginDestructiveCustomers: [
    "Tiny accounts with weak urgency and lots of hand-holding",
    "Large buyers who actually want CLM",
    "Messy-data customers who refuse paid migration help",
    "Accounts with high support demands and low contract volume"
  ],
  productChangesImproveMargin: [
    "Stronger self-serve onboarding and checklist guidance",
    "Import preflight checks and error handling before long support loops start",
    "Clearer commercial gates around contract volume and workflow depth",
    "Better health scoring to catch non-adopting accounts early"
  ],
  processChangesImproveMargin: [
    "Require scoped paid services for messy imports and workflow design",
    "Disqualify low-fit accounts earlier in sales",
    "Track support and onboarding effort per account",
    "Use standard playbooks for onboarding, rescue, and reporting"
  ],
  cutToProtectMargin: [
    "Custom CLM-like workflowing",
    "Bespoke reporting projects",
    "Open-ended spreadsheet remediation",
    "Feature work that adds support burden without monetization or retention upside"
  ]
};

export const costStructureRisks: CostRisk[] = [
  {
    area: "onboarding_cost",
    label: "Onboarding cost",
    threat: "Accounts that need repeated setup help can consume more labor than their ACV supports.",
    whyItHurts: "Low-ACV accounts become unprofitable fast if onboarding is not scoped and standardized."
  },
  {
    area: "support_cost",
    label: "Support cost",
    threat: "Support load spikes when users import messy data, misunderstand workflow setup, or never complete review.",
    whyItHurts: "Support-driven labor quietly erodes gross margin even when topline revenue looks healthy."
  },
  {
    area: "ai_extraction_cost",
    label: "AI extraction cost",
    threat: "Heavy extraction usage by free, trial, or low-paying accounts can outpace revenue.",
    whyItHurts: "Extraction is one of the clearest variable cost drivers in the product."
  },
  {
    area: "notification_cost",
    label: "Notification cost",
    threat: "Large reminder volume, retries, and multi-channel delivery create quiet usage cost.",
    whyItHurts: "Notification cost is manageable at first but can compound with scale and failure loops."
  },
  {
    area: "storage_cost",
    label: "Storage cost",
    threat: "Unlimited file retention and historical uploads can add low-visibility infrastructure cost.",
    whyItHurts: "Storage is not the biggest cost, but it grows with weak lifecycle discipline."
  },
  {
    area: "cron_ops_cost",
    label: "Cron and ops cost",
    threat: "Reminder processing, retries, digests, and job monitoring add operational complexity.",
    whyItHurts: "Ops cost rises when failures are not visible or recoverable through tooling."
  },
  {
    area: "admin_debug_complexity",
    label: "Admin/debug complexity cost",
    threat: "The more internal rescue paths and exception flows the team needs, the more expensive support becomes.",
    whyItHurts: "Complex ops tooling is often a symptom of product or onboarding gaps."
  },
  {
    area: "custom_work_risk",
    label: "Custom-work risk",
    threat: "Service requests can drift into consulting, custom process design, or pseudo-CLM work.",
    whyItHurts: "That turns a software business into low-margin services."
  },
  {
    area: "low_value_customer_risk",
    label: "Low-value customer risk",
    threat: "Some accounts are too small or too disorganized to ever justify the effort they consume.",
    whyItHurts: "Bad-fit customers eat support, slow product focus, and still churn."
  },
  {
    area: "feature_support_mismatch",
    label: "Feature-support mismatch risk",
    threat: "Features that look attractive but require lots of explanation or exception handling can be margin-negative.",
    whyItHurts: "Every feature should justify itself through revenue, retention, or lower support cost."
  }
];
