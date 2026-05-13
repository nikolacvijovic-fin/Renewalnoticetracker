export type MetricFormulaDefinition = {
  name:
    | "north_star"
    | "activation"
    | "wao_mao"
    | "reviewed_contract_rate"
    | "owner_assignment_rate"
    | "reminder_coverage_rate"
    | "first_value_completion_rate"
    | "first_paid_value_completion_rate"
    | "upgrade_conversion_rate"
    | "paid_activation_rate"
    | "gross_retention"
    | "net_retention"
    | "churn_rate"
    | "expansion_rate"
    | "reminder_send_success_rate"
    | "extraction_failure_rate"
    | "review_completion_rate"
    | "unhealthy_account_rate"
    | "support_burden_per_account"
    | "margin_risk_rate";
  label: string;
  formula: string;
  plainEnglishMeaning: string;
  dataDependencies: string[];
  commonMistakesInInterpretation: string[];
  goodVsBad: {
    good: string;
    bad: string;
  };
};

export const metricFormulaDefinitions: MetricFormulaDefinition[] = [
  {
    name: "north_star",
    label: "North star",
    formula:
      "Count of active tracked contracts in paying workspaces where review is completed, an owner is assigned, and at least one live renewal or notice obligation is surfaced during the measurement window.",
    plainEnglishMeaning:
      "How much real renewal risk the product is actively controlling in paying accounts.",
    dataDependencies: [
      "organization plan state",
      "contract status",
      "contract_review_completed",
      "contract_owner_assigned",
      "live obligation or due-soon state"
    ],
    commonMistakesInInterpretation: [
      "Counting all stored contracts instead of trusted active tracked contracts.",
      "Ignoring whether the workspace is paying.",
      "Treating uploaded but unreviewed contracts as value created."
    ],
    goodVsBad: {
      good: "Rises through both new paying accounts and deeper portfolio coverage inside retained accounts.",
      bad: "Flat while top-line signups or stored contracts grow."
    }
  },
  {
    name: "activation",
    label: "Activation",
    formula:
      "Activated new workspaces divided by total new workspaces in cohort, where activation means at least one contract uploaded or created, reviewed, assigned to an owner, and tied to a live reminder-backed obligation within the activation window.",
    plainEnglishMeaning:
      "The share of new workspaces that reach real operational value instead of just trying the product.",
    dataDependencies: [
      "auth_signup_completed or workspace_created",
      "contract_upload_completed or manual_contract_created or import_completed",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "live obligation surfaced"
    ],
    commonMistakesInInterpretation: [
      "Calling upload alone activation.",
      "Using login activity as activation.",
      "Ignoring a fixed activation window by cohort."
    ],
    goodVsBad: {
      good: "A clear majority of qualified workspaces activate quickly.",
      bad: "Most workspaces upload contracts but never trust or operationalize them."
    }
  },
  {
    name: "wao_mao",
    label: "WAO / MAO",
    formula:
      "Weekly active organizations or monthly active organizations equals organizations with at least one meaningful workflow action in the last 7 or 30 days: contract reviewed, owner assigned, reminder created or maintained, renewal decision recorded, or due-soon workflow view revisited.",
    plainEnglishMeaning:
      "How many organizations are truly using the renewal workflow on a weekly or monthly basis.",
    dataDependencies: [
      "organization_id",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "renewal_decision_recorded",
      "workflow_viewed"
    ],
    commonMistakesInInterpretation: [
      "Using logins instead of workflow actions.",
      "Counting passive dashboard loads with no action.",
      "Comparing WAO or MAO across cohorts without segmenting by paying vs non-paying."
    ],
    goodVsBad: {
      good: "Strong weekly recurrence in paying and retained workspaces with live obligations.",
      bad: "Monthly activity exists but weekly workflow use is weak, suggesting shallow embedding."
    }
  },
  {
    name: "reviewed_contract_rate",
    label: "Reviewed-contract rate",
    formula: "Reviewed active tracked contracts divided by total active tracked contracts.",
    plainEnglishMeaning: "How much of the tracked contract portfolio is trusted enough to run workflow on.",
    dataDependencies: ["contract state", "review status", "active tracked contract definition"],
    commonMistakesInInterpretation: [
      "Using all contracts instead of active tracked contracts.",
      "Ignoring imported contracts that still need review.",
      "Treating partial review or low-confidence extraction as equivalent to completed review."
    ],
    goodVsBad: {
      good: "High and stable in retained accounts, improving in new cohorts.",
      bad: "Large review backlog or declining trusted coverage over time."
    }
  },
  {
    name: "owner_assignment_rate",
    label: "Owner-assignment rate",
    formula: "Active tracked contracts with an assigned owner divided by total active tracked contracts.",
    plainEnglishMeaning: "How much of the portfolio has accountability instead of orphaned obligations.",
    dataDependencies: ["contract_owner_assigned", "contract owner state", "active tracked contract definition"],
    commonMistakesInInterpretation: [
      "Counting archived or inactive contracts in denominator.",
      "Counting placeholder owners as valid ownership.",
      "Ignoring ownership quality by department or recency."
    ],
    goodVsBad: {
      good: "Most tracked contracts have a clear current owner.",
      bad: "Owner gaps stay wide after onboarding or widen later."
    }
  },
  {
    name: "reminder_coverage_rate",
    label: "Reminder-coverage rate",
    formula:
      "Active tracked contracts with live obligations that have at least one active reminder or reminder rule divided by total active tracked contracts with live obligations.",
    plainEnglishMeaning: "How much of the real renewal workload is protected by reminders.",
    dataDependencies: ["live obligation state", "reminder_created", "reminder status", "reminder rule status"],
    commonMistakesInInterpretation: [
      "Using all contracts instead of contracts with live obligations.",
      "Counting disabled or expired reminders as coverage.",
      "Ignoring whether reminder schedules are actually current."
    ],
    goodVsBad: {
      good: "Most active obligations have current reminder coverage.",
      bad: "Visible obligations exist but reminder setup is missing or stale."
    }
  },
  {
    name: "first_value_completion_rate",
    label: "First-value completion rate",
    formula:
      "New workspaces reaching first value divided by total new workspaces, where first value means one contract reviewed, one owner assigned, and one live obligation visible.",
    plainEnglishMeaning: "The share of new workspaces that see the product working once in a credible way.",
    dataDependencies: [
      "workspace_created",
      "contract_review_completed",
      "contract_owner_assigned",
      "live obligation surfaced"
    ],
    commonMistakesInInterpretation: [
      "Requiring paid conversion inside the first-value definition.",
      "Calling upload or import alone first value.",
      "Ignoring a reasonable time window."
    ],
    goodVsBad: {
      good: "Most qualified new workspaces reach one trusted visible obligation quickly.",
      bad: "The first visible value moment rarely arrives before drop-off."
    }
  },
  {
    name: "first_paid_value_completion_rate",
    label: "First-paid-value completion rate",
    formula:
      "Eligible workspaces reaching first paid value divided by eligible workspaces, where first paid value means the account both proves the core workflow and hits a natural monetization threshold such as contract-cap pressure, multi-recipient coordination need, or expanded team workflow usage.",
    plainEnglishMeaning:
      "The share of accounts that reach the point where paying more is clearly justified by actual workflow depth.",
    dataDependencies: [
      "first-value milestone",
      "commercial_gate_shown",
      "multi_recipient_reminder_attempted",
      "current_contract_count",
      "upgrade prompt context"
    ],
    commonMistakesInInterpretation: [
      "Confusing first paid value with checkout completion.",
      "Using arbitrary time-based prompts instead of natural workflow pressure.",
      "Counting weak accounts that have not yet proven the core workflow."
    ],
    goodVsBad: {
      good: "Healthy accounts naturally encounter paid thresholds after proving value.",
      bad: "Upgrade asks come before value is clear or after accounts already stalled."
    }
  },
  {
    name: "upgrade_conversion_rate",
    label: "Upgrade conversion rate",
    formula:
      "Organizations that move to a higher paid plan within the attribution window after an upgrade prompt, gate click, or qualifying feature pressure event divided by organizations exposed to that upgrade context.",
    plainEnglishMeaning: "How often upgrade pressure turns into real plan expansion.",
    dataDependencies: [
      "upgrade_prompt_viewed",
      "upgrade_prompt_clicked",
      "commercial_gate_shown",
      "commercial_gate_clicked",
      "plan_changed"
    ],
    commonMistakesInInterpretation: [
      "Using raw plan upgrades without attribution to a context.",
      "Blending cross-sell, expansion, and initial purchase into one number.",
      "Ignoring denominator quality by feature or segment."
    ],
    goodVsBad: {
      good: "High-intent contexts like contract-cap pressure or multi-recipient need convert meaningfully.",
      bad: "Gates get seen often but rarely lead to upgrades."
    }
  },
  {
    name: "paid_activation_rate",
    label: "Paid activation rate",
    formula:
      "Newly paying organizations that reach the activation definition within the paid activation window divided by newly paying organizations.",
    plainEnglishMeaning:
      "The share of customers who become operationally healthy after they start paying, not just before.",
    dataDependencies: [
      "checkout_completed",
      "plan_changed",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "live obligation surfaced"
    ],
    commonMistakesInInterpretation: [
      "Using pre-payment activation only.",
      "Not separating self-serve from sales-assisted accounts.",
      "Ignoring timing after checkout."
    ],
    goodVsBad: {
      good: "Most new paying accounts become workflow-active quickly after purchase.",
      bad: "Accounts pay but still fail to embed the workflow."
    }
  },
  {
    name: "gross_retention",
    label: "Gross retention",
    formula:
      "(Starting-period MRR minus churned MRR minus contraction MRR) divided by starting-period MRR, excluding expansion MRR.",
    plainEnglishMeaning: "How much recurring revenue stays without giving credit for upsell.",
    dataDependencies: ["opening MRR", "plan_cancelled", "plan_changed", "MRR attribution by account"],
    commonMistakesInInterpretation: [
      "Including expansion and calling it gross retention.",
      "Using logo retention instead of revenue retention.",
      "Not segmenting by cohort or plan."
    ],
    goodVsBad: {
      good: "Stable and high in core segments, especially Growth and above.",
      bad: "Revenue leaks through churn and downgrades even before expansion is considered."
    }
  },
  {
    name: "net_retention",
    label: "Net retention",
    formula:
      "(Starting-period MRR minus churned MRR minus contraction MRR plus expansion MRR) divided by starting-period MRR.",
    plainEnglishMeaning: "How much revenue stays and grows inside the existing base.",
    dataDependencies: ["opening MRR", "plan_changed", "plan_cancelled", "expansion MRR attribution"],
    commonMistakesInInterpretation: [
      "Using net retention to hide bad churn in some segments.",
      "Ignoring whether expansion comes from healthy accounts or rescue pricing.",
      "Comparing early immature cohorts to mature cohorts without context."
    ],
    goodVsBad: {
      good: "Healthy existing accounts expand enough to offset normal churn and downgrades.",
      bad: "NRR weakens because workflow depth and natural expansion pressure are low."
    }
  },
  {
    name: "churn_rate",
    label: "Churn rate",
    formula: "Cancelled paying organizations in period divided by paying organizations at start of period.",
    plainEnglishMeaning: "The share of paying customers that fully leave in a given period.",
    dataDependencies: ["plan_cancelled", "subscription status", "opening paid organization count"],
    commonMistakesInInterpretation: [
      "Mixing downgrades and full churn without separation.",
      "Looking only at logos and not revenue churn.",
      "Ignoring voluntary vs involuntary churn causes."
    ],
    goodVsBad: {
      good: "Low and stable inside the target ICP with healthy workflow depth.",
      bad: "Rising especially among weakly activated or support-heavy cohorts."
    }
  },
  {
    name: "expansion_rate",
    label: "Expansion rate",
    formula:
      "Organizations increasing plan value, contract band, or add-on revenue in period divided by starting paid organizations, or expansion MRR divided by opening MRR when measured in revenue terms.",
    plainEnglishMeaning: "How often and how much existing customers grow their commercial footprint.",
    dataDependencies: ["plan_changed", "add-on purchase logs", "opening paid organization count", "opening MRR"],
    commonMistakesInInterpretation: [
      "Using only logo-level upgrades instead of revenue impact.",
      "Counting expansions from unhealthy accounts as a durable win.",
      "Ignoring expansion source such as capacity pressure vs rescue sales."
    ],
    goodVsBad: {
      good: "Healthy accounts expand through coverage, coordination, and reporting depth.",
      bad: "Expansion is rare even when workflow depth is strong."
    }
  },
  {
    name: "reminder_send_success_rate",
    label: "Reminder send success rate",
    formula: "Successful reminder deliveries divided by total reminder delivery attempts in the period.",
    plainEnglishMeaning: "How reliably the core reminder promise is being fulfilled.",
    dataDependencies: ["reminder_sent", "reminder_failed", "notification_logs"],
    commonMistakesInInterpretation: [
      "Looking at send volume instead of send reliability.",
      "Ignoring duplicate sends or delayed sends.",
      "Not segmenting by channel or account impact."
    ],
    goodVsBad: {
      good: "Very high and stable, with duplicate and lag issues near zero.",
      bad: "Failures, retries, or duplicates become visible to customers."
    }
  },
  {
    name: "extraction_failure_rate",
    label: "Extraction failure rate",
    formula: "Contracts with extraction_failed divided by total extraction attempts in the period.",
    plainEnglishMeaning: "How often intake fails before a contract can even be reviewed.",
    dataDependencies: ["extraction_completed", "extraction_failed", "upload/import extraction attempts"],
    commonMistakesInInterpretation: [
      "Ignoring low-confidence extractions that still burden review.",
      "Combining hard failures and partial low-quality outcomes without segmentation.",
      "Not segmenting by document type or source."
    ],
    goodVsBad: {
      good: "Bounded and concentrated in known edge cases.",
      bad: "Common document types fail or generate repeated support loops."
    }
  },
  {
    name: "review_completion_rate",
    label: "Review completion rate",
    formula:
      "Contracts needing human review that are reviewed within the target SLA divided by total contracts needing review in the same window.",
    plainEnglishMeaning: "How much uncertain extracted data gets turned into trusted data on time.",
    dataDependencies: ["needs_review state", "contract_review_completed", "review SLA window"],
    commonMistakesInInterpretation: [
      "Using all reviewed contracts instead of only review-required contracts.",
      "Ignoring timeliness and just counting eventual review.",
      "Masking backlog growth by including old completed reviews."
    ],
    goodVsBad: {
      good: "Backlog stays controlled and trust is built quickly.",
      bad: "Review backlog ages and blocks activation or ongoing workflow trust."
    }
  },
  {
    name: "unhealthy_account_rate",
    label: "Unhealthy-account rate",
    formula:
      "Organizations with account health score below unhealthy threshold divided by total paying organizations, where unhealthy means failed activation, weak workflow depth, reliability pain, or stagnant coverage.",
    plainEnglishMeaning: "How much of the paying base is currently at material churn or margin risk.",
    dataDependencies: [
      "account health score model",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_created",
      "renewal_decision_recorded",
      "reliability incident data"
    ],
    commonMistakesInInterpretation: [
      "Treating every low-activity account as unhealthy even if it has no live obligations.",
      "Using generic logins instead of workflow-based health.",
      "Not separating onboarding-stage accounts from mature at-risk accounts."
    ],
    goodVsBad: {
      good: "A small minority of paying accounts are unhealthy and the rate is falling.",
      bad: "A meaningful portion of the base sits in watchlist or at-risk bands."
    }
  },
  {
    name: "support_burden_per_account",
    label: "Support burden per account",
    formula:
      "Total support minutes or hours spent in period divided by active paying organizations in the same period.",
    plainEnglishMeaning: "How much human support time each paying account consumes on average.",
    dataDependencies: ["support time logs", "issue tags", "active paying organization count"],
    commonMistakesInInterpretation: [
      "Counting tickets instead of time.",
      "Mixing paid onboarding/services and reactive support with no separation.",
      "Using averages without segment-level comparison."
    ],
    goodVsBad: {
      good: "Stable or falling as onboarding, docs, and product quality improve.",
      bad: "Rising in low-ACV or bad-fit segments and quietly eroding margin."
    }
  },
  {
    name: "margin_risk_rate",
    label: "Margin-risk rate",
    formula:
      "Paying organizations with either negative contribution margin, support cost above threshold, onboarding burden above threshold, or repeated reliability rescue load divided by total paying organizations.",
    plainEnglishMeaning: "The share of the customer base that is likely hurting gross margin right now.",
    dataDependencies: [
      "account revenue",
      "support time logs",
      "onboarding time logs",
      "extraction cost allocation",
      "notification cost allocation",
      "manual rescue logs"
    ],
    commonMistakesInInterpretation: [
      "Looking only at revenue and ignoring direct cost allocation.",
      "Not separating temporary onboarding burden from persistent bad economics.",
      "Failing to segment by ICP or source."
    ],
    goodVsBad: {
      good: "Only a small edge-case slice of accounts is margin-risky, and they are managed intentionally.",
      bad: "Margin-risk accounts are common in a core segment or acquisition channel."
    }
  }
];
