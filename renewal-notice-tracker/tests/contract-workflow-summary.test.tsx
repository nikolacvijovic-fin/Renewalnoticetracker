import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractWorkflowSummary } from "@/components/contracts/contract-workflow-summary";

describe("ContractWorkflowSummary", () => {
  it("renders the calm operator loop summary", () => {
    render(
      <ContractWorkflowSummary
        nextAction={{
          label: "Complete P0 review",
          help: "Confirm the five reminder-driving fields before trusting automation."
        }}
        items={[
          { label: "Trust state", value: "Needs Review", help: "Review is still blocking reminders." },
          { label: "Review", value: "Exception review pending", help: "Confirm the P0 record." },
          { label: "Owner", value: "Unassigned", help: "Assign one accountable owner." },
          { label: "Due", value: "Blocked by review", help: "Review is not complete yet." },
          { label: "Decision", value: "undecided", help: "Cycle state: open." }
        ]}
      />
    );

    expect(screen.getByText("Next action")).toBeInTheDocument();
    expect(screen.getByText("Complete P0 review")).toBeInTheDocument();
    expect(screen.getByText("Trust state")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Blocked by review")).toBeInTheDocument();
    expect(screen.getByText("Assign one accountable owner.")).toBeInTheDocument();
  });

  it.each([
    ["Needs Review", "Complete P0 review"],
    ["Owner Missing", "Assign the accountable owner"],
    ["Decision Needed", "Record the renewal decision"],
    ["Awaiting Acknowledgment", "Record acknowledgment"]
  ])("surfaces the next action for %s", (_state, nextActionLabel) => {
    render(
      <ContractWorkflowSummary
        nextAction={{
          label: nextActionLabel,
          help: "Operator-facing next step."
        }}
        items={[
          { label: "Trust state", value: _state, help: "Current workflow trust state." },
          { label: "Review", value: "Review complete", help: "The P0 record is confirmed." },
          { label: "Owner", value: "Pat Lee", help: "Assigned owner." },
          { label: "Due", value: "Notice deadline | May 30, 2026", help: "Upcoming action." },
          { label: "Decision", value: "undecided", help: "Cycle state: open." }
        ]}
      />
    );

    expect(screen.getAllByText(nextActionLabel).length).toBeGreaterThan(0);
  });
});
