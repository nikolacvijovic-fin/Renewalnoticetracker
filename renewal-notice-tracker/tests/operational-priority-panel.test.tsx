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
            label: "Evidence weak",
            count: 3,
            description: "Contracts still waiting for reviewed truth.",
            href: "/dashboard/contracts?filter=needs_review",
            tone: "warning"
          },
          {
            label: "Owner gap",
            count: 2,
            description: "Contracts without owners block trusted reminders.",
            href: "/dashboard/contracts",
            tone: "warning"
          },
          {
            label: "Clock exposed",
            count: 2,
            description: "Obligations already entering the working queue.",
            href: "/dashboard/contracts?filter=active",
            tone: "critical"
          },
          {
            label: "Decision risk",
            count: 1,
            description: "Reviewed contracts still missing a decision.",
            href: "/dashboard/contracts",
            tone: "urgent"
          },
          {
            label: "Acknowledgment gap",
            count: 1,
            description: "High-risk reminders still need acknowledgment.",
            href: "/dashboard/contracts",
            tone: "warning"
          }
        ]}
      />
    );

    expect(screen.getByText("CFO risk queue")).toBeInTheDocument();
    expect(screen.getByText("Evidence weak")).toBeInTheDocument();
    expect(screen.getByText("Owner gap")).toBeInTheDocument();
    expect(screen.getByText("Clock exposed")).toBeInTheDocument();
    expect(screen.getByText("Decision risk")).toBeInTheDocument();
    expect(screen.getByText("Acknowledgment gap")).toBeInTheDocument();
    expect(screen.getByText("First value happens when one contract is reviewed and owned.")).toBeInTheDocument();
  });
});
