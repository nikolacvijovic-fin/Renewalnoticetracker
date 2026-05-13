import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";

describe("OnboardingChecklist", () => {
  it("renders activation window messaging and rescue signals", () => {
    render(
      <OnboardingChecklist
        items={[
          {
            key: "first_contract",
            label: "Add the first contract",
            description: "Start the workflow.",
            completed: true,
            href: "/dashboard/contracts/new"
          }
        ]}
        firstValueMilestone="One reviewed contract with an owner and a live obligation."
        activationWindowLabel="Activation window: 14 days"
        activationStatus={{
          firstContractAdded: true,
          firstReviewCompleted: false,
          firstOwnerAssigned: false,
          firstLiveObligationVisible: false,
          firstValueAchieved: false,
          postActivationEngaged: false,
          activationWindowState: "at_risk",
          rescueSignals: ["Imports completed without activation. Route this account into review rescue."]
        }}
      />
    );

    expect(screen.getByText("Activation window: 14 days")).toBeInTheDocument();
    expect(screen.getByText(/Imports completed without activation/i)).toBeInTheDocument();
  });
});
