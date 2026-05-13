export type RetentionDefinition = {
  name: string;
  definition: string;
  whyItMatters: string;
};

export type RetentionMetricDefinition = {
  name: string;
  category:
    | "weekly"
    | "monthly"
    | "cohort"
    | "workflow"
    | "churn_risk"
    | "intervention";
  formula: string;
  goodLooksLike: string;
  badLooksLike: string;
  reviewCadence: "weekly" | "monthly";
  whyItMatters: string;
};

export type CohortDashboardSection = {
  title: string;
  purpose: string;
  views: string[];
};

export type ChurnRiskRule = {
  signal: string;
  weight: number;
  trigger: string;
  intervention: string;
};

export const retentionDefinitions: RetentionDefinition[] = [
  {
    name: "Retained account",
    definition:
      "A retained account is a paying workspace that continues to expand or maintain trusted contract coverage and returns within the weekly renewal workflow to review obligations, owners, reminders, or decisions.",
    whyItMatters:
      "This product is sticky only when the workflow is operationally embedded, not when contracts are merely stored."
  },
  {
    name: "Active account",
    definition:
      "An active account is a workspace with at least one meaningful workflow action in the review window: reviewed contract, owner assignment, reminder activity, decision activity, or dashboard revisit tied to live obligations.",
    whyItMatters:
      "Login activity alone is too weak; the account must touch the renewal workflow."
  },
  {
    name: "Healthy usage",
    definition:
      "Healthy usage means reviewed contracts are rising or stable, owner coverage is high, reminders and decisions are active, and live obligations are visible in the dashboard.",
    whyItMatters:
      "Healthy usage predicts renewals, expansion, and lower churn risk."
  }
];

export const retentionCohortDesign = [
  "Cohort by signup month to measure onboarding-to-retention quality.",
  "Cohort by activation month to separate acquisition from product adoption quality.",
  "Cohort by plan tier to see Starter vs Growth retention behavior.",
  "Cohort by acquisition source to expose weak channels.",
  "Cohort by contract-volume band to validate the value metric.",
  "Cohort by workflow-depth segment: shallow, developing, embedded."
];

export const leadingChurnIndicators = [
  "No contract reviewed after upload",
  "Owner coverage drops or stays low",
  "No live obligations surfaced in recent periods",
  "Decision coverage on due-soon contracts stalls",
  "Contract coverage expansion stops at a tiny footprint",
  "Billing portal opened by a shallow account",
  "Review backlog aging increases"
];

export const laggingChurnIndicators = [
  "Plan downgrade",
  "Cancellation request or cancel-at-period-end",
  "Sustained inactivity across a full monthly cycle",
  "Sharp drop in reviewed contract coverage",
  "Loss of reminder usage after prior adoption"
];

export const retentionPredictiveBehaviors = {
  predictsRetention: [
    "Reviewed contracts keep rising",
    "Owner assignment coverage stays high",
    "Due-soon contracts get decisions",
    "Reminder workflows are actively maintained",
    "Contract coverage expands over time",
    "Leadership reporting and digest usage becomes recurring"
  ],
  predictsChurn: [
    "Uploads accumulate but reviews do not",
    "Owners remain missing",
    "No reminder workflow is created",
    "No decisions are logged on due-soon contracts",
    "Coverage stays stuck at a pilot footprint",
    "Accounts only return when something breaks"
  ]
};

export const workflowRetentionMetrics: RetentionMetricDefinition[] = [
  {
    name: "Due-soon decision coverage",
    category: "workflow",
    formula:
      "Contracts with renewal decisions recorded inside the due-soon window divided by all due-soon contracts.",
    goodLooksLike: "Most due-soon contracts have explicit decisions.",
    badLooksLike: "Due-soon contracts rely on reminders without decision follow-through.",
    reviewCadence: "weekly",
    whyItMatters: "Decision discipline is a strong signal of true operational embedding."
  },
  {
    name: "Reminder workflow continuity",
    category: "workflow",
    formula:
      "Active workspaces with at least one reminder sent or maintained in the review window divided by active workspaces with live obligations.",
    goodLooksLike: "Reminder usage stays stable where obligations exist.",
    badLooksLike: "Obligations exist but reminder usage fades.",
    reviewCadence: "weekly",
    whyItMatters: "The product becomes sticky when reminders remain part of the workflow."
  },
  {
    name: "Owner-gap rate",
    category: "workflow",
    formula: "Active tracked contracts without assigned owners divided by all active tracked contracts.",
    goodLooksLike: "Owner gaps shrink after onboarding and stay low.",
    badLooksLike: "Owner gaps stay persistent or worsen.",
    reviewCadence: "weekly",
    whyItMatters: "Owner gaps are one of the clearest predictors of churn."
  },
  {
    name: "Workflow revisit rate",
    category: "workflow",
    formula:
      "Active workspaces returning to due-soon, needs-review, or decision views in the last 7 days divided by all active workspaces.",
    goodLooksLike: "Teams revisit workflow views consistently every week.",
    badLooksLike: "The dashboard becomes a one-time setup surface.",
    reviewCadence: "weekly",
    whyItMatters: "Habit is visible through recurring workflow-view usage."
  }
];

export const weeklyRetentionMetrics: RetentionMetricDefinition[] = [
  {
    name: "Weekly active workflow accounts",
    category: "weekly",
    formula:
      "Paying workspaces with at least one meaningful workflow action in the last 7 days divided by all paying workspaces.",
    goodLooksLike: "A large majority of retained accounts remain workflow-active each week.",
    badLooksLike: "Accounts log in but do not touch the workflow or go inactive altogether.",
    reviewCadence: "weekly",
    whyItMatters: "Best short-cycle read on whether the product is part of real operations."
  },
  {
    name: "Reviewed contract coverage trend",
    category: "weekly",
    formula: "Current reviewed contract coverage compared with prior 4-week average.",
    goodLooksLike: "Coverage stays high or improves.",
    badLooksLike: "Coverage declines or stalls after onboarding.",
    reviewCadence: "weekly",
    whyItMatters: "Falling trust depth is an early churn warning."
  },
  {
    name: "Owner coverage trend",
    category: "weekly",
    formula: "Current owner assignment coverage compared with prior 4-week average.",
    goodLooksLike: "Ownership remains high and stable.",
    badLooksLike: "Owner gaps widen over time.",
    reviewCadence: "weekly",
    whyItMatters: "Ownership erosion predicts churn and support burden."
  },
  {
    name: "Live obligations surfaced rate",
    category: "weekly",
    formula:
      "Active workspaces with at least one visible upcoming renewal or notice obligation divided by all active workspaces.",
    goodLooksLike: "The dashboard stays populated with actionable work.",
    badLooksLike: "Accounts become silent because coverage and trust are weak.",
    reviewCadence: "weekly",
    whyItMatters: "No visible obligations often means no recurring habit."
  }
];

export const monthlyRetentionMetrics: RetentionMetricDefinition[] = [
  {
    name: "Logo retention",
    category: "monthly",
    formula: "Paying accounts retained at month end divided by paying accounts at month start.",
    goodLooksLike: "Retention stays stable or improves in healthy segments.",
    badLooksLike: "Retention falls in one plan, source, or cohort without intervention.",
    reviewCadence: "monthly",
    whyItMatters: "Core lagging retention indicator."
  },
  {
    name: "Gross revenue retention",
    category: "monthly",
    formula: "Starting MRR minus churned and contracted MRR divided by starting MRR.",
    goodLooksLike: "Revenue stays durable even before expansion is counted.",
    badLooksLike: "Churn or downgrades eat too much recurring revenue.",
    reviewCadence: "monthly",
    whyItMatters: "Best retention metric from a business-quality standpoint."
  },
  {
    name: "Contract coverage expansion rate",
    category: "monthly",
    formula: "Net increase in active tracked contracts per retained workspace over the month.",
    goodLooksLike: "Retained accounts centralize more of their portfolio over time.",
    badLooksLike: "Accounts stay stuck at a tiny pilot scope.",
    reviewCadence: "monthly",
    whyItMatters: "Expansion of coverage is one of the best predictors of long-term stickiness."
  },
  {
    name: "Decision hygiene rate",
    category: "monthly",
    formula:
      "Contracts entering due windows with decisions recorded within SLA divided by all contracts entering due windows.",
    goodLooksLike: "The workflow closes the loop consistently each month.",
    badLooksLike: "Decision debt grows and teams drift back to spreadsheets.",
    reviewCadence: "monthly",
    whyItMatters: "Decision hygiene is where the product proves ongoing operational value."
  }
];

export const churnRiskScoringRules: ChurnRiskRule[] = [
  {
    signal: "No reviewed contracts in recent window",
    weight: 25,
    trigger: "No contract_review_completed in the last 14 days for a previously active account.",
    intervention: "Trigger review-queue cleanup outreach and in-app prompt."
  },
  {
    signal: "Low owner coverage",
    weight: 20,
    trigger: "Owner coverage below 60% for active tracked contracts.",
    intervention: "Trigger owner-assignment save play and admin outreach."
  },
  {
    signal: "No live obligations surfaced",
    weight: 15,
    trigger: "No visible due-soon renewals or notices in the recent review window.",
    intervention: "Check data completeness and contract coverage expansion."
  },
  {
    signal: "Decision gap on due-soon contracts",
    weight: 20,
    trigger: "Due-soon decision coverage below target threshold.",
    intervention: "Trigger decision-hygiene reminder and CS review."
  },
  {
    signal: "Contract coverage stagnation",
    weight: 10,
    trigger: "No meaningful active tracked contract growth over two monthly cycles.",
    intervention: "Prompt portfolio expansion or import help."
  },
  {
    signal: "Billing portal opened by shallow account",
    weight: 10,
    trigger: "billing_portal_opened plus weak activation/retention profile.",
    intervention: "Immediate save play with value recap and workflow gap remediation."
  }
];

export const interventionTriggers = [
  "At-risk score crosses threshold 50+",
  "Owner coverage drops below 60%",
  "Decision coverage for due-soon contracts drops below 50%",
  "No meaningful workflow action for 14 days in an active paid account",
  "Billing portal opened by an account with shallow workflow depth",
  "Import-heavy account fails to review or assign owners after migration"
];

export const cohortDashboards: CohortDashboardSection[] = [
  {
    title: "Signup cohorts",
    purpose: "Measure whether new customers become retained workflow users after acquisition.",
    views: [
      "Week 1 activation by signup cohort",
      "Month 1 retention by signup cohort",
      "reviewed contract coverage by signup cohort",
      "owner coverage by signup cohort"
    ]
  },
  {
    title: "Activation cohorts",
    purpose: "Measure retention quality after first real value, independent of acquisition noise.",
    views: [
      "Month 1 workflow retention by activation cohort",
      "contract coverage expansion by activation cohort",
      "decision hygiene by activation cohort"
    ]
  },
  {
    title: "Plan and segment cohorts",
    purpose: "See how retention changes by plan tier, contract volume, and acquisition source.",
    views: [
      "logo retention by plan",
      "gross revenue retention by plan",
      "retention by contract-volume band",
      "retention by acquisition source"
    ]
  }
];

export const antiChurnReportingViews = [
  "Accounts at risk this week",
  "Accounts with widening owner gaps",
  "Accounts with due-soon contracts but missing decisions",
  "Accounts with stalled contract coverage expansion",
  "Accounts opening billing portal with weak workflow depth",
  "Accounts needing import/review rescue after migration"
];
