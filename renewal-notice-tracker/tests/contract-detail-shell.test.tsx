import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractDetailShell } from "@/components/contracts/contract-detail-shell";

describe("ContractDetailShell", () => {
  it("keeps the primary workflow above the secondary surfaces", () => {
    render(
      <ContractDetailShell
        title="Master services agreement"
        subtitle="Acme | Updated May 1, 2026"
        supportingLine="One workflow from review to closure."
        statusStrip={<div>Top strip content</div>}
        reviewPanel={<div>Review panel content</div>}
        ownerReminderPanel={<div>Owner reminder content</div>}
        decisionCyclePanel={<div>Decision cycle content</div>}
        secondaryPanel={<div>Secondary tabs content</div>}
      />
    );

    const topStrip = screen.getByLabelText("Top status and action strip");
    const reviewPanel = screen.getByLabelText("P0 review panel");
    const ownerReminderPanel = screen.getByLabelText("Owner and reminder panel");
    const decisionCyclePanel = screen.getByLabelText("Decision and cycle panel");
    const secondaryPanel = screen.getByLabelText("Secondary detail panels");

    expect(topStrip.compareDocumentPosition(reviewPanel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(reviewPanel.compareDocumentPosition(ownerReminderPanel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(ownerReminderPanel.compareDocumentPosition(decisionCyclePanel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(decisionCyclePanel.compareDocumentPosition(secondaryPanel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});
