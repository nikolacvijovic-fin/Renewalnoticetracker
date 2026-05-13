export type AccountHealthScoreRule = {
  name: string;
  weight: number;
  signalType:
    | "activation"
    | "usage"
    | "workflow_completion"
    | "reliability_pain"
    | "commercial_opportunity";
  goodCondition: string;
  badCondition: string;
  whyItMatters: string;
};

export type CustomerSuccessIndicator = {
  name: string;
  category:
    | "activation_health"
    | "usage_health"
    | "workflow_completion"
    | "reliability_pain"
    | "commercial_opportunity";
  definition: string;
  healthyLooksLike: string;
  riskyLooksLike: string;
  reviewCadence: "weekly" | "monthly";
  whyItMatters: string;
};

export type CustomerSuccessDashboardSection = {
  title: string;
  purpose: string;
  widgets: string[];
};

export type InterventionPlaybook = {
  trigger: string;
  accountType: string;
  actionOwner: string;
  playbook: string[];
  successCondition: string;
};

export const accountHealthScoreOverview = {
  name: "Workflow-embedded account health score",
  definition:
    "A 0-100 account health score based on whether a workspace has activated the renewal workflow, maintained trusted contract coverage, kept owner and reminder discipline healthy, avoided reliability pain, and shown signals of expansion rather than drift.",
  scoringBands: [
    "80-100 healthy and embedded",
    "60-79 watchlist but recoverable",
    "40-59 at-risk and needs intervention",
    "Below 40 high churn risk or failed onboarding"
  ]
};

export const accountHealthScoreRules: AccountHealthScoreRule[] = [
  {
    name: "Reviewed contract activation",
    weight: 20,
    signalType: "activation",
    goodCondition: "At least one contract uploaded, extracted or created, and reviewed inside the onboarding window.",
    badCondition: "Contracts exist but none are reviewed, or the first review never happens.",
    whyItMatters: "The workflow is not real until the team trusts at least one contract."
  },
  {
    name: "Owner assignment coverage",
    weight: 15,
    signalType: "workflow_completion",
    goodCondition: "Most active tracked contracts have clear owners.",
    badCondition: "Owner gaps stay high after onboarding or widen over time.",
    whyItMatters: "Ownership is one of the strongest signals that the product is embedded in real operations."
  },
  {
    name: "Reminder workflow continuity",
    weight: 15,
    signalType: "usage",
    goodCondition: "Accounts with live obligations keep reminders active and maintained.",
    badCondition: "Live obligations exist but reminder usage is absent or decays.",
    whyItMatters: "A reminder tool that is not used repeatedly does not retain."
  },
  {
    name: "Due-soon decision discipline",
    weight: 15,
    signalType: "workflow_completion",
    goodCondition: "Due-soon contracts have renewal decisions recorded on time.",
    badCondition: "Due-soon contracts accumulate without explicit decisions.",
    whyItMatters: "Decision follow-through is the clearest proof that the workflow closes the loop."
  },
  {
    name: "Workflow revisit frequency",
    weight: 10,
    signalType: "usage",
    goodCondition: "Admins and operators revisit due-soon, needs-review, or decision views weekly.",
    badCondition: "The workspace is only touched during setup or when something fails.",
    whyItMatters: "Habit is visible through repeated operational revisits, not generic logins."
  },
  {
    name: "Reliability pain load",
    weight: 10,
    signalType: "reliability_pain",
    goodCondition: "Few failed reminders, low review backlog, and no recurring rescue events.",
    badCondition: "Reminder failures, extraction failures, or manual rescue actions recur.",
    whyItMatters: "Reliability pain erodes trust and increases churn risk even when usage is otherwise healthy."
  },
  {
    name: "Contract coverage expansion",
    weight: 10,
    signalType: "commercial_opportunity",
    goodCondition: "Trusted contract coverage grows after onboarding.",
    badCondition: "Coverage stays stuck at a pilot footprint.",
    whyItMatters: "Coverage growth predicts both retention and expansion potential."
  },
  {
    name: "Commercial depth signal",
    weight: 5,
    signalType: "commercial_opportunity",
    goodCondition: "The account hits natural coordination or capacity triggers such as multi-recipient needs or contract-cap pressure.",
    badCondition: "The account stays shallow and never reaches meaningful workflow depth.",
    whyItMatters: "The healthiest commercial accounts grow because the workflow becomes central."
  }
];

export const activationHealthIndicators: CustomerSuccessIndicator[] = [
  {
    name: "Time to first reviewed contract",
    category: "activation_health",
    definition: "Time from workspace creation or first upload to the first reviewed contract.",
    healthyLooksLike: "A reviewed contract appears quickly inside the first onboarding session or shortly after.",
    riskyLooksLike: "Uploads happen but review never completes.",
    reviewCadence: "weekly",
    whyItMatters: "Weak activation is the fastest path to early churn."
  },
  {
    name: "First owner assigned",
    category: "activation_health",
    definition: "Whether the workspace assigns at least one contract owner during onboarding.",
    healthyLooksLike: "The first reviewed contract gets a clear owner immediately.",
    riskyLooksLike: "The team uploads documents but avoids operational accountability setup.",
    reviewCadence: "weekly",
    whyItMatters: "Owner assignment is where the tool starts behaving like a workflow system."
  },
  {
    name: "First reminder created",
    category: "activation_health",
    definition: "Whether the workspace creates a real reminder tied to a live obligation.",
    healthyLooksLike: "The first tracked contract has a reminder or reminder schedule created during onboarding.",
    riskyLooksLike: "The workspace reviews data but never operationalizes it with reminders.",
    reviewCadence: "weekly",
    whyItMatters: "The value proposition is operational control, not passive metadata review."
  },
  {
    name: "First visible live obligation",
    category: "activation_health",
    definition: "Whether the account reaches a state where a due-soon notice or renewal is visible in the dashboard.",
    healthyLooksLike: "The user can see an actionable obligation in the product fast.",
    riskyLooksLike: "The product still feels like setup work instead of live operations.",
    reviewCadence: "weekly",
    whyItMatters: "The user needs to see a real operational risk in the app before they will trust it."
  }
];

export const usageHealthIndicators: CustomerSuccessIndicator[] = [
  {
    name: "Weekly workflow-active accounts",
    category: "usage_health",
    definition: "Accounts with meaningful workflow activity in the last 7 days.",
    healthyLooksLike: "The workspace reviews contracts, adjusts reminders, assigns owners, or records decisions weekly.",
    riskyLooksLike: "The account logs in rarely or only views static screens.",
    reviewCadence: "weekly",
    whyItMatters: "Weekly operational touchpoints are the real usage heartbeat for this product."
  },
  {
    name: "Needs-review revisit rate",
    category: "usage_health",
    definition: "How often admins or operators return to clear review backlog.",
    healthyLooksLike: "Needs-review queues get revisited and reduced.",
    riskyLooksLike: "Backlog grows and nobody comes back to fix trust gaps.",
    reviewCadence: "weekly",
    whyItMatters: "Review avoidance is a common precursor to churn and support pain."
  },
  {
    name: "Digest and dashboard revisit pattern",
    category: "usage_health",
    definition: "Whether the account revisits operational summary views or uses digest-driven workflow.",
    healthyLooksLike: "Admins return from digest or dashboard into live workflow views.",
    riskyLooksLike: "Digests are enabled but nobody acts on them, or the dashboard becomes dormant.",
    reviewCadence: "weekly",
    whyItMatters: "Visibility only matters if it drives action."
  },
  {
    name: "Portfolio coverage momentum",
    category: "usage_health",
    definition: "Whether the number of active tracked contracts is expanding over time.",
    healthyLooksLike: "Accounts progressively centralize more of their renewal universe.",
    riskyLooksLike: "Coverage stays frozen at a trial or pilot footprint.",
    reviewCadence: "monthly",
    whyItMatters: "Coverage growth is a strong sign that the product is becoming the system of record for renewals."
  }
];

export const workflowCompletionIndicators: CustomerSuccessIndicator[] = [
  {
    name: "Owner coverage",
    category: "workflow_completion",
    definition: "Share of active tracked contracts with an assigned owner.",
    healthyLooksLike: "Owner coverage is high and stable.",
    riskyLooksLike: "Owner gaps persist or widen after rollout.",
    reviewCadence: "weekly",
    whyItMatters: "Owner gaps signal shallow adoption and weak accountability."
  },
  {
    name: "Due-soon decision coverage",
    category: "workflow_completion",
    definition: "Share of due-soon contracts with explicit renewal decisions recorded.",
    healthyLooksLike: "Most due-soon contracts have clear decisions on time.",
    riskyLooksLike: "Due windows arrive without decisions, forcing teams back into ad hoc work.",
    reviewCadence: "weekly",
    whyItMatters: "The workflow is only valuable if it drives decisions before deadlines."
  },
  {
    name: "Reminder maintenance coverage",
    category: "workflow_completion",
    definition: "Share of contracts with live obligations that have active reminder coverage.",
    healthyLooksLike: "Relevant contracts have reminders configured and kept current.",
    riskyLooksLike: "Reminder coverage is spotty or stale.",
    reviewCadence: "weekly",
    whyItMatters: "Stale reminder configuration means the product is no longer controlling risk."
  },
  {
    name: "Playbook and rule adherence",
    category: "workflow_completion",
    definition: "Whether accounts using playbooks or custom reminder rules keep those workflows live and used.",
    healthyLooksLike: "Configured rules map to actual recurring workflow behavior.",
    riskyLooksLike: "Complex setup exists but is ignored in day-to-day operations.",
    reviewCadence: "monthly",
    whyItMatters: "Configured workflow depth should create retention, not dead complexity."
  }
];

export const reliabilityPainIndicators: CustomerSuccessIndicator[] = [
  {
    name: "Failed reminder impact",
    category: "reliability_pain",
    definition: "Whether failed reminders affect accounts with active live obligations.",
    healthyLooksLike: "Failures are rare, isolated, and recovered quickly.",
    riskyLooksLike: "The same account sees repeated failed sends or manual reruns.",
    reviewCadence: "weekly",
    whyItMatters: "Reliability pain weakens trust faster than most feature gaps."
  },
  {
    name: "Extraction failure burden",
    category: "reliability_pain",
    definition: "Whether extraction failures or low-confidence results are clustering inside specific accounts.",
    healthyLooksLike: "Most uploaded contracts progress cleanly to review.",
    riskyLooksLike: "Accounts repeatedly hit extraction failures, low confidence, or growing review burden.",
    reviewCadence: "weekly",
    whyItMatters: "Poor extraction quality creates onboarding drag and support burden."
  },
  {
    name: "Manual rescue dependency",
    category: "reliability_pain",
    definition: "Whether the account needs repeated admin/debug intervention to keep the workflow moving.",
    healthyLooksLike: "The account runs without CS or ops rescue.",
    riskyLooksLike: "Support or ops repeatedly reruns reminders, resends notifications, or diagnoses imports.",
    reviewCadence: "weekly",
    whyItMatters: "Manual rescue is a hidden churn and margin signal."
  },
  {
    name: "Trust backlog",
    category: "reliability_pain",
    definition: "Whether reviews, corrections, or workflow exceptions are piling up faster than the account resolves them.",
    healthyLooksLike: "Backlog stays small and gets cleared.",
    riskyLooksLike: "The account accumulates needs-review items and unresolved workflow uncertainty.",
    reviewCadence: "weekly",
    whyItMatters: "A growing trust backlog often means the customer is losing faith in the data."
  }
];

export const commercialOpportunityIndicators: CustomerSuccessIndicator[] = [
  {
    name: "Contract-cap pressure",
    category: "commercial_opportunity",
    definition: "Whether the workspace is approaching or hitting its active tracked contract limit.",
    healthyLooksLike: "High-fit accounts steadily expand toward plan capacity.",
    riskyLooksLike: "The account never gets beyond a tiny footprint.",
    reviewCadence: "weekly",
    whyItMatters: "Capacity pressure is one of the cleanest upgrade signals."
  },
  {
    name: "Coordination complexity",
    category: "commercial_opportunity",
    definition: "Whether the account needs multi-recipient reminders, escalations, or broader team rollout.",
    healthyLooksLike: "The product is spreading into cross-functional renewal operations.",
    riskyLooksLike: "The account remains single-user and shallow after initial setup.",
    reviewCadence: "weekly",
    whyItMatters: "Coordination depth is both an expansion signal and a retention driver."
  },
  {
    name: "Executive visibility demand",
    category: "commercial_opportunity",
    definition: "Whether admins want stronger reporting, review packs, or portfolio-level oversight.",
    healthyLooksLike: "Leadership visibility requests grow as the workflow matures.",
    riskyLooksLike: "No one beyond the initial operator ever depends on the product.",
    reviewCadence: "monthly",
    whyItMatters: "Executive visibility makes the account harder to churn and easier to expand."
  },
  {
    name: "Onboarding-service fit",
    category: "commercial_opportunity",
    definition: "Whether a weakly activated or messy account would benefit from paid import, setup, or workflow help.",
    healthyLooksLike: "The account clearly justifies a scoped service to get embedded faster.",
    riskyLooksLike: "The team keeps struggling but has no clear success path.",
    reviewCadence: "weekly",
    whyItMatters: "Well-scoped services can rescue good-fit accounts without becoming low-margin custom work."
  }
];

export const customerSuccessDashboards: CustomerSuccessDashboardSection[] = [
  {
    title: "Account health triage",
    purpose: "Give CS and founders one place to see healthy, weakly activated, and at-risk accounts.",
    widgets: [
      "Account health score distribution",
      "Accounts by health band",
      "Top negative health-score drivers",
      "Accounts needing onboarding help this week"
    ]
  },
  {
    title: "Activation and onboarding rescue",
    purpose: "Identify workspaces that uploaded data but never reached operational value.",
    widgets: [
      "No first reviewed contract after upload",
      "No first owner assigned",
      "No first reminder created",
      "Imports completed without workflow activation"
    ]
  },
  {
    title: "Workflow health and churn risk",
    purpose: "Track whether the renewal workflow remains embedded and whether churn signals are rising.",
    widgets: [
      "Owner coverage by account",
      "Due-soon decision coverage by account",
      "Reminder continuity by account",
      "Needs-review backlog aging",
      "Accounts opening billing portal with weak workflow depth"
    ]
  },
  {
    title: "Reliability pain and trust risk",
    purpose: "Spot accounts whose workflow is being damaged by failed reminders, extraction issues, or manual rescue load.",
    widgets: [
      "Accounts with repeated reminder failures",
      "Accounts with repeated extraction failures",
      "Low-confidence review backlog by account",
      "Manual rescue actions by account"
    ]
  },
  {
    title: "Expansion and commercial opportunity",
    purpose: "Help CS and growth identify accounts that are healthy enough to expand without forcing bad-fit upsells.",
    widgets: [
      "Accounts near contract caps",
      "Accounts attempting gated collaboration features",
      "Accounts showing coordination complexity",
      "Accounts with executive-reporting demand",
      "Accounts suitable for onboarding or workflow services"
    ]
  }
];

export const interventionPlaybooks: InterventionPlaybook[] = [
  {
    trigger: "Account uploads or imports contracts but does not reach the first reviewed contract milestone.",
    accountType: "Weakly activated account",
    actionOwner: "Customer success or founder",
    playbook: [
      "Reach out with a short review-focused walkthrough, not a generic success email.",
      "Direct the admin to the needs-review queue and the first-value checklist.",
      "Offer scoped onboarding help if the account has meaningful contract volume."
    ],
    successCondition: "At least one contract is reviewed, owned, and visible as a live obligation."
  },
  {
    trigger: "Owner coverage stays low after activation.",
    accountType: "Shallowly embedded account",
    actionOwner: "Customer success",
    playbook: [
      "Send a targeted owner-accountability playbook tied to due-soon risk.",
      "Prompt the admin to assign owners to contracts entering active windows.",
      "Escalate to admin training if the team structure is the blocker."
    ],
    successCondition: "Owner coverage rises and remains stable over the next review windows."
  },
  {
    trigger: "Due-soon decision coverage drops below target threshold.",
    accountType: "At-risk operational account",
    actionOwner: "Customer success or account owner",
    playbook: [
      "Highlight the specific due-soon contracts missing decisions.",
      "Prompt a weekly renewal-review ritual for the admin and contract owners.",
      "Offer quarterly review or reporting support for mature accounts."
    ],
    successCondition: "Decision coverage improves before upcoming notice windows are missed."
  },
  {
    trigger: "Repeated reminder failures, manual reruns, or extraction issues cluster in one account.",
    accountType: "Reliability pain account",
    actionOwner: "Ops with CS visibility",
    playbook: [
      "Investigate the failure pattern before messaging the customer.",
      "Proactively explain impact, recovery, and any required customer action.",
      "Watch the account for reduced workflow trust over the next two weeks."
    ],
    successCondition: "Reliability incidents stop recurring and workflow activity returns to baseline."
  },
  {
    trigger: "Account nears contract cap or repeatedly attempts gated collaboration features.",
    accountType: "High-value expansion candidate",
    actionOwner: "Customer success or founder-led sales",
    playbook: [
      "Anchor the conversation on broader portfolio coverage and team coordination value.",
      "Show which contracts, teams, or recipients are being left outside the workflow today.",
      "Position the upgrade as operational scale, not more software."
    ],
    successCondition: "The account expands plan depth, contract coverage, or service scope without increasing churn risk."
  },
  {
    trigger: "Import completes but the account shows messy data and repeated setup friction.",
    accountType: "Needs onboarding help",
    actionOwner: "Customer success",
    playbook: [
      "Offer the spreadsheet cleanup/import package with fixed scope.",
      "Offer reminder and workflow configuration help if the data is usable but the process is weak.",
      "Do not offer open-ended cleanup or custom ops consulting."
    ],
    successCondition: "The account exits setup friction and begins weekly workflow usage."
  }
];
