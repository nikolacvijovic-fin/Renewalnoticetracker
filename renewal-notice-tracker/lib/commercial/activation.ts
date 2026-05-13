export const ACTIVATION_POLICY = {
  activationWindowDays: 14,
  postActivationEngagementWindowDays: 21,
  firstValueDefinition:
    "One uploaded contract is reviewed, has an owner, and has at least one live obligation or reminder-backed workflow artifact.",
  postActivationDefinition:
    "After first value, the account should show another meaningful workflow action such as review correction, decision capture, or reminder adoption within 21 days."
} as const;

export type ActivationStatus = {
  firstContractAdded: boolean;
  firstReviewCompleted: boolean;
  firstOwnerAssigned: boolean;
  firstLiveObligationVisible: boolean;
  firstValueAchieved: boolean;
  postActivationEngaged: boolean;
  activationWindowState: "within_window" | "at_risk" | "missed";
  rescueSignals: string[];
};

export function getActivationStatus(input: {
  organizationCreatedAt?: string | null;
  totalContracts: number;
  reviewedContracts: number;
  ownerAssignedContracts: number;
  liveObligationCount: number;
  reminderCount?: number;
  decisionCount?: number;
  completedImportCount30d?: number;
}) {
  const firstContractAdded = input.totalContracts > 0;
  const firstReviewCompleted = input.reviewedContracts > 0;
  const firstOwnerAssigned = input.ownerAssignedContracts > 0;
  const firstLiveObligationVisible = input.liveObligationCount > 0 || (input.reminderCount ?? 0) > 0;
  const firstValueAchieved =
    firstContractAdded && firstReviewCompleted && firstOwnerAssigned && firstLiveObligationVisible;
  const postActivationEngaged =
    firstValueAchieved && ((input.reminderCount ?? 0) > 1 || (input.decisionCount ?? 0) > 0);

  const ageDays = input.organizationCreatedAt
    ? (Date.now() - new Date(input.organizationCreatedAt).getTime()) / (24 * 60 * 60 * 1000)
    : 0;
  const activationWindowState: ActivationStatus["activationWindowState"] =
    firstValueAchieved
      ? "within_window"
      : ageDays > ACTIVATION_POLICY.activationWindowDays
        ? "missed"
        : ageDays >= ACTIVATION_POLICY.activationWindowDays - 3
          ? "at_risk"
          : "within_window";

  const rescueSignals = [
    (input.completedImportCount30d ?? 0) > 0 && !firstValueAchieved
      ? "Imports completed without activation. Route this account into review rescue or fixed-scope import help."
      : null,
    firstContractAdded && !firstReviewCompleted
      ? "Contracts are present but reviewed truth is still missing."
      : null,
    firstReviewCompleted && !firstOwnerAssigned
      ? "Reviewed contracts still lack an accountable owner."
      : null,
    firstOwnerAssigned && !firstLiveObligationVisible
      ? "Owners exist but no live obligation is visible yet."
      : null
  ].filter(Boolean) as string[];

  return {
    firstContractAdded,
    firstReviewCompleted,
    firstOwnerAssigned,
    firstLiveObligationVisible,
    firstValueAchieved,
    postActivationEngaged,
    activationWindowState,
    rescueSignals
  } satisfies ActivationStatus;
}
