import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReminderTimeline } from "@/components/contracts/reminder-timeline";

describe("ReminderTimeline", () => {
  it("renders reminder lifecycle states in operator language", () => {
    render(
      <ReminderTimeline
        reminders={[
          {
            id: "r-1",
            reminder_type: "renewal",
            remind_at: "2030-01-01T00:00:00.000Z",
            recipient_email: "owner@example.com",
            recipient_emails: ["owner@example.com"],
            status: "retry_pending",
            source: "system"
          },
          {
            id: "r-2",
            reminder_type: "decision_request",
            remind_at: "2030-01-10T00:00:00.000Z",
            recipient_email: "owner@example.com",
            recipient_emails: ["owner@example.com"],
            status: "superseded",
            source: "system"
          }
        ]}
      />
    );

    expect(screen.getByText("renewal")).toBeInTheDocument();
    expect(screen.getByText("Retrying")).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
  });

  it("surfaces blocked trusted-reminder states when no schedule is active", () => {
    render(<ReminderTimeline reminders={[]} blockedReason="blocked_by_missing_owner" />);

    expect(
      screen.getByText(/Trusted reminders are blocked until an owner is assigned/i)
    ).toBeInTheDocument();
  });
});
