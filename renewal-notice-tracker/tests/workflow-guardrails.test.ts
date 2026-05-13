import { describe, expect, it } from "vitest";
import {
  canGenerateTrustedReminders,
  summarizeWorkflowGuardrails,
  WORKFLOW_GUARDRAILS
} from "@/lib/contracts/workflow-guardrails";

describe("workflow guardrails", () => {
  it("blocks reminder automation while a contract still needs review", () => {
    expect(
      canGenerateTrustedReminders({
        metadata: {
          expiration_date: "2030-02-01",
          notice_deadline_date: "2030-01-01",
          needs_review: true
        },
        ownerUserId: "owner-1"
      })
    ).toBe(false);
  });

  it("blocks reminder automation while owner is missing", () => {
    expect(
      canGenerateTrustedReminders({
        metadata: {
          renewal_date: "2030-02-01",
          needs_review: false
        },
        ownerUserId: null
      })
    ).toBe(false);
  });

  it("summarizes due-soon review and owner blockers conservatively", () => {
    const summary = summarizeWorkflowGuardrails(
      [
        {
          id: "contract-1",
          created_at: "2030-01-01T00:00:00.000Z",
          owner_user_id: null,
          contract_metadata: {
            notice_deadline_date: "2030-01-10T00:00:00.000Z",
            needs_review: true
          }
        },
        {
          id: "contract-2",
          created_at: "2030-01-02T00:00:00.000Z",
          owner_user_id: "owner-1",
          renewal_decision_status: "undecided",
          cycle_status: "open",
          contract_metadata: {
            renewal_date: "2030-01-18T00:00:00.000Z",
            expiration_date: "2030-01-18T00:00:00.000Z",
            needs_review: false
          }
        },
        {
          id: "contract-3",
          created_at: "2030-01-02T00:00:00.000Z",
          owner_user_id: "owner-2",
          renewal_decision_status: "undecided",
          cycle_status: "awaiting_acknowledgment",
          contract_metadata: {
            notice_deadline_date: "2030-01-08T00:00:00.000Z",
            needs_review: false
          }
        }
      ],
      new Date("2030-01-05T00:00:00.000Z")
    );

    expect(summary.dueSoonNeedsReviewCount).toBe(1);
    expect(summary.dueSoonOwnerMissingCount).toBe(1);
    expect(summary.staleNeedsReviewCount).toBeGreaterThanOrEqual(1);
    expect(summary.decisionNeededCount).toBe(1);
    expect(summary.awaitingAcknowledgmentCount).toBe(1);
    expect(WORKFLOW_GUARDRAILS.dueSoonWindowDays).toBe(14);
  });
});
