export type RetentionInput = {
  totalContracts: number;
  needsReview: number;
  renewalsDueSoon: number;
  noticeDeadlinesDueSoon: number;
  reviewedContracts: number;
  ownerAssignedContracts: number;
};

export type RetentionLoop = {
  name: string;
  description: string;
  trigger: string;
  retentionImpact: string;
};

export type AccountHealthSummary = {
  score: number;
  status: "healthy" | "watch" | "at_risk";
  summary: string;
  healthySignals: string[];
  churnSignals: string[];
  recommendedActions: Array<{
    title: string;
    description: string;
    href: string;
  }>;
};

export const retentionAnalysis = {
  recurringWorkflow:
    "Customers keep paying when the product becomes the weekly place where upcoming renewals, notice deadlines, owners, and decisions are reviewed and acted on.",
  stickiness:
    "Sticky accounts centralize more contracts, assign accountable owners, review extracted dates quickly, and use the dashboard as their operating queue instead of a static record system.",
  habit:
    "Habit forms when the team returns to clear review queues, upcoming obligations, and unresolved owner gaps every week.",
  operationalEmbedding:
    "Operational embedding happens when reminders, owners, and renewal decisions become part of procurement, finance, or vendor-management rhythm.",
  earlyChurn: [
    "No contract reviewed after upload",
    "No owner assignment after first import",
    "No visible upcoming obligation in the workflow",
    "The product feels like a one-time setup instead of an operating habit"
  ],
  laterChurn: [
    "Portfolio coverage stays narrow and never expands",
    "Owners and decisions become stale",
    "Leadership never sees recurring reports",
    "The account stops using the workflow and falls back to spreadsheets or email"
  ],
  ltvFeatures: [
    "Owner-gap prompts",
    "Decision hygiene prompts",
    "Operational saved views for due soon and needs review",
    "Leadership-ready reporting loops",
    "Cross-team reminder routing"
  ],
  healthyBehaviors: [
    "Reviewed contracts keep rising",
    "Owner assignment coverage is high",
    "There are live upcoming obligations in the dashboard",
    "The account expands tracked contract coverage over time"
  ],
  churnBehaviors: [
    "Most contracts stay unreviewed",
    "Owners remain unassigned",
    "No upcoming obligations are surfaced because data is incomplete",
    "Coverage stalls at a tiny contract set"
  ],
  productImprovements:
    "The biggest LTV lift comes from stronger owner/accountability prompts, decision hygiene, and reporting loops that pull leadership into the workflow without turning the product into CLM."
};

export const retentionLoops = {
  reminderDriven: [
    {
      name: "Due soon review loop",
      description:
        "Upcoming notice and renewal dates pull users back into the dashboard to review what needs action this week.",
      trigger: "A renewal or notice deadline enters the next 30-day window.",
      retentionImpact: "Creates natural recurring engagement tied to real operational risk."
    },
    {
      name: "Needs review cleanup loop",
      description:
        "Contracts that still need review create a queue that teams are encouraged to clear before relying on reminders.",
      trigger: "A newly uploaded or imported contract remains unreviewed.",
      retentionImpact: "Improves trust in the data and keeps the workflow active."
    }
  ] satisfies RetentionLoop[],
  ownershipAccountability: [
    {
      name: "Owner coverage loop",
      description:
        "Unassigned contracts trigger follow-up work until every active contract has a named owner.",
      trigger: "A contract has no owner.",
      retentionImpact: "Makes the product part of team accountability, not just storage."
    },
    {
      name: "Decision hygiene loop",
      description:
        "Teams return to log renewal decisions on contracts that are approaching action windows.",
      trigger: "A contract is due soon and still has no clear renewal path.",
      retentionImpact: "Deepens workflow depth and raises switching cost."
    }
  ] satisfies RetentionLoop[],
  reporting: [
    {
      name: "Leadership visibility loop",
      description:
        "Admins return to prepare or review portfolio-level summaries for finance or procurement leadership.",
      trigger: "Upcoming renewal exposure needs to be communicated upward.",
      retentionImpact: "Extends product value beyond the daily user and into management reporting."
    }
  ] satisfies RetentionLoop[]
};

export const retentionMetrics = {
  weekly: [
    "accounts with at least one reviewed contract",
    "owner assignment coverage",
    "contracts needing review",
    "accounts with upcoming obligations surfaced",
    "contract-count expansion by account"
  ],
  monthly: [
    "logo retention",
    "expansion into higher contract bands",
    "renewal decision coverage",
    "reporting package attachment",
    "accounts with persistent owner gaps or review gaps"
  ]
};

export function getAccountHealthSummary(input: RetentionInput): AccountHealthSummary {
  const healthySignals: string[] = [];
  const churnSignals: string[] = [];
  const recommendedActions: AccountHealthSummary["recommendedActions"] = [];

  const reviewCoverage = input.totalContracts > 0 ? input.reviewedContracts / input.totalContracts : 0;
  const ownerCoverage =
    input.totalContracts > 0 ? input.ownerAssignedContracts / input.totalContracts : 0;
  const obligationsVisible = input.renewalsDueSoon + input.noticeDeadlinesDueSoon;

  let score = 0;

  if (input.totalContracts > 0) {
    score += 20;
    healthySignals.push("The account has started centralizing contracts in the product.");
  } else {
    churnSignals.push("No contracts are being managed in the workflow yet.");
    recommendedActions.push({
      title: "Add the next contract",
      description: "Get another renewal or notice obligation under management.",
      href: "/dashboard/contracts/new"
    });
  }

  if (reviewCoverage >= 0.75) {
    score += 30;
    healthySignals.push("Most tracked contracts have been reviewed and trusted.");
  } else {
    churnSignals.push("Too many contracts are still waiting on review.");
    recommendedActions.push({
      title: "Clear the review queue",
      description: "Review extracted dates so reminders and deadlines can be trusted.",
      href: "/dashboard/contracts?filter=needs_review"
    });
  }

  if (ownerCoverage >= 0.75) {
    score += 25;
    healthySignals.push("Owner coverage is strong, which supports accountability.");
  } else {
    churnSignals.push("Owner assignment is too low for a durable operating workflow.");
    recommendedActions.push({
      title: "Assign owners",
      description: "Make every active contract accountable to a person or team.",
      href: "/dashboard/contracts"
    });
  }

  if (obligationsVisible > 0) {
    score += 15;
    healthySignals.push("The dashboard is surfacing live upcoming obligations.");
  } else if (input.totalContracts > 0) {
    churnSignals.push("No live upcoming obligations are visible, which weakens habit.");
  }

  if (input.totalContracts >= 10) {
    score += 10;
    healthySignals.push("The account is moving meaningful portfolio coverage into the tool.");
  } else if (input.totalContracts > 0) {
    churnSignals.push("Coverage is still narrow and may be treated as a trial project.");
    recommendedActions.push({
      title: "Expand coverage",
      description: "Track more active contracts so the product becomes the real operating system.",
      href: "/dashboard/contracts/new"
    });
  }

  const status = score >= 75 ? "healthy" : score >= 45 ? "watch" : "at_risk";
  const summary =
    status === "healthy"
      ? "The account shows the behaviors of a durable renewal-ops workflow."
      : status === "watch"
        ? "The account has some good signals, but weak workflow depth could turn into churn."
        : "The account is not yet operationally embedded and needs intervention fast.";

  return {
    score,
    status,
    summary,
    healthySignals,
    churnSignals,
    recommendedActions: recommendedActions.slice(0, 3)
  };
}
