export type RenewalDecisionLoopStage =
  | "detected"
  | "review_needed"
  | "owner_assigned"
  | "trusted_reminder_active"
  | "decision_needed"
  | "decision_recorded"
  | "cycle_closed";

export type RenewalDecisionLoopInput = {
  contractDetected: boolean;
  p0Reviewed: boolean;
  ownerAssigned: boolean;
  trustedReminderActive: boolean;
  decisionRecorded: boolean;
  cycleClosed: boolean;
};

export type RenewalDecisionLoop = {
  stage: RenewalDecisionLoopStage;
  nextAction: string;
  completedStages: RenewalDecisionLoopStage[];
};

export const RENEWAL_DECISION_LOOP_STAGES: RenewalDecisionLoopStage[] = [
  "detected",
  "review_needed",
  "owner_assigned",
  "trusted_reminder_active",
  "decision_needed",
  "decision_recorded",
  "cycle_closed"
];

export function deriveRenewalDecisionLoop(
  input: RenewalDecisionLoopInput
): RenewalDecisionLoop {
  const stage = deriveStage(input);

  return {
    stage,
    nextAction: getDecisionLoopNextAction(stage),
    completedStages: getCompletedDecisionLoopStages(input, stage)
  };
}

export function getDecisionLoopStageLabel(stage: RenewalDecisionLoopStage) {
  switch (stage) {
    case "detected":
      return "Detected";
    case "review_needed":
      return "Review needed";
    case "owner_assigned":
      return "Owner assignment";
    case "trusted_reminder_active":
      return "Trusted reminder active";
    case "decision_needed":
      return "Decision needed";
    case "decision_recorded":
      return "Decision recorded";
    case "cycle_closed":
      return "Cycle closed";
  }
}

function deriveStage(input: RenewalDecisionLoopInput): RenewalDecisionLoopStage {
  if (!input.contractDetected) return "detected";
  if (!input.p0Reviewed) return "review_needed";
  if (!input.ownerAssigned) return "owner_assigned";
  if (!input.trustedReminderActive) return "trusted_reminder_active";
  if (!input.decisionRecorded) return "decision_needed";
  if (input.cycleClosed) return "cycle_closed";
  return "decision_recorded";
}

function getCompletedDecisionLoopStages(
  input: RenewalDecisionLoopInput,
  currentStage: RenewalDecisionLoopStage
) {
  const completed: RenewalDecisionLoopStage[] = [];
  if (input.contractDetected) completed.push("detected");
  if (input.p0Reviewed) completed.push("review_needed");
  if (input.ownerAssigned) completed.push("owner_assigned");
  if (input.trustedReminderActive) completed.push("trusted_reminder_active");
  if (input.trustedReminderActive) completed.push("decision_needed");
  if (input.decisionRecorded) completed.push("decision_recorded");
  if (input.cycleClosed) completed.push("cycle_closed");

  return Array.from(new Set(completed)).filter((stage) => stage !== currentStage);
}

function getDecisionLoopNextAction(stage: RenewalDecisionLoopStage) {
  switch (stage) {
    case "detected":
      return "Import or select a contract to start the renewal loop.";
    case "review_needed":
      return "Complete P0 review before relying on the clock.";
    case "owner_assigned":
      return "Assign one accountable owner.";
    case "trusted_reminder_active":
      return "Activate or confirm trusted reminders.";
    case "decision_needed":
      return "Record the renewal decision.";
    case "decision_recorded":
      return "Monitor the loop until the cycle is closed.";
    case "cycle_closed":
      return "Current renewal cycle is closed.";
  }
}
