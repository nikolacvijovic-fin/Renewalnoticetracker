export type ProductKpiDefinition = {
  name: string;
  category:
    | "north_star"
    | "activation"
    | "product"
    | "funnel"
    | "adoption"
    | "workflow"
    | "value_realization"
    | "feature_adoption"
    | "trust_quality"
    | "vanity";
  whyItMatters: string;
  calculation: string;
  reviewCadence: "daily" | "weekly" | "monthly";
  goodLooksLike: string;
  badLooksLike: string;
};

export const productKpiNorthStar: ProductKpiDefinition = {
  name: "Active tracked contracts with reviewed dates, assigned owners, and live obligations surfaced",
  category: "north_star",
  whyItMatters:
    "This measures whether the product is actually controlling renewal risk in paying workspaces, not just storing contracts.",
  calculation:
    "Count active tracked contracts in paying workspaces where review is completed, owner is assigned, and at least one live renewal or notice obligation is surfaced.",
  reviewCadence: "weekly",
  goodLooksLike: "The metric rises with paid workspace growth and with deeper contract coverage inside existing accounts.",
  badLooksLike: "Paid accounts exist, but reviewed and owner-assigned obligations stay flat or shallow."
};

export const activationKpi: ProductKpiDefinition = {
  name: "Workspace activation rate",
  category: "activation",
  whyItMatters:
    "Activation is the point where the product becomes operationally trustworthy and worth paying for.",
  calculation:
    "Activated workspaces divided by new workspaces, where activation means at least one contract uploaded, reviewed, owner-assigned, reminder-enabled, and visible with a live obligation.",
  reviewCadence: "weekly",
  goodLooksLike: "A clear majority of qualified new workspaces activate quickly after signup.",
  badLooksLike: "Most signups upload something but never review, assign an owner, or create a live workflow."
};

export const productKpis: ProductKpiDefinition[] = [
  {
    name: "Reviewed contract coverage",
    category: "product",
    whyItMatters: "Unreviewed contracts do not create trusted workflows.",
    calculation: "Reviewed active tracked contracts divided by all active tracked contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Coverage trends upward and stays high in retained accounts.",
    badLooksLike: "Coverage stalls, creating reminder distrust and shallow adoption."
  },
  {
    name: "Owner assignment coverage",
    category: "product",
    whyItMatters: "Ownership is the backbone of accountability and stickiness.",
    calculation: "Active tracked contracts with an assigned owner divided by all active tracked contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Most tracked contracts have accountable owners.",
    badLooksLike: "Large owner gaps remain after onboarding, weakening retention."
  },
  {
    name: "First reminder creation rate",
    category: "product",
    whyItMatters: "A reminder marks the jump from stored data to live workflow.",
    calculation: "Workspaces with at least one reminder created divided by workspaces with at least one reviewed contract.",
    reviewCadence: "weekly",
    goodLooksLike: "Reviewed contracts regularly convert into reminders.",
    badLooksLike: "Users trust dates enough to review but never operationalize them."
  },
  {
    name: "Renewal decision coverage",
    category: "workflow",
    whyItMatters: "Decision tracking is a deep adoption and retention signal.",
    calculation: "Due-soon contracts with a renewal decision recorded divided by all due-soon contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Due-soon contracts increasingly carry explicit decisions.",
    badLooksLike: "Teams rely on reminders but never close the loop with decisions."
  },
  {
    name: "Live obligations surfaced per workspace",
    category: "value_realization",
    whyItMatters: "Value feels real when the dashboard shows upcoming obligations, not just contract records.",
    calculation: "Average count of renewal or notice obligations visible in the due-soon window per active workspace.",
    reviewCadence: "weekly",
    goodLooksLike: "Active workspaces consistently show actionable obligations.",
    badLooksLike: "Dashboards remain empty because dates, review, or coverage are incomplete."
  },
  {
    name: "Contract coverage expansion rate",
    category: "adoption",
    whyItMatters: "Expansion inside the product shows that teams are centralizing more of their real contract portfolio.",
    calculation: "Net growth in active tracked contracts per workspace over time, excluding churned workspaces.",
    reviewCadence: "monthly",
    goodLooksLike: "Retained accounts add more meaningful contracts over time.",
    badLooksLike: "Usage stays stuck at a tiny pilot footprint."
  },
  {
    name: "Upload to review conversion rate",
    category: "funnel",
    whyItMatters: "This is the core trust bottleneck in the product funnel.",
    calculation: "Contracts reviewed divided by contracts uploaded or imported.",
    reviewCadence: "weekly",
    goodLooksLike: "Most uploaded contracts become trusted reviewed records.",
    badLooksLike: "Uploads pile up in review backlog and never become useful."
  },
  {
    name: "Review to owner conversion rate",
    category: "funnel",
    whyItMatters: "A reviewed contract without an owner is still not operationally embedded.",
    calculation: "Reviewed contracts with owners divided by all reviewed contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Ownership follows review quickly.",
    badLooksLike: "Reviewed contracts remain passive records."
  },
  {
    name: "Time to trusted contract",
    category: "trust_quality",
    whyItMatters: "Fast trust-building improves activation and lowers onboarding drag.",
    calculation: "Median time from first upload/import completion to contract_review_completed.",
    reviewCadence: "weekly",
    goodLooksLike: "Teams reach trusted data quickly after intake.",
    badLooksLike: "Review takes too long, delaying value and paid conversion."
  },
  {
    name: "Saved-view and dashboard return rate",
    category: "adoption",
    whyItMatters: "Recurring dashboard use is one of the clearest signals of habit formation.",
    calculation: "Weekly active workspaces that revisit dashboard or operational views divided by all active workspaces.",
    reviewCadence: "weekly",
    goodLooksLike: "Workspaces return consistently during the renewal review cycle.",
    badLooksLike: "Usage is one-time and event-driven only."
  }
];

export const featureAdoptionKpis: ProductKpiDefinition[] = [
  {
    name: "Import adoption rate",
    category: "feature_adoption",
    whyItMatters: "Import is a major accelerator of portfolio coverage and services demand.",
    calculation: "Workspaces with at least one completed import divided by all activated workspaces.",
    reviewCadence: "monthly",
    goodLooksLike: "Serious accounts use import to centralize meaningful coverage.",
    badLooksLike: "Imports are rare or repeatedly fail."
  },
  {
    name: "Multi-recipient reminder adoption",
    category: "feature_adoption",
    whyItMatters: "This shows cross-team coordination depth and Growth fit.",
    calculation: "Growth-eligible workspaces with at least one multi-recipient reminder divided by all Growth workspaces.",
    reviewCadence: "monthly",
    goodLooksLike: "Growth accounts use coordination features regularly.",
    badLooksLike: "Growth is purchased but used like Starter."
  },
  {
    name: "Playbook adoption rate",
    category: "feature_adoption",
    whyItMatters: "Playbooks indicate process standardization and team maturity.",
    calculation: "Workspaces with at least one playbook applied divided by all workspaces eligible for playbooks.",
    reviewCadence: "monthly",
    goodLooksLike: "Teams use templates to scale workflow consistency.",
    badLooksLike: "The feature exists but rarely affects real workflow."
  },
  {
    name: "Digest adoption rate",
    category: "feature_adoption",
    whyItMatters: "Digests pull admins and leaders into recurring reporting loops.",
    calculation: "Workspaces with digest configured and at least one digest sent divided by eligible workspaces.",
    reviewCadence: "monthly",
    goodLooksLike: "Admins rely on digests as part of the operating cadence.",
    badLooksLike: "Digests are configured once and never become habit."
  }
];

export const trustQualityKpis: ProductKpiDefinition[] = [
  {
    name: "Review correction rate",
    category: "trust_quality",
    whyItMatters: "Too much correction means extraction trust is weak; too little may mean review is superficial.",
    calculation: "Total corrected fields during review divided by total reviewed fields or reviewed contracts, depending on implementation detail.",
    reviewCadence: "weekly",
    goodLooksLike: "A stable, explainable correction rate with improvement by source and template type.",
    badLooksLike: "Correction spikes or collapses without explanation."
  },
  {
    name: "Low-confidence extraction rate",
    category: "trust_quality",
    whyItMatters: "This is the best early warning of review burden and support drag.",
    calculation: "Contracts with extraction confidence below threshold divided by all extracted contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Low-confidence cases stay bounded and concentrated in known edge cases.",
    badLooksLike: "Low-confidence extraction becomes common across normal uploads."
  },
  {
    name: "Contracts missing key dates",
    category: "trust_quality",
    whyItMatters: "A contract without the right dates cannot generate the core workflow.",
    calculation: "Active tracked contracts missing renewal date, notice date, or required key metadata divided by all active tracked contracts.",
    reviewCadence: "weekly",
    goodLooksLike: "Missing-date rate falls after onboarding and import cleanup.",
    badLooksLike: "Key metadata gaps keep the product from surfacing obligations."
  }
];

export const vanityKpisToIgnore: ProductKpiDefinition[] = [
  {
    name: "Raw signup count",
    category: "vanity",
    whyItMatters: "By itself it does not.",
    calculation: "Total new signups in a period.",
    reviewCadence: "weekly",
    goodLooksLike: "Only meaningful when paired with activation quality.",
    badLooksLike: "Used as a success metric without activation or retention context."
  },
  {
    name: "Total reminders sent",
    category: "vanity",
    whyItMatters: "Reminder volume alone says nothing about trust, action, or retention.",
    calculation: "Count of all reminders sent in a period.",
    reviewCadence: "weekly",
    goodLooksLike: "Only used with success rate and downstream workflow action.",
    badLooksLike: "Celebrated as engagement without reliability or outcome context."
  },
  {
    name: "Total stored contracts",
    category: "vanity",
    whyItMatters: "Stored contracts can include dead, unreviewed, or operationally useless records.",
    calculation: "Count of all stored contracts regardless of state.",
    reviewCadence: "monthly",
    goodLooksLike: "Replaced by active tracked contract coverage metrics.",
    badLooksLike: "Used instead of reviewed and owner-assigned contract depth."
  }
];
