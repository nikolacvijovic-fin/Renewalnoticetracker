import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn()
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: mocks.send
    }
  }))
}));

vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({
    public: { appUrl: "https://app.noticecontrol.test" },
    email: {
      resendApiKey: "test-resend-key",
      replyToEmail: null
    }
  })
}));

import { sendRenewalActionRequestEmail } from "@/lib/email/send-reminder";

const baseParams = {
  organizationId: "org-1",
  recipientEmail: "owner@example.com",
  contractId: "contract-1",
  contractTitle: "Acme MSA",
  counterpartyName: "Acme",
  requestedActionLabel: "decide renewal",
  noticeDeadlineDate: "2030-01-01",
  renewalDate: "2030-02-01",
  expirationDate: null,
  dueAt: "2030-01-01",
  ownerLabel: "Owner",
  contractValueAmount: 100000,
  contractValueCurrency: "USD",
  requesterLabel: "Operator",
  message: "Please review."
};

describe("renewal action request email provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ data: { id: "email-1" } });
  });

  it("passes the stable delivery key as a provider idempotency header", async () => {
    await sendRenewalActionRequestEmail({
      ...baseParams,
      deliveryKey: "renewal_action_request:request-1:email"
    });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "Idempotency-Key": "renewal_action_request:request-1:email"
        }
      })
    );
  });

  it("does not send an idempotency header when no delivery key is available", async () => {
    await sendRenewalActionRequestEmail(baseParams);

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: undefined
      })
    );
  });
});
