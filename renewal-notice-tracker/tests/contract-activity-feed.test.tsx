import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ContractActivityFeed,
  summarizeAuditDetails
} from "@/components/contracts/contract-activity-feed";

describe("ContractActivityFeed", () => {
  it("renders workflow activity without dumping raw JSON", () => {
    render(
      <ContractActivityFeed
        auditLogs={[
          {
            id: "log-1",
            action: "contract.review_updated",
            entity_type: "contract",
            entity_id: "contract-1",
            actor_user_id: "user-1",
            created_at: "2026-05-01T00:00:00.000Z",
            details: {
              needs_review: false,
              cycle_status: "awaiting_decision",
              reminder_regenerated_count: 5,
              superseded_reminder_count: 2,
              processing_status: "scheduled"
            }
          }
        ]}
        actorLabels={{ "user-1": "Alex Reviewer" }}
      />
    );

    expect(screen.getByText("Contract: review updated")).toBeInTheDocument();
    expect(screen.getByText(/Actor: Alex Reviewer/i)).toBeInTheDocument();
    expect(screen.getByText(/Affected object: contract/i)).toBeInTheDocument();
    expect(screen.getByText("Marked review complete")).toBeInTheDocument();
    expect(screen.getByText("Cycle state: awaiting decision")).toBeInTheDocument();
    expect(screen.getByText("Trusted reminders scheduled")).toBeInTheDocument();
    expect(screen.getByText("Superseded 2 prior reminders")).toBeInTheDocument();
    expect(screen.queryByText(/"needs_review"/)).not.toBeInTheDocument();
  });

  it("summarizes audit details into operator-readable lines", () => {
    expect(
      summarizeAuditDetails({
        renewal_decision_status: "terminate",
        acknowledged_at: "2026-05-01T00:00:00.000Z"
      })
    ).toEqual(["Decision: terminate", "Acknowledgment recorded"]);
  });
});
