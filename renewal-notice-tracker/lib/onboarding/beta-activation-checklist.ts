import type { OrganizationActivationState } from "@/lib/onboarding/activation-state";

export type BetaActivationChecklistItemId =
  | "upload_first_contract"
  | "review_extracted_deadline"
  | "assign_owner"
  | "enable_internal_reminders"
  | "download_calendar_event"
  | "record_first_decision";

export type BetaActivationChecklistStatus = "complete" | "available" | "blocked";

export type BetaActivationChecklistItem = {
  id: BetaActivationChecklistItemId;
  label: string;
  completed: boolean;
  status: BetaActivationChecklistStatus;
  href: string;
  shortHelp: string;
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
  message: string
): BetaSetupHealthCheck {
  return { id, label, status, message };
}

export function buildBetaActivationChecklist(input: {
  activation: OrganizationActivationState;
  emailConfigured?: boolean | null;
  calendarExportDownloaded?: boolean;
}): BetaActivationChecklist {
  const activation = input.activation;
  const contractHrefValue = contractHref(activation.recommendedContractId);
  const hasContract = activation.contractAssessments.length > 0;
  const hasReviewedDeadline = activation.contractAssessments.some((contract) => contract.noticeDeadlineReviewed);
  const hasOwner = activation.contractAssessments.some((contract) => contract.ownerAssigned);
  const hasDecision = activation.contractAssessments.some((contract) => contract.hasRenewalDecision);
  const reminderReady = activation.contractAssessments.some((contract) => contract.trustedReminderGate.canActivate);
  const hasReminder = activation.hasActiveTrustedReminder;
  const calendarAvailable = hasReviewedDeadline && Boolean(activation.recommendedContractId);

  const items: BetaActivationChecklistItem[] = [
    item({
      id: "upload_first_contract",
      label: "Upload first contract",
      completed: hasContract,
      href: "/dashboard/contracts/new",
      shortHelp: hasContract ? "Contract is in the workspace." : "Upload your first contract PDF."
    }),
    hasContract
      ? item({
          id: "review_extracted_deadline",
          label: "Review extracted deadline",
          completed: hasReviewedDeadline,
          href: contractHrefValue,
          shortHelp: hasReviewedDeadline
            ? "Notice deadline is reviewed."
            : "Confirm or correct the notice deadline."
        })
      : blockedItem({
          id: "review_extracted_deadline",
          label: "Review extracted deadline",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before reviewing extracted fields."
        }),
    hasContract
      ? item({
          id: "assign_owner",
          label: "Assign owner",
          completed: hasOwner,
          href: `${contractHrefValue}#owner-panel`,
          shortHelp: hasOwner ? "An accountable internal owner is assigned." : "Assign yourself or another internal owner."
        })
      : blockedItem({
          id: "assign_owner",
          label: "Assign owner",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before assigning ownership."
        }),
    reminderReady
      ? item({
          id: "enable_internal_reminders",
          label: "Enable internal reminders",
          completed: hasReminder,
          href: `${contractHrefValue}#reminders`,
          shortHelp: hasReminder
            ? "A trusted reminder clock is active."
            : "Use the default 30/14/7/3/0 reminder windows."
        })
      : blockedItem({
          id: "enable_internal_reminders",
          label: "Enable internal reminders",
          href: contractHrefValue,
          shortHelp: "Review deadline, owner, and evidence before reminders activate."
        }),
    calendarAvailable
      ? item({
          id: "download_calendar_event",
          label: "Download calendar event",
          completed: Boolean(input.calendarExportDownloaded),
          href: contractIcsHref(activation.recommendedContractId),
          shortHelp: "Put the reviewed deadline into Google Calendar, Outlook, or Apple Calendar."
        })
      : blockedItem({
          id: "download_calendar_event",
          label: "Download calendar event",
          href: "/dashboard/contracts/trusted-upcoming/ics",
          shortHelp: "Calendar export unlocks after a reviewed deadline exists."
        }),
    hasContract
      ? item({
          id: "record_first_decision",
          label: "Record first renewal decision",
          completed: hasDecision,
          href: `${contractHrefValue}#decision-panel`,
          shortHelp: hasDecision ? "First renewal decision is recorded." : "Record renew, cancel, renegotiate, defer, or accept risk."
        })
      : blockedItem({
          id: "record_first_decision",
          label: "Record first renewal decision",
          href: "/dashboard/contracts/new",
          shortHelp: "Upload a contract before recording a decision."
        })
  ];

  const completedCount = items.filter((checklistItem) => checklistItem.completed).length;
  const setupChecks: BetaSetupHealthCheck[] = [
    health(
      "email_configuration",
      "Email configuration",
      input.emailConfigured === true || hasReminder ? "healthy" : input.emailConfigured === false ? "needs_action" : "unknown",
      input.emailConfigured === true || hasReminder
        ? "Internal reminder email is ready."
        : "Send a test internal reminder to verify email before relying on alerts."
    ),
    health(
      "reminder_windows",
      "Reminder windows",
      hasReminder ? "healthy" : reminderReady ? "needs_action" : "blocked",
      hasReminder
        ? "Reminder clock is active."
        : reminderReady
          ? "Use the default 30/14/7/3/0 windows."
          : "Review the deadline and owner before reminder windows can be trusted."
    ),
    health(
      "contract_uploaded",
      "Contract uploaded",
      hasContract ? "healthy" : "needs_action",
      hasContract ? "At least one contract exists." : "Upload your first contract PDF."
    ),
    health(
      "trusted_notice_deadline",
      "Trusted notice deadline",
      hasReviewedDeadline ? "healthy" : hasContract ? "needs_action" : "blocked",
      hasReviewedDeadline ? "A reviewed deadline exists." : "Confirm or correct the extracted notice deadline."
    ),
    health(
      "owner_assigned",
      "Owner assigned",
      hasOwner ? "healthy" : hasContract ? "needs_action" : "blocked",
      hasOwner ? "At least one contract has an accountable owner." : "Assign an internal owner before the deadline."
    ),
    health(
      "calendar_export_available",
      "Calendar export",
      calendarAvailable ? "healthy" : "blocked",
      calendarAvailable ? "Reviewed deadlines can be downloaded as ICS." : "Calendar export needs a reviewed deadline."
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
