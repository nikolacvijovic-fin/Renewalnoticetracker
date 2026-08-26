export const SUBSCRIPTION_FINDING_REVIEW_STATUSES = [
  "open",
  "accepted",
  "rejected",
  "deferred",
  "action_planned"
] as const;

export type SubscriptionFindingReviewStatus =
  (typeof SUBSCRIPTION_FINDING_REVIEW_STATUSES)[number];

export type SubscriptionFindingLifecycle =
  | "requires_review"
  | "reviewed_decided"
  | "reviewed_deferred"
  | "action_in_progress"
  | "resolved"
  | "superseded";

export type SubscriptionFindingLifecycleInput = {
  reviewStatus: string | null | undefined;
  resolvedAt?: string | null;
  supersededAt?: string | null;
};

export function classifySubscriptionFindingLifecycle(
  input: SubscriptionFindingLifecycleInput
): SubscriptionFindingLifecycle {
  if (input.supersededAt) return "superseded";
  if (input.resolvedAt) return "resolved";
  switch (input.reviewStatus) {
    case "accepted":
    case "rejected":
      return "reviewed_decided";
    case "deferred":
      return "reviewed_deferred";
    case "action_planned":
      return "action_in_progress";
    case "open":
    default:
      return "requires_review";
  }
}

export function isActiveSubscriptionFinding(input: SubscriptionFindingLifecycleInput) {
  return !["resolved", "superseded"].includes(classifySubscriptionFindingLifecycle(input));
}

export function isReviewedSubscriptionFinding(input: SubscriptionFindingLifecycleInput) {
  return classifySubscriptionFindingLifecycle(input) !== "requires_review";
}

export function contributesAcceptedEstimatedSavings(input: SubscriptionFindingLifecycleInput) {
  return isActiveSubscriptionFinding(input) && ["accepted", "action_planned"].includes(input.reviewStatus ?? "");
}

export function blocksActionRequiredProfile(input: SubscriptionFindingLifecycleInput) {
  return ["requires_review", "reviewed_deferred"].includes(classifySubscriptionFindingLifecycle(input));
}
