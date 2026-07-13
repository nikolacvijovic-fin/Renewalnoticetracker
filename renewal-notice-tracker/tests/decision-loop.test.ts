import { describe, expect, it } from "vitest";
import { deriveRenewalDecisionLoop } from "@/lib/contracts/decision-loop";

describe("renewal decision loop", () => {
  it.each([
    [
      "review_needed",
      {
        contractDetected: true,
        p0Reviewed: false,
        ownerAssigned: false,
        trustedReminderActive: false,
        decisionRecorded: false,
        cycleClosed: false
      },
      "Complete P0 review before relying on the clock."
    ],
    [
      "owner_assigned",
      {
        contractDetected: true,
        p0Reviewed: true,
        ownerAssigned: false,
        trustedReminderActive: false,
        decisionRecorded: false,
        cycleClosed: false
      },
      "Assign one accountable owner."
    ],
    [
      "decision_needed",
      {
        contractDetected: true,
        p0Reviewed: true,
        ownerAssigned: true,
        trustedReminderActive: true,
        decisionRecorded: false,
        cycleClosed: false
      },
      "Record the renewal decision."
    ],
    [
      "cycle_closed",
      {
        contractDetected: true,
        p0Reviewed: true,
        ownerAssigned: true,
        trustedReminderActive: true,
        decisionRecorded: true,
        cycleClosed: true
      },
      "Current renewal cycle is closed."
    ]
  ])("derives %s as the current renewal loop stage", (stage, input, nextAction) => {
    const loop = deriveRenewalDecisionLoop(input);

    expect(loop.stage).toBe(stage);
    expect(loop.nextAction).toBe(nextAction);
  });

  it("keeps completed loop stages distinct from the current stage", () => {
    const loop = deriveRenewalDecisionLoop({
      contractDetected: true,
      p0Reviewed: true,
      ownerAssigned: true,
      trustedReminderActive: true,
      decisionRecorded: false,
      cycleClosed: false
    });

    expect(loop.stage).toBe("decision_needed");
    expect(loop.completedStages).toEqual([
      "detected",
      "review_needed",
      "owner_assigned",
      "trusted_reminder_active"
    ]);
  });
});
