export type AnalyticsWeakness = {
  title: string;
  critique: string;
  whyItIsDangerous: string;
};

export const analyticsRedTeamReview = {
  brutalCritique:
    "The analytics strategy is now broad and thoughtful, but it still risks becoming analytics theater if the team mistakes definitions for measurement. Reliability and ops are currently easier to quantify than product value, churn, or true unit economics. That means the company can look data-driven while still missing the moments where activation dies, bad-fit customers destroy margin, and weak accounts drift toward churn. The biggest danger is not missing one chart. It is building a polished analytics layer that still lets the team optimize what is easy to measure instead of what actually drives profit.",
  topWeaknessesBeingRisked: [
    "Overweighting ops and reliability metrics because they are easier to instrument than activation depth.",
    "Using health scores and workflow metrics before the underlying event data is complete enough to trust them.",
    "Treating support burden as logged time only, while hidden Slack, founder, or engineering rescue work goes uncounted.",
    "Relying on pricing funnel metrics before attribution and identity stitching are truly stable.",
    "Assuming contract-count growth means value growth without measuring trust depth and decision completion alongside it.",
    "Letting revenue metrics focus on conversion and plan mix while payback and contribution margin stay partial.",
    "Detecting churn too late because state snapshots are periodic and weak accounts can decay between them.",
    "Missing workflow abandonment when users stop acting on digests or views but still appear technically active.",
    "Allowing event schemas to be neat on paper while properties drift in real implementation.",
    "Keeping too many dashboard layers without a clear rule for which one drives decisions weekly."
  ],
  whatMustBeAdded: [
    "A strict source-of-truth map for every KPI that says event-based, state-derived, or hybrid.",
    "Hidden-support-effort capture for founder, engineering, and ops rescue work.",
    "Health-score confidence flags that fall when underlying signal coverage is incomplete.",
    "More direct workflow abandonment signals, not just inactivity or billing events.",
    "A canonical alert review process so warning thresholds lead to action instead of just notifications."
  ],
  whatShouldBeRemoved: [
    "Any metric or dashboard widget that cannot name the decision it changes.",
    "Raw top-of-funnel counts without activation-quality context.",
    "Duplicative dashboard sections that restate the same metric under different names.",
    "Overly polished composite scores used before the input data is mature.",
    "Ops-heavy metrics presented as proof of business quality without retention or margin linkage."
  ],
  revisedPriorities: [
    "First, make activation and workflow-depth measurement trustworthy enough to guide onboarding and GTM.",
    "Second, make support, onboarding, extraction, and rescue cost capture complete enough for contribution margin.",
    "Third, tighten churn-warning coverage so weak accounts become visible before cancellation intent appears.",
    "Fourth, only then expand deeper executive and anomaly-detection layers."
  ]
};

export const analyticsRedTeamRisks: AnalyticsWeakness[] = [
  {
    title: "Vanity disguised as sophistication",
    critique:
      "Several dashboards are now well-structured, but some still risk looking smart while remaining one layer removed from the real decision. For example, dashboard views, pricing traffic, or generic health summaries can still become vanity if they are not anchored to first value, retention, or margin.",
    whyItIsDangerous:
      "Teams start reporting progress without proving that workflows are embedding, customers are profitable, or churn is being prevented."
  },
  {
    title: "Product metrics still trail ops metrics",
    critique:
      "Reminder failures, import errors, and rescue actions are more concretely measurable than first value, workflow abandonment, and trust depth. That asymmetry means the company can overmanage operational noise while under-managing the actual product funnel.",
    whyItIsDangerous:
      "The business can get better at fighting fires while still failing to improve activation or retention."
  },
  {
    title: "Revenue metrics are cleaner than revenue quality metrics",
    critique:
      "Conversion, checkout, and plan-mix definitions are solid, but margin-adjusted payback and contribution quality still depend on cost logging that is not guaranteed to be complete yet.",
    whyItIsDangerous:
      "The team may overvalue channels or segments that look good on topline revenue but are poor on support or onboarding burden."
  },
  {
    title: "Churn can stay invisible too long",
    critique:
      "Current retention and health logic is strong conceptually, but weak accounts can still appear active if they log in, open digests, or maintain a shallow footprint without real workflow follow-through.",
    whyItIsDangerous:
      "Save plays will trigger late, after the account has already decided the product is non-essential."
  },
  {
    title: "Data quality will break at the joins",
    critique:
      "The strategy assumes organization_id, source, plan, event version, and entity IDs are consistently attached. In practice, attribution, identity stitching, and event-property drift are usually where analytics quality fails first.",
    whyItIsDangerous:
      "Good formulas on paper produce conflicting answers in dashboards, and trust in analytics collapses."
  },
  {
    title: "Health scores may overpromise precision",
    critique:
      "Account health and churn scoring are useful, but they can mislead if scores are treated as objective truth before the underlying events and snapshots are complete and clean.",
    whyItIsDangerous:
      "CS and founders may over-trust scores instead of reading the underlying workflow signals."
  },
  {
    title: "Missing hidden labor",
    critique:
      "Support burden metrics improve when time logging exists, but hidden work from founders, engineering, and ad hoc ops help is still easy to miss.",
    whyItIsDangerous:
      "Contribution margin and margin-risk metrics will look healthier than reality."
  },
  {
    title: "Too much dashboard surface area",
    critique:
      "The system now defines many strong dashboards. Without strict decision ownership, this can become a reporting maze where everyone has visibility but no one has a weekly operating ritual.",
    whyItIsDangerous:
      "The organization confuses access to dashboards with disciplined decision-making."
  },
  {
    title: "Event coverage can still miss trust decay",
    critique:
      "The plan captures review completion, extraction failure, and reminder reliability, but subtle trust decay often shows up as avoidance: fewer revisits, ignored digests, and shallow use of due-soon workflows.",
    whyItIsDangerous:
      "The customer loses confidence before the system throws any obvious failure event."
  },
  {
    title: "Derived metrics can mask raw signal gaps",
    critique:
      "Derived snapshots are the right move, but once dashboards rely on them, teams can stop noticing that some source events are incomplete or delayed.",
    whyItIsDangerous:
      "A clean dashboard can hide broken upstream instrumentation for weeks."
  }
];
