import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractsTable } from "@/components/contracts/contracts-table";

describe("contracts table", () => {
  it("shows owner decoration and core metadata columns with risk detail for allowed viewers", () => {
    render(
      <ContractsTable
        contracts={[
          {
            id: "contract-1",
            status: "needs_review",
            created_at: "2026-01-01T00:00:00.000Z",
            owner_name: "Jane Doe",
            owner_user_id: "owner-1",
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
        riskViewer={{
          userId: "reviewer-1",
          role: "reviewer",
          showRiskBadge: true,
          showRiskExplanation: true
        }}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Auto-renewal")).toBeInTheDocument();
    expect(screen.getByText("Conflict Requires Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show risk details for msa/i })).toBeInTheDocument();
    expect(screen.getByText(/Low confidence/i)).toBeInTheDocument();
  });

  it("limits owners to risk visibility on their own contracts", () => {
    render(
      <ContractsTable
        contracts={[
          {
            id: "contract-1",
            status: "needs_review",
            created_at: "2026-01-01T00:00:00.000Z",
            owner_name: "Jane Doe",
            owner_user_id: "owner-1",
            department: "Finance",
            status_tag: "active",
            contract_metadata: {
              contract_title: "Owned Contract",
              counterparty_name: "Acme",
              renewal_date: "2026-12-31",
              expiration_date: "2026-12-31",
              notice_deadline_date: "2026-12-01",
              auto_renewal: true,
              needs_review: false
            }
          },
          {
            id: "contract-2",
            status: "active",
            created_at: "2026-01-01T00:00:00.000Z",
            owner_name: "Someone Else",
            owner_user_id: "owner-2",
            department: "Legal",
            status_tag: "active",
            contract_metadata: {
              contract_title: "Foreign Contract",
              counterparty_name: "Globex",
              renewal_date: "2026-11-30",
              expiration_date: "2026-11-30",
              notice_deadline_date: "2026-11-01",
              auto_renewal: false,
              needs_review: false
            }
          }
        ]}
        riskViewer={{
          userId: "owner-1",
          role: "owner",
          showRiskBadge: true,
          showRiskExplanation: true
        }}
      />
    );

    expect(screen.getByRole("button", { name: /show risk details for owned contract/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show risk details for foreign contract/i })).not.toBeInTheDocument();
  });

  it("marks fictional onboarding sample contracts clearly", () => {
    render(
      <ContractsTable
        contracts={[
          {
            id: "sample-contract-1",
            status: "reviewed",
            is_sample: true,
            created_at: "2026-01-01T00:00:00.000Z",
            owner_name: "Founder",
            owner_user_id: "user-1",
            department: "Finance",
            status_tag: "renewal_watch",
            contract_metadata: {
              contract_title: "Sample SaaS Renewal Agreement",
              counterparty_name: "Acme Analytics Cloud",
              renewal_date: "2026-12-31",
              expiration_date: "2026-12-31",
              notice_deadline_date: "2026-12-01",
              auto_renewal: true,
              needs_review: false
            }
          }
        ]}
      />
    );

    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("Fictional contract for onboarding")).toBeInTheDocument();
  });
});
