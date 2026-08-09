import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualRenewalTemplatePanel } from "@/components/contracts/manual-renewal-template-panel";

const { recordRenewalManualTemplateCopyAction } = vi.hoisted(() => ({
  recordRenewalManualTemplateCopyAction: vi.fn()
}));

vi.mock("@/lib/actions/contracts", () => ({
  recordRenewalManualTemplateCopyAction
}));

describe("ManualRenewalTemplatePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    recordRenewalManualTemplateCopyAction.mockResolvedValue({ ok: true });
  });

  it("renders manual-only cancellation and renegotiation copy without recipient or send controls", async () => {
    render(
      <ManualRenewalTemplatePanel
        contractId="contract-1"
        renewalDecisionStatus="terminate"
        initialInput={{
          contractTitle: "Acme MSA",
          counterpartyName: "Acme",
          renewalDate: "2026-10-01",
          expirationDate: "2026-10-31",
          noticeDeadlineDate: "2026-09-01"
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Manual action templates" })).toBeInTheDocument();
    expect(screen.getAllByText(/NoticeControl does not send this to the vendor/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(/cancellation \/ opt-out/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Please confirm in writing/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/recipient|vendor email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy cancellation notice" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Subject:"));
    });
    await waitFor(() => {
      expect(recordRenewalManualTemplateCopyAction).toHaveBeenCalledWith("contract-1", "cancellation_notice");
    });
    expect(JSON.stringify(recordRenewalManualTemplateCopyAction.mock.calls)).not.toMatch(/notice_sent|provider|delivery/i);
  });

  it("prefers renegotiation copy when the saved decision is renegotiate", () => {
    render(
      <ManualRenewalTemplatePanel
        contractId="contract-1"
        renewalDecisionStatus="renegotiate"
        initialInput={{
          contractTitle: "Beta Subscription",
          counterpartyName: "Beta",
          renewalDate: "2026-11-15",
          noticeDeadlineDate: "2026-10-15"
        }}
      />
    );

    expect(screen.getByDisplayValue(/renewal discussion/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy renegotiation request" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/discuss pricing, terms/i)).toBeInTheDocument();
  });
});
