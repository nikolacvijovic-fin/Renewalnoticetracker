import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import type { RiskExplanationModel } from "@/lib/intelligence/risk/dashboard";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

function makeExplanation(
  overrides: Partial<RiskExplanationModel> = {}
): RiskExplanationModel {
  return {
    contractId: "contract-1",
    contractTitle: "Global MSA",
    counterpartyName: "Acme Vendor",
    department: "Legal",
    ownerLabel: "Unassigned",
    workflowTrustState: "Needs Review",
    riskBand: "critical",
    confidenceLevel: "low",
    reasons: [
      {
        factor: "notice_deadline_proximity",
        label: "Notice deadline",
        points: 35,
        detail: "Notice deadline is due within 7 days."
      },
      {
        factor: "missing_owner",
        label: "Missing owner",
        points: 14,
        detail: "No owner is assigned to carry the renewal workflow."
      }
    ],
    missingDataWarnings: [
      {
        code: "missing_contract_value",
        message: "Contract value is missing, so exposure-related risk is understated.",
        severity: "warning"
      }
    ],
    lastCalculatedAt: "2026-05-17T12:00:00.000Z",
    explanationMetadata: {
      calculation_version: "risk_score.v1",
      input_data_version: "trusted_workflow_state.v1",
      trusted_fields_used: ["notice_deadline_date", "owner_user_id"],
      low_confidence_fields_used: ["review_status"],
      excluded_fields: ["contract_value_amount"],
      warnings: [
        {
          code: "missing_contract_value",
          message: "Contract value is missing, so exposure-related risk is understated.",
          severity: "warning"
        }
      ]
    },
    dueLabel: "Notice deadline",
    dueDate: "2026-05-20",
    nextActionLabel: "Review P0",
    guidance: "Review the P0 record before trusted workflow can move forward.",
    actionLinks: [
      { label: "Review P0", href: "/dashboard/contracts/contract-1#review-panel" },
      { label: "Assign owner", href: "/dashboard/contracts/contract-1#review-panel" },
      { label: "Record decision", href: "/dashboard/contracts/contract-1#decision-panel" },
      { label: "Acknowledge", href: "/dashboard/contracts/contract-1#acknowledgment-panel" },
      { label: "Open contract", href: "/dashboard/contracts/contract-1" }
    ],
    ...overrides
  };
}

describe("RiskExplanationDrawer", () => {
  it("renders critical reasons, low confidence, warnings, and workflow action links without legal-advice copy", () => {
    render(<RiskExplanationDrawer explanation={makeExplanation()} />);

    fireEvent.click(screen.getByRole("button", { name: /show risk details for global msa/i }));

    expect(
      screen.getByRole("dialog", { name: /global msa risk explanation/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Low confidence").length).toBeGreaterThan(0);
    expect(screen.getByText("Notice deadline is due within 7 days.")).toBeInTheDocument();
    expect(screen.getByText("No owner is assigned to carry the renewal workflow.")).toBeInTheDocument();
    expect(
      screen.getByText("Contract value is missing, so exposure-related risk is understated.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review P0" })).toHaveAttribute(
      "href",
      "/dashboard/contracts/contract-1#review-panel"
    );
    expect(screen.getByRole("link", { name: "Record decision" })).toHaveAttribute(
      "href",
      "/dashboard/contracts/contract-1#decision-panel"
    );
    expect(screen.getByRole("link", { name: "Acknowledge" })).toHaveAttribute(
      "href",
      "/dashboard/contracts/contract-1#acknowledgment-panel"
    );
    expect(screen.queryByText(/legal action/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bterminate\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Renew$/i)).not.toBeInTheDocument();
  });
});
