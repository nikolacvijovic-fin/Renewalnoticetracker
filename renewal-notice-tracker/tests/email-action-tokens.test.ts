import { describe, expect, it } from "vitest";
import {
  ReminderEmailActionTokenError,
  createReminderEmailActionToken,
  validateReminderEmailActionToken
} from "@/lib/email/action-tokens";

describe("reminder email action tokens", () => {
  it("validates a signed token payload", () => {
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "Owner@Example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "acknowledge",
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    expect(
      validateReminderEmailActionToken(
        token,
        "acknowledge",
        new Date("2030-01-02T00:00:00.000Z")
      )
    ).toMatchObject({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "acknowledge"
    });
  });

  it("rejects expired tokens", () => {
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "acknowledge",
      expiresAt: "2030-01-01T00:00:00.000Z"
    });

    expect(() =>
      validateReminderEmailActionToken(token, "acknowledge", new Date("2030-01-02T00:00:00.000Z"))
    ).toThrowError(ReminderEmailActionTokenError);
  });

  it("rejects wrong-action tokens", () => {
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "decision"
    });

    expect(() => validateReminderEmailActionToken(token, "acknowledge")).toThrowError(
      ReminderEmailActionTokenError
    );
  });
});
