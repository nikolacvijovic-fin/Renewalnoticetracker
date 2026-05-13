import { describe, expect, it, vi } from "vitest";
import {
  canEnterReminderGenerationState,
  canTransitionContractStatus,
  deriveContractReminderActivationState,
  initialManualContractStatus,
  nextReviewedContractStatus,
  transitionContractStatus
} from "@/lib/contracts/lifecycle";

describe("contract lifecycle", () => {
  it("allows the happy-path extraction flow", () => {
    expect(canTransitionContractStatus("uploaded", "queued_for_text_extraction")).toBe(true);
    expect(canTransitionContractStatus("queued_for_text_extraction", "extracting_text")).toBe(true);
    expect(canTransitionContractStatus("extracting_text", "text_extracted")).toBe(true);
    expect(canTransitionContractStatus("text_extracted", "queued_for_field_extraction")).toBe(true);
    expect(canTransitionContractStatus("queued_for_field_extraction", "extracting_fields")).toBe(true);
    expect(canTransitionContractStatus("extracting_fields", "needs_review")).toBe(true);
  });

  it("blocks invalid jumps that skip critical stages", () => {
    expect(canTransitionContractStatus("uploaded", "reminders_scheduled")).toBe(false);
    expect(canTransitionContractStatus("extracting_text", "reviewed")).toBe(false);
    expect(canTransitionContractStatus("archived", "needs_review")).toBe(false);
    expect(canTransitionContractStatus("needs_review", "reminder_generation_pending")).toBe(false);
  });

  it("derives review-driven statuses predictably", () => {
    expect(initialManualContractStatus(true)).toBe("needs_review");
    expect(initialManualContractStatus(false)).toBe("reviewed");
    expect(nextReviewedContractStatus(true)).toBe("needs_review");
    expect(nextReviewedContractStatus(false)).toBe("reviewed");
  });

  it("derives reminder activation separately from processing and cycle state", () => {
    expect(
      deriveContractReminderActivationState({
        needsReview: false,
        ownerUserId: null,
        noticeDeadlineDate: "2030-01-01"
      })
    ).toBe("blocked_by_missing_owner");
    expect(
      canEnterReminderGenerationState({
        needsReview: false,
        ownerUserId: "owner-1",
        noticeDeadlineDate: "2030-01-01"
      })
    ).toBe(true);
  });

  it("scopes contract status transitions by organization id", async () => {
    const eqMock = vi.fn().mockReturnThis();
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        status: "uploaded",
        owner_user_id: null,
        contract_metadata: {
          needs_review: true,
          notice_deadline_date: null,
          renewal_date: null,
          expiration_date: null
        }
      },
      error: null
    });
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateQuery = {
      eq: vi.fn((column: string, value: string) => {
        if (column === "id") {
          return {
            eq: updateEqMock
          };
        }

        return updateQuery;
      })
    };
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: eqMock.mockReturnValue({
              single: singleMock
            })
          }))
        })),
        update: vi.fn(() => updateQuery)
      }))
    };

    await transitionContractStatus(
      client as never,
      "11111111-1111-4111-8111-111111111111",
      "org-1",
      "queued_for_text_extraction"
    );

    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-1");
    expect(updateEqMock).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("throws when reminder generation is requested before owner assignment or confirmed P0 truth exist", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  status: "reviewed",
                  owner_user_id: null,
                  contract_metadata: {
                    needs_review: false,
                    notice_deadline_date: "2030-01-01",
                    renewal_date: null,
                    expiration_date: null
                  }
                },
                error: null
              })
            }))
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
          }))
        }))
      }))
    };

    await expect(
      transitionContractStatus(
        client as never,
        "11111111-1111-4111-8111-111111111111",
        "org-1",
        "reminder_generation_pending"
      )
    ).rejects.toThrow("Reminder generation requires reviewed P0, owner assignment, and confirmed P0 dates.");
  });
});
