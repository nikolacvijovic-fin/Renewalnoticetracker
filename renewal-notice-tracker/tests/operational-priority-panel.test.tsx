import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationalPriorityPanel } from "@/components/dashboard/operational-priority-panel";

describe("OperationalPriorityPanel", () => {
  it("renders the action-first dashboard queues", () => {
    render(
      <OperationalPriorityPanel
        firstValueSummary="First value happens when one contract is reviewed and owned."
        items={[
          {
            label: "Needs Review",
            count: 3,
            description: "Contracts still waiting for reviewed truth.",
            href: "/dashboard/contracts?filter=needs_review",
            tone: "warning"
          },
          {
            label: "Owner Missing",
            count: 2,
            description: "Contracts without owners block trusted reminders.",
            href: "/dashboard/contracts",
            tone: "warning"
          },
          {
            label: "Due Soon",
            count: 2,
            description: "Obligations already entering the working queue.",
            href: "/dashboard/contracts?filter=active",
            tone: "danger"
          },
          {
            label: "Decision Needed",
            count: 1,
            description: "Reviewed contracts still missing a decision.",
            href: "/dashboard/contracts",
            tone: "danger"
          },
          {
            label: "Awaiting Acknowledgment",
            count: 1,
            description: "High-risk reminders still need acknowledgment.",
            href: "/dashboard/contracts",
            tone: "warning"
          }
        ]}
      />
    );

    expect(screen.getByText("Needs action now")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Owner Missing")).toBeInTheDocument();
    expect(screen.getByText("Due Soon")).toBeInTheDocument();
    expect(screen.getByText("Decision Needed")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Acknowledgment")).toBeInTheDocument();
    expect(screen.getByText("First value happens when one contract is reviewed and owned.")).toBeInTheDocument();
  });
});
