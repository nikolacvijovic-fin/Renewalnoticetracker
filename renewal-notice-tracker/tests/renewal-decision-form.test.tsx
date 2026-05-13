import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenewalDecisionForm } from "@/components/contracts/renewal-decision-form";

vi.mock("@/lib/actions/contracts", () => ({
  createRenewalDecisionAction: vi.fn(() => vi.fn())
}));

describe("RenewalDecisionForm", () => {
  it("uses only the shipped-first decision statuses", () => {
    render(<RenewalDecisionForm contractId="contract-1" />);

    expect(screen.getByRole("option", { name: "undecided" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "renew" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "terminate" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "renegotiate" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "defer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "no action required" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "closed" })).not.toBeInTheDocument();
  });
});
