export type ActivationActionId =
  | "import_contracts"
  | "assign_owner"
  | "confirm_renewal_date"
  | "confirm_notice_deadline"
  | "review_auto_renew_terms"
  | "attach_evidence"
  | "request_trust_exception_approval"
  | "approve_trust_exception"
  | "activate_trusted_reminder"
  | "invite_teammate"
  | "review_at_risk_contract"
  | "maintain_activation";

export type ActivationNextBestAction = {
  id: ActivationActionId;
  label: string;
  description: string;
  targetHref: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  expectedTimeMinutes: number;
  blockingDependencies: string[];
  contractId?: string;
};

export type ActivationNextBestActionInput = {
  totalContracts: number;
  recommendedContractId: string | null;
  contractTitle: string | null;
  ownerAssigned: boolean;
  renewalDateReviewed: boolean;
  noticeDeadlineReviewed: boolean;
  autoRenewTermsReviewed: boolean;
  evidenceAttached: boolean;
  evidenceReviewed: boolean;
  evidenceTrusted: boolean;
  trustExceptionApprovalRequested: boolean;
  hasActiveTrustExceptionApproval: boolean;
  trustedReminderGateBlocked: boolean;
  hasActiveTrustedReminder: boolean;
  daysToNoticeDeadline: number | null;
};

function contractHref(contractId: string | null) {
  return contractId ? `/dashboard/contracts/${contractId}` : "/dashboard/contracts";
}

export function deriveActivationNextBestAction(
  input: ActivationNextBestActionInput
): ActivationNextBestAction {
  const targetHref = contractHref(input.recommendedContractId);
  const contractName = input.contractTitle ?? "the recommended contract";

  if (input.totalContracts === 0) {
    return {
      id: "import_contracts",
      label: "Add the first renewal contract",
      description: "Upload or enter one renewal so NoticeControl can build the first opt-out clock.",
      targetHref: "/dashboard/contracts/new",
      priority: "critical",
      reason: "The workspace is empty, so there is no contract to convert into a trusted reminder.",
      expectedTimeMinutes: 5,
      blockingDependencies: []
    };
  }

  if (!input.ownerAssigned) {
    return {
      id: "assign_owner",
      label: "Assign one accountable owner",
      description: `Assign an owner to ${contractName} before reminder workflow can be trusted.`,
      targetHref,
      priority: "critical",
      reason: "Trusted reminders require one accountable owner.",
      expectedTimeMinutes: 2,
      blockingDependencies: ["contract_selected"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.renewalDateReviewed) {
    return {
      id: "confirm_renewal_date",
      label: "Confirm the renewal date",
      description: `Review the renewal date on ${contractName} so the renewal clock has a real anchor.`,
      targetHref,
      priority: "high",
      reason: "Renewal date is missing or still under review.",
      expectedTimeMinutes: 3,
      blockingDependencies: ["owner_assigned"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.noticeDeadlineReviewed) {
    return {
      id: "confirm_notice_deadline",
      label: "Confirm the notice deadline",
      description: `Review the opt-out or notice deadline on ${contractName}.`,
      targetHref,
      priority: "critical",
      reason: "Activation is capped until a reviewed notice deadline exists.",
      expectedTimeMinutes: 4,
      blockingDependencies: ["renewal_date_confirmed"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.autoRenewTermsReviewed) {
    return {
      id: "review_auto_renew_terms",
      label: "Review auto-renewal terms",
      description: `Confirm whether ${contractName} auto-renews before trusting reminder automation.`,
      targetHref,
      priority: "high",
      reason: "Auto-renewal status is still unreviewed.",
      expectedTimeMinutes: 3,
      blockingDependencies: ["notice_deadline_confirmed"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.evidenceAttached) {
    return {
      id: "attach_evidence",
      label: "Attach renewal evidence",
      description: `Add evidence for the dates and renewal terms on ${contractName}.`,
      targetHref,
      priority: "high",
      reason: "Trusted reminders need evidence or a durable human exception approval.",
      expectedTimeMinutes: 5,
      blockingDependencies: ["review_auto_renew_terms"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.evidenceTrusted && input.trustExceptionApprovalRequested) {
    return {
      id: "approve_trust_exception",
      label: "Approve or reject the trust exception",
      description: `A reviewer must decide whether low-confidence evidence on ${contractName} can be accepted as a durable exception.`,
      targetHref,
      priority: "critical",
      reason: "Approval has been requested but no active durable approval exists.",
      expectedTimeMinutes: 5,
      blockingDependencies: ["evidence_reviewed"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.evidenceTrusted) {
    return {
      id: "request_trust_exception_approval",
      label: "Resolve weak evidence or request approval",
      description: `Improve the evidence on ${contractName}, or request a durable trust exception approval.`,
      targetHref,
      priority: "critical",
      reason: "Weak evidence cannot be treated as trusted without a durable approval record.",
      expectedTimeMinutes: 6,
      blockingDependencies: ["evidence_reviewed"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  if (!input.hasActiveTrustedReminder || input.trustedReminderGateBlocked) {
    return {
      id: "activate_trusted_reminder",
      label: "Activate the trusted reminder",
      description: `Create or regenerate the trusted reminder schedule for ${contractName}.`,
      targetHref,
      priority: input.daysToNoticeDeadline !== null && input.daysToNoticeDeadline <= 14 ? "critical" : "high",
      reason: "The contract is ready, but no active trusted reminder is present yet.",
      expectedTimeMinutes: 2,
      blockingDependencies: ["trusted_reminder_ready"],
      contractId: input.recommendedContractId ?? undefined
    };
  }

  return {
    id: "maintain_activation",
    label: "Keep the renewal clock healthy",
    description: "The first trusted reminder is active. Continue reviewing at-risk contracts and recording decisions.",
    targetHref: "/dashboard",
    priority: "low",
    reason: "The workspace has reached first trusted-reminder activation.",
    expectedTimeMinutes: 1,
    blockingDependencies: []
  };
}
