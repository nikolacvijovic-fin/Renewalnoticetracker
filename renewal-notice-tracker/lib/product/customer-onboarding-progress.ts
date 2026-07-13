import { normalizeBillingSnapshot } from "@/lib/billing/entitlements";
import {
  CUSTOMER_ONBOARDING_MILESTONE_IDS,
  CUSTOMER_ONBOARDING_MILESTONES,
  type CustomerOnboardingMilestoneId,
  type CustomerOnboardingPrivacySensitivity
} from "@/lib/product/customer-onboarding";
import { PRODUCT_EVENT_TAXONOMY } from "@/lib/product/event-taxonomy";

export type CustomerOnboardingProgressEvidenceKind =
  | "shipped_event"
  | "state_or_query_fallback"
  | "not_completed";

export type CustomerOnboardingProgressInput = {
  organizationId: string;
  organizationCreatedAt?: string | null;
  hasActiveOrganizationMembership?: boolean;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  trialEndsAt?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  totalContracts: number;
  reviewedContracts: number;
  ownerAssignedContracts: number;
  trustedReminderCount: number;
  liveObligationCount: number;
  decisionCount: number;
  completedExportCount: number;
  intelligenceViewCount: number;
  acknowledgedContractCount: number;
  closedOrReopenedCycleCount: number;
  shippedEventNames?: readonly string[];
  futureEventNames?: readonly string[];
};

export type CustomerOnboardingMilestoneProgress = {
  id: CustomerOnboardingMilestoneId;
  key: CustomerOnboardingMilestoneId;
  label: string;
  description: string;
  href: string;
  completed: boolean;
  evidenceKind: CustomerOnboardingProgressEvidenceKind;
  evidence: readonly string[];
  privacySensitivity: CustomerOnboardingPrivacySensitivity;
};

export type CustomerOnboardingProgress = {
  milestones: CustomerOnboardingMilestoneProgress[];
  completedCount: number;
  totalCount: number;
  firstValueCompleted: boolean;
  renewalLoopCompleted: boolean;
  nextMilestone: CustomerOnboardingMilestoneProgress | null;
  customerSafeSummary: string;
};

const MILESTONE_COPY: Record<
  CustomerOnboardingMilestoneId,
  { description: string; href: string }
> = {
  workspace_created: {
    description: "Workspace and active organization context are ready.",
    href: "/dashboard/settings"
  },
  first_contract_uploaded: {
    description: "Add one contract so renewal-control work has a record to act on.",
    href: "/dashboard/contracts/new"
  },
  first_contract_reviewed: {
    description: "Review P0 fields before dates become workflow truth.",
    href: "/dashboard/contracts?filter=needs_review"
  },
  first_owner_assigned: {
    description: "Assign one accountable owner before reminder work becomes operational.",
    href: "/dashboard/contracts"
  },
  first_reminder_trusted: {
    description: "Create a trusted reminder after review, owner, and date gates pass.",
    href: "/dashboard/contracts"
  },
  first_decision_recorded: {
    description: "Record the first renewal decision as workflow state.",
    href: "/dashboard/contracts"
  },
  first_export_completed: {
    description: "Complete one safe export when the team needs a register or workflow report.",
    href: "/dashboard/contracts"
  },
  billing_configured: {
    description: "Confirm billing state through the canonical billing snapshot.",
    href: "/dashboard/settings"
  },
  first_intelligence_viewed: {
    description: "View a gated intelligence surface with trust and confidence labels.",
    href: "/dashboard/risk-queue"
  },
  renewal_loop_completed: {
    description: "Complete the renewal-control loop through acknowledgment, decision, and cycle state.",
    href: "/dashboard/contracts"
  }
};

function hasEmittedEvent(eventName: string, shippedEventNames: ReadonlySet<string>) {
  const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
  return Boolean(event?.emittedToday && shippedEventNames.has(eventName));
}

function shippedEventEvidenceFor(
  milestoneId: CustomerOnboardingMilestoneId,
  shippedEventNames: ReadonlySet<string>
) {
  return CUSTOMER_ONBOARDING_MILESTONES[milestoneId].evidence.shippedEvidenceEvents.filter(
    (eventName) => hasEmittedEvent(eventName, shippedEventNames)
  );
}

function isBillingConfiguredForOnboarding(input: CustomerOnboardingProgressInput) {
  const snapshot = normalizeBillingSnapshot({
    organizationId: input.organizationId,
    plan_tier: input.planTier,
    subscription_status: input.subscriptionStatus,
    billing_provider: input.billingProvider,
    trial_ends_at: input.trialEndsAt,
    subscription_current_period_end: input.subscriptionCurrentPeriodEnd
  });

  const hasUsableStatus = ["active", "trialing", "past_due"].includes(snapshot.subscriptionStatus);
  const hasProviderOrTrial = snapshot.billingProvider !== "none" || snapshot.subscriptionStatus === "trialing";
  return snapshot.planTier !== "free" && hasUsableStatus && hasProviderOrTrial;
}

function hasRenewalLoopEventEvidence(shippedEventNames: ReadonlySet<string>) {
  const acknowledgmentEvents = ["contract.acknowledged", "contract.acknowledged_from_email", "acknowledgment_recorded"];
  const decisionEvents = ["renewal_decision_recorded"];
  const cycleEvents = ["renewal_cycle.updated"];

  return (
    acknowledgmentEvents.some((eventName) => hasEmittedEvent(eventName, shippedEventNames)) &&
    decisionEvents.some((eventName) => hasEmittedEvent(eventName, shippedEventNames)) &&
    cycleEvents.some((eventName) => hasEmittedEvent(eventName, shippedEventNames))
  );
}

function stateFallbackCompleted(
  milestoneId: CustomerOnboardingMilestoneId,
  input: CustomerOnboardingProgressInput
) {
  switch (milestoneId) {
    case "workspace_created":
      return Boolean(input.hasActiveOrganizationMembership || input.organizationCreatedAt);
    case "first_contract_uploaded":
      return input.totalContracts > 0;
    case "first_contract_reviewed":
      return input.reviewedContracts > 0;
    case "first_owner_assigned":
      return input.ownerAssignedContracts > 0;
    case "first_reminder_trusted":
      return input.trustedReminderCount > 0;
    case "first_decision_recorded":
      return input.decisionCount > 0;
    case "first_export_completed":
      return input.completedExportCount > 0;
    case "billing_configured":
      return isBillingConfiguredForOnboarding(input);
    case "first_intelligence_viewed":
      return input.intelligenceViewCount > 0;
    case "renewal_loop_completed":
      return (
        input.acknowledgedContractCount > 0 &&
        input.decisionCount > 0 &&
        input.closedOrReopenedCycleCount > 0
      );
  }
}

function buildMilestoneProgress(
  milestoneId: CustomerOnboardingMilestoneId,
  input: CustomerOnboardingProgressInput,
  shippedEventNames: ReadonlySet<string>
): CustomerOnboardingMilestoneProgress {
  const milestone = CUSTOMER_ONBOARDING_MILESTONES[milestoneId];
  const shippedEvents = shippedEventEvidenceFor(milestoneId, shippedEventNames);
  const renewalLoopEventComplete =
    milestoneId === "renewal_loop_completed" && hasRenewalLoopEventEvidence(shippedEventNames);
  const fallbackCompleted = stateFallbackCompleted(milestoneId, input);
  const completed = shippedEvents.length > 0 || renewalLoopEventComplete || fallbackCompleted;
  const copy = MILESTONE_COPY[milestoneId];

  if (shippedEvents.length > 0 || renewalLoopEventComplete) {
    return {
      id: milestoneId,
      key: milestoneId,
      label: milestone.label,
      description: copy.description,
      href: copy.href,
      completed,
      evidenceKind: "shipped_event",
      evidence:
        shippedEvents.length > 0
          ? shippedEvents
          : ["contract.acknowledged", "renewal_decision_recorded", "renewal_cycle.updated"],
      privacySensitivity: milestone.privacySensitivity
    };
  }

  if (fallbackCompleted) {
    return {
      id: milestoneId,
      key: milestoneId,
      label: milestone.label,
      description: copy.description,
      href: copy.href,
      completed,
      evidenceKind: "state_or_query_fallback",
      evidence: milestone.evidence.stateOrQueryFallbacks,
      privacySensitivity: milestone.privacySensitivity
    };
  }

  return {
    id: milestoneId,
    key: milestoneId,
    label: milestone.label,
    description: copy.description,
    href: copy.href,
    completed: false,
    evidenceKind: "not_completed",
    evidence: [],
    privacySensitivity: milestone.privacySensitivity
  };
}

export function buildCustomerOnboardingProgress(
  input: CustomerOnboardingProgressInput
): CustomerOnboardingProgress {
  const shippedEventNames = new Set(input.shippedEventNames ?? []);
  const milestones = CUSTOMER_ONBOARDING_MILESTONE_IDS.map((milestoneId) =>
    buildMilestoneProgress(milestoneId, input, shippedEventNames)
  );
  const completedCount = milestones.filter((milestone) => milestone.completed).length;
  const milestoneCompleted = (id: CustomerOnboardingMilestoneId) =>
    milestones.find((milestone) => milestone.id === id)?.completed ?? false;
  const firstValueCompleted =
    milestoneCompleted("first_contract_uploaded") &&
    milestoneCompleted("first_contract_reviewed") &&
    milestoneCompleted("first_owner_assigned") &&
    milestoneCompleted("first_reminder_trusted");
  const renewalLoopCompleted = milestoneCompleted("renewal_loop_completed");

  return {
    milestones,
    completedCount,
    totalCount: milestones.length,
    firstValueCompleted,
    renewalLoopCompleted,
    nextMilestone: milestones.find((milestone) => !milestone.completed) ?? null,
    customerSafeSummary: firstValueCompleted
      ? "First value is active: one reviewed, owned contract has a trusted reminder path."
      : "First value is not complete yet: keep moving through upload, review, owner, and trusted reminder setup."
  };
}
