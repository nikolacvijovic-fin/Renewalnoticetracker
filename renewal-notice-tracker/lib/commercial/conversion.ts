import { getContractTrackingLimitResult, normalizeBillingSnapshot } from "@/lib/billing/entitlements";
import { ACTIVATION_POLICY, getActivationStatus } from "@/lib/commercial/activation";

export type OnboardingChecklistItem = {
  key: "first_contract" | "first_review" | "first_owner" | "first_risk_visible";
  label: string;
  description: string;
  completed: boolean;
  href: string;
};

export type UpgradePrompt = {
  title: string;
  message: string;
  href: string;
  label: string;
  tone: "primary" | "secondary";
};

export type DashboardConversionInput = {
  organizationId: string;
  organizationCreatedAt?: string | null;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  trialEndsAt?: string | null;
  totalContracts: number;
  needsReview: number;
  renewalsDueSoon: number;
  noticeDeadlinesDueSoon: number;
  reviewedContracts: number;
  ownerAssignedContracts: number;
  reminderCount?: number;
  decisionCount?: number;
  completedImportCount30d?: number;
};

export const conversionAnalysis = {
  valueBecomesReal:
    "Value becomes real when a contract is reviewed, an owner is assigned, and the team can see an upcoming renewal or notice obligation in a live workflow.",
  firstValueMilestone:
    "The first-value milestone should be one reviewed contract with an owner and a visible deadline in the dashboard.",
  firstPaidValueMilestone:
    "The first paid-value milestone should be when the team needs broader portfolio coverage, multi-person accountability, or operational routing beyond a single-user workflow.",
  onboardingFriction: [
    "Users can land on the dashboard without a clear activation checklist.",
    "The product shows state, but it does not strongly narrate what first success looks like.",
    "Upgrade prompts mostly appear at denial moments instead of earlier high-intent moments."
  ],
  upgradePromptMoments: [
    "Approaching tracked contract cap",
    "Needing Slack or Teams delivery",
    "Needing multi-recipient reminders",
    "Wanting richer reporting for leadership",
    "Trial expiry after successful activation"
  ],
  firstSessionPrinciples: [
    "Get one contract into the system",
    "Review one contract to trust the extracted dates",
    "Assign an owner so the workflow becomes operational",
    "Show the team a visible upcoming risk or milestone"
  ],
  beforeAskingForMoney:
    "Before asking for money, the user should see one concrete contract outcome, understand the workflow, and understand what broader coverage or team coordination would unlock.",
  dropOffReduction: [
    "Use a checklist instead of passive dashboard metrics alone",
    "Explain why each onboarding step matters operationally",
    "Prompt upgrades when success expands, not only when denial hits"
  ],
  bestTrialRecommendation:
    "Use a 14-day trial for SMB and lower mid-market self-serve accounts, then use sales-assist for highly active, higher-fit accounts."
};

export const conversionExperiments = [
  "Test a dashboard checklist versus a passive dashboard for first-week activation.",
  "Test trial-expiry prompts only after first-value milestone is reached.",
  "Test upgrade CTA copy tied to team coordination instead of generic plan language.",
  "Test a post-review prompt that pushes owner assignment before any billing CTA.",
  "Test an import completion prompt that offers onboarding or cleanup help."
];

export function getBillingSnapshotFromDashboard(input: DashboardConversionInput) {
  return normalizeBillingSnapshot({
    organizationId: input.organizationId,
    plan_tier: input.planTier,
    subscription_status: input.subscriptionStatus,
    billing_provider: input.billingProvider
  });
}

export function getOnboardingChecklist(input: DashboardConversionInput): OnboardingChecklistItem[] {
  const activation = getActivationStatus({
    organizationCreatedAt: input.organizationCreatedAt,
    totalContracts: input.totalContracts,
    reviewedContracts: input.reviewedContracts,
    ownerAssignedContracts: input.ownerAssignedContracts,
    liveObligationCount: input.renewalsDueSoon + input.noticeDeadlinesDueSoon,
    reminderCount: input.reminderCount,
    decisionCount: input.decisionCount,
    completedImportCount30d: input.completedImportCount30d
  });

  return [
    {
      key: "first_contract",
      label: "Add the first contract",
      description: "Get one renewal or notice obligation into the system.",
      completed: activation.firstContractAdded,
      href: "/dashboard/contracts/new"
    },
    {
      key: "first_review",
      label: "Review the first contract",
      description: "Confirm the extracted dates so the workflow becomes trustworthy.",
      completed: activation.firstReviewCompleted,
      href: "/dashboard/contracts?filter=needs_review"
    },
    {
      key: "first_owner",
      label: "Assign an owner",
      description: "Turn a contract record into an accountable workflow.",
      completed: activation.firstOwnerAssigned,
      href: "/dashboard/contracts"
    },
    {
      key: "first_risk_visible",
      label: "See one live risk or milestone",
      description: "Make sure at least one upcoming renewal or notice date is visible on the dashboard.",
      completed: activation.firstLiveObligationVisible,
      href: "/dashboard/contracts"
    }
  ];
}

export function getUpgradePrompts(input: DashboardConversionInput): UpgradePrompt[] {
  const billingSnapshot = getBillingSnapshotFromDashboard(input);
  const prompts: UpgradePrompt[] = [];
  const contractCapacity = getContractTrackingLimitResult(billingSnapshot, input.totalContracts);
  const trialDaysLeft = getTrialDaysRemaining(input.trialEndsAt);

  if (!contractCapacity.allowed || (contractCapacity.remaining !== null && contractCapacity.remaining <= 10)) {
    prompts.push({
      title: "Expand tracked contract coverage",
      message:
        contractCapacity.remaining === 0
          ? contractCapacity.message
          : `You are close to your active tracked contract limit. Upgrade before more renewals live outside the workflow.`,
      href: "/dashboard/settings",
      label: billingSnapshot.planTier === "free" ? "Move to Starter" : "Upgrade plan",
      tone: "primary"
    });
  }

  if (billingSnapshot.planTier === "starter" && input.ownerAssignedContracts >= 3 && input.reviewedContracts >= 3) {
    prompts.push({
      title: "Upgrade for team coordination",
      message:
        "You have the workflow working. Growth adds multi-recipient routing, escalations, and team delivery when renewals need wider accountability.",
      href: "/dashboard/settings",
      label: "Upgrade to Growth",
      tone: "primary"
    });
  }

  if (trialDaysLeft !== null && trialDaysLeft <= 5 && input.reviewedContracts > 0) {
    prompts.push({
      title: "Convert while the workflow is active",
      message:
        "You have already reached first value. Keep the renewal workflow live before the trial window closes.",
      href: "/dashboard/settings",
      label: "Choose a plan",
      tone: "secondary"
    });
  }

  return prompts;
}

export function getTrialDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

export { ACTIVATION_POLICY };
