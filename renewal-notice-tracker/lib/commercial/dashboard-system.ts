export type DashboardSpec = {
  name:
    | "founder_executive"
    | "product"
    | "growth_revenue"
    | "retention_customer_success"
    | "support_operations"
    | "reliability_trust";
  title: string;
  purpose: string;
  targetUser: string;
  primaryQuestionsAnswered: string[];
  kpisShown: string[];
  chartsTablesNeeded: string[];
  filtersDimensionsNeeded: string[];
  drilldownsNeeded: string[];
  updateCadence: string;
  alertingLogic: string[];
  decisionsSupported: string[];
};

export const dashboardSystemSpecs: DashboardSpec[] = [
  {
    name: "founder_executive",
    title: "Founder / Executive dashboard",
    purpose:
      "Give the leadership team one place to judge whether the business is getting healthier across growth, retention, gross margin, and product embedding.",
    targetUser: "Founder, CEO, GM, or exec owner of the business",
    primaryQuestionsAnswered: [
      "Are we growing in a way that improves business quality?",
      "Which segments and channels are creating real profit, not just signups?",
      "Is retention improving because workflow depth is improving?",
      "Are support burden or reliability issues threatening margin or churn?"
    ],
    kpisShown: [
      "MRR and ARR",
      "new MRR, expansion MRR, contraction MRR",
      "gross revenue retention and net revenue retention",
      "gross margin by segment",
      "contribution margin per account",
      "activation-to-paid rate",
      "embedded workflow rate",
      "negative-margin account rate",
      "healthy expansion candidate rate"
    ],
    chartsTablesNeeded: [
      "MRR bridge by month",
      "segment profitability table",
      "source quality comparison table",
      "retention trend by plan and source",
      "gross margin trend by segment",
      "top risk accounts summary"
    ],
    filtersDimensionsNeeded: [
      "time period",
      "plan tier",
      "segment",
      "acquisition source",
      "annual vs monthly",
      "contract volume band"
    ],
    drilldownsNeeded: [
      "segment drilldown into activation, margin, and churn",
      "channel drilldown into source quality and payback",
      "plan drilldown into retention and expansion behavior"
    ],
    updateCadence: "Daily refresh with weekly exec review and monthly board-style review.",
    alertingLogic: [
      "Alert when gross margin by key segment falls below threshold.",
      "Alert when negative-margin account rate rises.",
      "Alert when NRR or GRR weakens materially in core cohorts.",
      "Alert when a major channel produces weak activation or poor margin."
    ],
    decisionsSupported: [
      "where to invest GTM",
      "which segments to pursue or cut",
      "whether pricing and packaging are working",
      "whether support or reliability issues need executive attention"
    ]
  },
  {
    name: "product",
    title: "Product dashboard",
    purpose:
      "Show whether the product is turning uploaded contracts into trusted, operational workflows instead of passive storage.",
    targetUser: "Product lead, PM, or founder acting as PM",
    primaryQuestionsAnswered: [
      "Where does activation break?",
      "Which workflow steps create value and which stall?",
      "Are customers trusting extracted data enough to operationalize it?",
      "Which features deepen embedding versus adding noise?"
    ],
    kpisShown: [
      "workspace activation rate",
      "time to first reviewed contract",
      "time to first owner assignment",
      "time to first reminder created",
      "reviewed contract coverage",
      "owner coverage",
      "due-soon decision coverage",
      "reminder workflow continuity",
      "review backlog aging",
      "feature adoption by workflow depth"
    ],
    chartsTablesNeeded: [
      "activation funnel from signup to live obligation",
      "workflow step drop-off chart",
      "cohort trend for reviewed coverage",
      "feature adoption table by plan and maturity",
      "needs-review backlog distribution"
    ],
    filtersDimensionsNeeded: [
      "signup cohort",
      "activation cohort",
      "plan tier",
      "source",
      "import vs upload path",
      "contract volume band"
    ],
    drilldownsNeeded: [
      "step-level activation drilldown",
      "import path vs upload path comparison",
      "feature adoption drilldown by retained vs churned accounts"
    ],
    updateCadence: "Daily refresh with weekly product review.",
    alertingLogic: [
      "Alert when first-review or first-owner rates drop sharply.",
      "Alert when review backlog grows faster than it is cleared.",
      "Alert when workflow-depth metrics weaken in newer cohorts."
    ],
    decisionsSupported: [
      "what onboarding or UX changes to ship next",
      "which workflow steps need simplification",
      "which features truly improve retention or conversion"
    ]
  },
  {
    name: "growth_revenue",
    title: "Growth / Revenue dashboard",
    purpose:
      "Measure whether pricing, packaging, and acquisition are creating efficient monetization instead of superficial funnel activity.",
    targetUser: "Growth lead, founder-led sales owner, revenue operator",
    primaryQuestionsAnswered: [
      "Which channels and messages produce activated paid accounts?",
      "Which upgrade triggers convert best?",
      "Are pricing gates creating pressure at the right moments?",
      "Where are checkout and plan-upgrade flows leaking?"
    ],
    kpisShown: [
      "pricing page to signup rate",
      "trial-to-activation rate",
      "activation-to-paid rate",
      "checkout completion rate",
      "upgrade CTA CTR",
      "commercial gate click-through rate",
      "feature-gate to paid conversion rate",
      "plan mix by logos and MRR",
      "contract-band upgrade rate",
      "trial-to-paid rate by source"
    ],
    chartsTablesNeeded: [
      "pricing funnel by source",
      "checkout funnel by plan and term",
      "upgrade trigger performance table",
      "commercial gate exposure vs conversion table",
      "plan mix and expansion trend chart"
    ],
    filtersDimensionsNeeded: [
      "source",
      "campaign",
      "landing page",
      "plan tier",
      "billing term",
      "segment"
    ],
    drilldownsNeeded: [
      "source-to-paid drilldown",
      "gate-context drilldown",
      "trial cohort drilldown by activation depth"
    ],
    updateCadence: "Daily refresh with twice-weekly growth review.",
    alertingLogic: [
      "Alert when a source drives signups but weak activation-to-paid.",
      "Alert when checkout completion drops by plan or term.",
      "Alert when commercial gates are shown often but clicked rarely."
    ],
    decisionsSupported: [
      "where to allocate acquisition spend",
      "which pricing prompts to improve",
      "whether packaging is creating natural upgrade pressure",
      "when to route accounts into sales assist"
    ]
  },
  {
    name: "retention_customer_success",
    title: "Retention / Customer Success dashboard",
    purpose:
      "Help CS identify healthy accounts, weakly activated accounts, churn risk, onboarding rescue needs, and expansion opportunities tied to workflow depth.",
    targetUser: "Customer success, founder, or account owner",
    primaryQuestionsAnswered: [
      "Which accounts are healthy, watchlist, or at risk?",
      "Which accounts need onboarding rescue right now?",
      "Which accounts are losing workflow discipline?",
      "Which healthy accounts are ready for expansion?"
    ],
    kpisShown: [
      "account health score",
      "weekly workflow-active account rate",
      "owner coverage by account",
      "due-soon decision coverage by account",
      "reminder continuity by account",
      "needs-review backlog aging",
      "accounts near contract cap",
      "accounts with gated collaboration pressure",
      "accounts with reliability pain"
    ],
    chartsTablesNeeded: [
      "account health distribution table",
      "watchlist and churn-risk queue",
      "onboarding rescue queue",
      "expansion candidate table",
      "health score driver breakdown by account"
    ],
    filtersDimensionsNeeded: [
      "plan tier",
      "health band",
      "segment",
      "source",
      "account owner",
      "days since signup"
    ],
    drilldownsNeeded: [
      "single-account health timeline",
      "cohort retention drilldown",
      "health-score driver drilldown into workflow gaps and reliability pain"
    ],
    updateCadence: "Daily refresh with weekly CS review and monthly account review.",
    alertingLogic: [
      "Alert when account health falls into at-risk band.",
      "Alert when due-soon decision coverage falls below threshold.",
      "Alert when a high-value account shows reliability pain or billing-portal risk."
    ],
    decisionsSupported: [
      "which accounts to save first",
      "which accounts need onboarding help",
      "which accounts are ready for upgrade or services",
      "which patterns are causing churn"
    ]
  },
  {
    name: "support_operations",
    title: "Support / Operations dashboard",
    purpose:
      "Monitor the operational burden created by imports, support cases, manual rescue, and workflow confusion so the team can reduce avoidable cost.",
    targetUser: "Support lead, ops owner, founder in early stage",
    primaryQuestionsAnswered: [
      "Where is support burden rising?",
      "Which issues are consuming too much human time?",
      "Which accounts need repeated rescue or education?",
      "What should be automated or productized next?"
    ],
    kpisShown: [
      "support touches per active account",
      "support time per account",
      "onboarding blocker resolution time",
      "messy-import burden rate",
      "manual rescue volume",
      "admin/debug rescue rate",
      "repeat issue rate by category",
      "high-touch low-ACV account rate"
    ],
    chartsTablesNeeded: [
      "support burden by issue category",
      "manual rescue trend chart",
      "import failure and rescue table",
      "top support-heavy accounts table",
      "support effort by plan and segment"
    ],
    filtersDimensionsNeeded: [
      "issue type",
      "plan tier",
      "segment",
      "import vs upload path",
      "support owner",
      "time period"
    ],
    drilldownsNeeded: [
      "account-level support history",
      "issue-category drilldown",
      "import workflow drilldown"
    ],
    updateCadence: "Daily refresh with weekly ops review.",
    alertingLogic: [
      "Alert when manual rescue volume rises for multiple weeks.",
      "Alert when onboarding resolution time exceeds the trial window.",
      "Alert when low-ACV accounts consume disproportionate support effort."
    ],
    decisionsSupported: [
      "what to automate first",
      "which accounts need paid services instead of free support",
      "which issues are product gaps versus bad-fit-customer problems"
    ]
  },
  {
    name: "reliability_trust",
    title: "Reliability / Trust dashboard",
    purpose:
      "Protect the product promise by measuring whether reminders send, extraction is trustworthy, failures are visible, and wrong behavior stays rare.",
    targetUser: "Engineering lead, ops, product, and support lead",
    primaryQuestionsAnswered: [
      "Are reminders being delivered reliably and on time?",
      "Are retries helping or masking deeper problems?",
      "Is extraction quality creating trust or burden?",
      "Are wrong-behavior incidents or hidden failures rising?"
    ],
    kpisShown: [
      "reminder delivery success rate",
      "duplicate suppression rate",
      "cron success rate",
      "cron lag",
      "retry recovery rate",
      "extraction failure rate",
      "low-confidence extraction rate",
      "review completion rate",
      "wrong-behavior incident rate",
      "visibility of failed work rate"
    ],
    chartsTablesNeeded: [
      "reminder reliability trend chart",
      "cron lag distribution",
      "retry funnel",
      "extraction quality trend",
      "account-level reliability incident table"
    ],
    filtersDimensionsNeeded: [
      "channel",
      "organization",
      "plan tier",
      "document source type",
      "time period",
      "incident class"
    ],
    drilldownsNeeded: [
      "account-level reminder failure drilldown",
      "document-source extraction drilldown",
      "incident timeline drilldown"
    ],
    updateCadence: "Near-real-time or hourly for ops, with weekly trust review.",
    alertingLogic: [
      "Alert immediately on critical reminder delivery or duplicate failures.",
      "Alert when cron lag exceeds one run interval.",
      "Alert when extraction failures spike on common document patterns.",
      "Alert when wrong-behavior incidents recur."
    ],
    decisionsSupported: [
      "incident escalation",
      "reliability prioritization",
      "which failure modes need product or infra fixes",
      "when to proactively notify affected customers"
    ]
  }
];
