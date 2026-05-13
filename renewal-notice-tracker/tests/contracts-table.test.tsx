import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractsTable } from "@/components/contracts/contracts-table";

describe("contracts table", () => {
  it("shows owner decoration and core metadata columns", () => {
    render(
      <ContractsTable
        contracts={[
          {
            id: "contract-1",
            status: "needs_review",
            created_at: "2026-01-01T00:00:00.000Z",
            owner_name: "Jane Doe",
            department: "Finance",
            status_tag: "active",
            contract_metadata: {
              contract_title: "MSA",
              counterparty_name: "Acme",
              renewal_date: "2026-12-31",
              expiration_date: "2026-12-31",
              notice_deadline_date: "2026-12-01",
              auto_renewal: true,
              needs_review: true
            }
          }
        ]}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Auto-renewal")).toBeInTheDocument();
    expect(screen.getByText("Conflict Requires Review")).toBeInTheDocument();
  });
});
