import type { OrganizationActivationState } from "@/lib/onboarding/activation-state";

export type BetaActivationChecklistItemId =
  | "organization_created"
  | "notification_email_verified"
  | "workspace_defaults_configured"
  | "upload_first_contract"
  | "upload_first_real_contract"
  | "review_extracted_deadline"
  | "assign_owner"
  | "enable_internal_reminders"
  | "download_calendar_event"
  | "record_first_decision"
  | "connect_subscription_provider"
  | "complete_first_provider_sync"
  | "review_first_recommendation"
  | "complete_founder_onboarding_call";

export type BetaActivationChecklistStatus = "complete" | "available" | "blocked";
export type BetaActivationScope = "workspace" | "target_contract";

export type BetaActivationChecklistItem = {
  id: BetaActivationChecklistItemId;
  label: string;
  completed: boolean;
  status: BetaActivationChecklistStatus;
  href: string;
  shortHelp: string;
  scope: BetaActivationScope;
  targetContractId: string | null;
};

export type BetaSetupHealthCheckId =
  | "email_configuration"
  | "reminder_windows"
  | "contract_uploaded"
  | "trusted_notice_deadline"
  | "owner_assigned"
  | "calendar_export_available";

export type BetaSetupHealthStatus = "healthy" | "needs_action" | "blocked" | "unknown";

export type BetaSetupHealthCheck = {
  id: BetaSetupHealthCheckId;
  label: string;
  status: BetaSetupHealthStatus;
  message: string;
  scope: BetaActivationScope;
  targetContractId: string | null;
};

export type BetaActivationChecklist = {
  items: BetaActivationChecklistItem[];
  setupChecks: BetaSetupHealthCheck[];
  completedCount: number;
  totalCount: number;
  firstIncompleteItem: BetaActivationChecklistItem | null;
  recommendedContractHref: string;
  customerSafeSummary: string;
};

function contractHref(contractId: string | null | undefined) {
  return contractId ? `/dashboard/contracts/${contractId}` : "/dashboard/contracts";
}

function contractIcsHref(contractId: string | null | undefined) {
  return contractId ? `/dashboard/contracts/${contractId}/ics` : "/dashboard/contracts/trusted-upcoming/ics";
}

function item(input: Omit<BetaActivationChecklistItem, "status">): BetaActivationChecklistItem {
  return {
    ...input,
    status: input.completed ? "complete" : "available"
  };
}

function blockedItem(input: Omit<BetaActivationChecklistItem, "status" | "completed">): BetaActivationChecklistItem {
  return {
    ...input,
    completed: false,
    status: "blocked"
  };
}

function health(
  id: BetaSetupHealthCheckId,
  label: string,
  status: BetaSetupHealthStatus,
  message: string,
  scope: BetaActivationScope,
  targetContractId: string | null = null
): BetaSetupHealthCheck {
  return { id, label, status, message, scope, targetContractId };
}

export function buildBetaActivationChecklist(input: {
  activation: OrganizationActivationState;
  emailConfigured?: boolean | null;
  calendarExportDownloaded?: boolean;
  designPartnerEvidence?: {
    organizationCreated: boolean;
    notificationEmailVerified: boolean;
    workspaceDefaultsConfigured: boolean;
    realContractUploaded: boolean;
    providerConnected: boolean;
    providerSyncCompleted: boolean;
    recommendationReviewed: boolean;
    founderOnboardingCallCompleted: boolean;
  };
}): BetaActivationChecklist {
  const activation = input.activation;
  const contractHrefValue = contractHref(activation.recommendedContractId);
  const targetContract =
    activation.contractAssessments.find((contract) => contract.contractId === activation.recommendedContractId) ??
    null;
  const targetContractId = targetContract?.contractId ?? null;
  const hasContract = activation.contractAssessments.length > 0;
  const hasReviewedDeadline = Boolean(targetContract?.noticeDeadlineReviewed);
  const hasOwner = Boolean(targetContract?.ownerAssigned);
  const hasDecision = Boolean(targetContract?.hasRenewalDecision);
  const reminderReady = Boolean(targetContract?.trustedReminderGate.canActivate);
  const hasReminder = Boolean(targetContract?.hasActiveTrustedReminder && targetContract.trustedReminderGate.canActivate);
  const calendarAvailable = hasReviewedDeadline && Boolean(activation.recommendedContractId);

  const items: BetaActivationChecklistItem[] = [
    item({
      id: "upload_first_contract",
      label: "Upload first contract",
      completed: hasContract,
      href: "/dashboard/contracts/new",
      shortHelp: hasContract ? "Contract is in the workspace." : "Upload your first contract PDF.",
      scope: "workspace",
      targetContractId: null
    }),
    hasContract
      ? item({
          id: "review_extracted_deadline",
          label: "Review extracted deadline",
          completed: hasReviewedDeadline,
          href: contractHrefValue,
          shortHelp: hasReviewedDeadline
            ? "Notice deadline is reviewed."
            : "Confirm or correct the notice deadline on the selected activation contract.",
          scope: "target_contract",
          targetContractId
        })
      : blockedItem({
          id: "review_extracted_deadline",
          label: "Review extracted deadline",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before reviewing extracted fields.",
          scope: "target_contract",
          targetContractId: null
        }),
    hasContract
      ? item({
          id: "assign_owner",
          label: "Assign owner",
          completed: hasOwner,
          href: `${contractHrefValue}#owner-panel`,
          shortHelp: hasOwner
            ? "An accountable internal owner is assigned to the selected activation contract."
            : "Assign yourself or another internal owner to the selected activation contract.",
          scope: "target_contract",
          targetContractId
        })
      : blockedItem({
          id: "assign_owner",
          label: "Assign owner",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before assigning ownership.",
          scope: "target_contract",
          targetContractId: null
        }),
    reminderReady
      ? item({
          id: "enable_internal_reminders",
          label: "Enable internal reminders",
          completed: hasReminder,
          href: `${contractHrefValue}#reminders`,
          shortHelp: hasReminder
            ? "A trusted reminder clock is active."
            : "Use the default 30/14/7/3/0 reminder windows for the selected activation contract.",
          scope: "target_contract",
          targetContractId
        })
      : blockedItem({
          id: "enable_internal_reminders",
          label: "Enable internal reminders",
          href: contractHrefValue,
          shortHelp: "Review deadline, owner, and evidence on the selected activation contract before reminders activate.",
          scope: "target_contract",
          targetContractId
        }),
    calendarAvailable
      ? item({
          id: "download_calendar_event",
          label: "Download calendar event",
          completed: Boolean(input.calendarExportDownloaded),
          href: contractIcsHref(activation.recommendedContractId),
          shortHelp: input.calendarExportDownloaded
            ? "Calendar event download is recorded for the selected activation contract."
            : "Put the selected activation contract deadline into Google Calendar, Outlook, or Apple Calendar.",
          scope: "target_contract",
          targetContractId
        })
      : blockedItem({
          id: "download_calendar_event",
          label: "Download calendar event",
          href: "/dashboard/contracts/trusted-upcoming/ics",
          shortHelp: "Calendar export unlocks after the selected activation contract has a reviewed deadline.",
          scope: "target_contract",
          targetContractId
        }),
    hasContract
      ? item({
          id: "record_first_decision",
          label: "Record first renewal decision",
          completed: hasDecision,
          href: `${contractHrefValue}#decision-panel`,
          shortHelp: hasDecision
            ? "First renewal decision is recorded on the selected activation contract."
            : "Record renew, terminate, renegotiate, defer, or no-action decision on the selected activation contract.",
          scope: "target_contract",
          targetContractId
        })
      : blockedItem({
          id: "record_first_decision",
          label: "Record first renewal decision",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before recording a decision.",
          scope: "target_contract",
          targetContractId: null
        })
  ];

  if (input.designPartnerEvidence) {
    const evidence = input.designPartnerEvidence;
    items.unshift(
      item({ id: "organization_created", label: "Organization created", completed: evidence.organizationCreated, href: "/dashboard/settings", shortHelp: "Organization setup is recorded.", scope: "workspace", targetContractId: null }),
      item({ id: "notification_email_verified", label: "Notification email verified", completed: evidence.notificationEmailVerified, href: "/dashboard/settings", shortHelp: evidence.notificationEmailVerified ? "Notification email verification is recorded." : "Verify the internal notification email.", scope: "workspace", targetContractId: null }),
      item({ id: "workspace_defaults_configured", label: "Timezone and reminder defaults", completed: evidence.workspaceDefaultsConfigured, href: "/dashboard/settings", shortHelp: evidence.workspaceDefaultsConfigured ? "Workspace defaults are recorded." : "Confirm timezone and reminder defaults.", scope: "workspace", targetContractId: null })
    );
    items.splice(4, 0, item({
      id: "upload_first_real_contract",
      label: "Upload first real contract",
      completed: evidence.realContractUploaded,
      href: "/dashboard/contracts/new",
      shortHelp: evidence.realContractUploaded ? "A non-sample contract is recorded." : "Upload a real contract; sample data does not count.",
      scope: "workspace",
      targetContractId: null
    }));
    items.push(
      item({ id: "connect_subscription_provider", label: "Connect Microsoft or Google", completed: evidence.providerConnected, href: "/dashboard/subscription-optimization", shortHelp: evidence.providerConnected ? "A provider connection is active." : "Connect an approved read-only subscription provider.", scope: "workspace", targetContractId: null }),
      item({ id: "complete_first_provider_sync", label: "Complete first provider sync", completed: evidence.providerSyncCompleted, href: "/dashboard/subscription-optimization", shortHelp: evidence.providerSyncCompleted ? "A provider snapshot completed." : "Run the first provider synchronization.", scope: "workspace", targetContractId: null }),
      item({ id: "review_first_recommendation", label: "Review first recommendation", completed: evidence.recommendationReviewed, href: "/dashboard/subscription-optimization", shortHelp: evidence.recommendationReviewed ? "A recommendation review is recorded." : "Accept, reject, defer, or investigate one recommendation.", scope: "workspace", targetContractId: null }),
      item({ id: "complete_founder_onboarding_call", label: "Founder onboarding call", completed: evidence.founderOnboardingCallCompleted, href: "/dashboard/support", shortHelp: evidence.founderOnboardingCallCompleted ? "Founder onboarding evidence is recorded." : "Ask the founder to record the onboarding call.", scope: "workspace", targetContractId: null })
    );
  }

  const completedCount = items.filter((checklistItem) => checklistItem.completed).length;
  const setupChecks: BetaSetupHealthCheck[] = [
    health(
      "email_configuration",
      "Email configuration",
      input.emailConfigured === true || hasReminder ? "healthy" : input.emailConfigured === false ? "needs_action" : "unknown",
      input.emailConfigured === true || hasReminder
        ? "Internal reminder email is ready."
        : "Configure sender and reply-to email before relying on internal alerts.",
      "workspace"
    ),
    health(
      "reminder_windows",
      "Reminder windows",
      hasReminder ? "healthy" : reminderReady ? "needs_action" : "blocked",
      hasReminder
        ? "Reminder clock is active."
        : reminderReady
          ? "Use the default 30/14/7/3/0 windows."
          : "Review the selected contract deadline and owner before reminder windows can be trusted.",
      "target_contract",
      targetContractId
    ),
    health(
      "contract_uploaded",
      "Contract uploaded",
      hasContract ? "healthy" : "needs_action",
      hasContract ? "At least one contract exists." : "Upload your first contract PDF.",
      "workspace"
    ),
    health(
      "trusted_notice_deadline",
      "Trusted notice deadline",
      hasReviewedDeadline ? "healthy" : hasContract ? "needs_action" : "blocked",
      hasReviewedDeadline
        ? "The selected activation contract has a reviewed deadline."
        : "Confirm or correct the selected activation contract notice deadline.",
      "target_contract",
      targetContractId
    ),
    health(
      "owner_assigned",
      "Owner assigned",
      hasOwner ? "healthy" : hasContract ? "needs_action" : "blocked",
      hasOwner
        ? "The selected activation contract has an accountable owner."
        : "Assign an internal owner to the selected activation contract before the deadline.",
      "target_contract",
      targetContractId
    ),
    health(
      "calendar_export_available",
      "Calendar export",
      calendarAvailable ? "healthy" : "blocked",
      calendarAvailable
        ? "The selected activation contract deadline can be downloaded as ICS."
        : "Calendar export needs a reviewed deadline on the selected activation contract.",
      "target_contract",
      targetContractId
    )
  ];

  return {
    items,
    setupChecks,
    completedCount,
    totalCount: items.length,
    firstIncompleteItem: items.find((checklistItem) => !checklistItem.completed) ?? null,
    recommendedContractHref: contractHrefValue,
    customerSafeSummary:
      completedCount === items.length
        ? "Your first renewal is under control."
        : "Complete the next operational step to get the first urgent renewal under control."
  };
}
